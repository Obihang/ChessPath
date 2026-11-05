import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import WebSocket from 'ws';
import {
  TRUSTED_CLIENT_TOKEN,
  SEC_MS_GEC_VERSION,
  generateSecMsGecV2,
  generateMuid,
} from './src/utils/edgeDrm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getServerGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// --- Edge Neural TTS Helpers ---
function synthesizeEdgeWebSocket(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const secMsGec = generateSecMsGecV2();
    const connectId = crypto.randomBytes(16).toString('hex');
    const muid = generateMuid();
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId}`;

    let settled = false;
    const audioChunks: Buffer[] = [];

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `muid=${muid};`,
      },
    });

    const finish = (err?: Error, data?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // Ignore
      }
      if (err) reject(err);
      else resolve(data || Buffer.alloc(0));
    };

    const timer = setTimeout(() => {
      finish(new Error('Edge TTS WebSocket timed out after 6000ms'));
    }, 6000);

    ws.on('open', () => {
      const langMatch = voice.match(/^[a-z]{2}-[A-Z]{2}/);
      const xmlLang = langMatch ? langMatch[0] : 'en-US';
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
      const timestamp = new Date().toUTCString();

      const configMsg =
        `X-Timestamp:${timestamp}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      const ssmlMsg =
        `X-RequestId:${connectId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapedText}</prosody></voice></speak>`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (rawData: WebSocket.RawData, isBinary: boolean) => {
      const data = Buffer.isBuffer(rawData)
        ? rawData
        : Array.isArray(rawData)
        ? Buffer.concat(rawData)
        : Buffer.from(rawData as ArrayBuffer);

      if (isBinary) {
        if (data.length > 2) {
          const headerLen = data.readUInt16BE(0);
          if (data.length > 2 + headerLen) {
            const headerStr = data.subarray(2, 2 + headerLen).toString('utf8');
            if (headerStr.includes('Path:audio')) {
              const audioPayload = data.subarray(2 + headerLen);
              if (audioPayload.length > 0) {
                audioChunks.push(Buffer.from(audioPayload));
              }
            }
          }
        }
      } else {
        if (data.toString('utf8').includes('Path:turn.end')) {
          if (audioChunks.length > 0) {
            finish(undefined, Buffer.concat(audioChunks));
          } else {
            finish(new Error('Edge TTS turn ended with no audio chunks'));
          }
        }
      }
    });

    ws.on('error', (err) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on('close', () => {
      if (audioChunks.length > 0) {
        finish(undefined, Buffer.concat(audioChunks));
      } else {
        finish(new Error('Edge TTS WebSocket closed before audio arrived'));
      }
    });
  });
}

function splitTextIntoTtsChunks(text: string, maxLen = 180): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.slice(0, maxLen);
    } else if (current.length + 1 + word.length <= maxLen) {
      current += ` ${word}`;
    } else {
      chunks.push(current);
      current = word.slice(0, maxLen);
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

async function synthesizeFallbackMp3(text: string, voice: string): Promise<Buffer> {
  const tl = voice.startsWith('en-GB') ? 'en-GB' : 'en-US';
  const chunks = splitTextIntoTtsChunks(text, 180);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(chunk)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      throw new Error(`Fallback TTS HTTP ${response.status}`);
    }
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > 0) {
      buffers.push(Buffer.from(arrayBuf));
    }
  }

  if (buffers.length === 0) {
    throw new Error('Fallback TTS returned empty audio');
  }
  return Buffer.concat(buffers);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // --- Edge Neural TTS Endpoint ---
  app.get('/api/edge-tts', async (req, res) => {
    const voice = (req.query.voice as string) || 'en-US-AndrewNeural';
    const text = ((req.query.text as string) || '').trim().slice(0, 600);

    if (!text) {
      res.status(400).send('Missing text parameter');
      return;
    }

    let mp3Buffer: Buffer | null = null;
    let ttsEngineUsed: 'edge-neural' | 'google-fallback' = 'edge-neural';

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const edgeBuf = await synthesizeEdgeWebSocket(text, voice);
        if (edgeBuf && edgeBuf.length > 100) {
          mp3Buffer = edgeBuf;
          ttsEngineUsed = 'edge-neural';
          break;
        }
      } catch {
        // Retry once on transient WebSocket error before falling back
      }
    }

    if (!mp3Buffer) {
      try {
        mp3Buffer = await synthesizeFallbackMp3(text, voice);
        ttsEngineUsed = 'google-fallback';
      } catch (err: any) {
        res.status(502).json({ error: err?.message || 'TTS synthesis failed' });
        return;
      }
    }

    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3Buffer.length));
    res.setHeader('X-TTS-Engine', ttsEngineUsed);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(mp3Buffer);
  });

  // --- Server-Side Gemini API Routes ---
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, systemInstruction, model } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing prompt string' });
        return;
      }

      const ai = getServerGeminiClient();
      const targetModel = model || 'gemini-3.8-flash';

      let response: GenerateContentResponse;
      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: prompt,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          targetModel !== 'gemini-3.8-flash' &&
          (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound'))
        ) {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: systemInstruction ? { systemInstruction } : undefined,
          });
        } else {
          throw err;
        }
      }

      res.json({ text: (response.text || '').trim() });
    } catch (err: any) {
      const status = err?.status && typeof err.status === 'number' ? err.status : 500;
      res.status(status).json({
        error: err?.message || 'Server Gemini generation failed',
      });
    }
  });

  app.post('/api/gemini/stream', async (req, res) => {
    try {
      const { prompt, systemInstruction, model } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing prompt string' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const ai = getServerGeminiClient();
      const streamResponse = await ai.models.generateContentStream({
        model: model || 'gemini-3.8-flash',
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined,
      });

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        if (c.text) {
          res.write(`data: ${JSON.stringify({ text: c.text })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err?.message || 'Stream error' })}\n\n`);
      res.end();
    }
  });

  app.post('/api/gemini/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body || {};
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Missing audioBase64 payload' });
        return;
      }

      const ai = getServerGeminiClient();
      const audioPart = {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: audioBase64,
        },
      };
      const promptPart = { text: 'Transcribe exactly, return only the transcript' };

      let response: GenerateContentResponse;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: { parts: [audioPart, promptPart] },
        });
      } catch (primaryErr: any) {
        const errMsg = primaryErr?.message || '';
        if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('NotFound')) {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: { parts: [audioPart, promptPart] },
          });
        } else {
          throw primaryErr;
        }
      }

      res.json({
        success: true,
        transcript: (response.text || '').trim(),
      });
    } catch (err: any) {
      const status = err?.status && typeof err.status === 'number' ? err.status : 500;
      res.status(status).json({
        success: false,
        error: err?.message || 'Gemini audio transcription failed',
      });
    }
  });

  app.post('/api/gemini/test', async (_req, res) => {
    try {
      const ai = getServerGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: 'Say "Chess coach connection verified!" in one short sentence.',
      });
      res.json({
        success: true,
        reply: (response.text || '').trim() || 'Connected to Gemini successfully!',
      });
    } catch (err: any) {
      const status = err?.status && typeof err.status === 'number' ? err.status : 500;
      res.status(status).json({
        success: false,
        error: err?.message || 'Failed to connect to Gemini.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
