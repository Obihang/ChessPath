import express from 'express';
import crypto from 'crypto';
import tls from 'tls';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

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
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '132.0.2957.140';
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

function generateSecMsGec(): string {
  const ticks = Math.floor(Date.now() / 1000 + 11644473600);
  const rounded = ticks - (ticks % 300);
  const windowsTicks = rounded * 1e7;
  const strToHash = `${windowsTicks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function encodeWsFrame(opcode: number, payload: Buffer): Buffer {
  const maskKey = crypto.randomBytes(4);
  const len = payload.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.alloc(2 + 4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | len;
    maskKey.copy(header, 2);
  } else if (len < 65536) {
    header = Buffer.alloc(4 + 4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
    maskKey.copy(header, 4);
  } else {
    header = Buffer.alloc(10 + 4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    maskKey.copy(header, 10);
  }

  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = payload[i] ^ maskKey[i % 4];
  }

  return Buffer.concat([header, maskedPayload]);
}

function synthesizeEdgeWebSocket(text: string, voice: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomBytes(16).toString('hex');
    const secMsGec = generateSecMsGec();
    const host = 'speech.platform.bing.com';
    const wsPath = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${reqId}`;
    const wsKey = crypto.randomBytes(16).toString('base64');

    let settled = false;
    const mp3Chunks: Buffer[] = [];
    let rxBuffer: Buffer = Buffer.alloc(0);
    let handshakeComplete = false;

    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
      },
      () => {
        const upgradeReq = [
          `GET ${wsPath} HTTP/1.1`,
          `Host: ${host}`,
          `Upgrade: websocket`,
          `Connection: Upgrade`,
          `Sec-WebSocket-Key: ${wsKey}`,
          `Sec-WebSocket-Version: 13`,
          `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`,
          `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0`,
          `\r\n`,
        ].join('\r\n');
        socket.write(upgradeReq);
      }
    );

    const finish = (err?: Error, data?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // Ignore
      }
      if (err) reject(err);
      else resolve(data || Buffer.alloc(0));
    };

    const timer = setTimeout(() => {
      finish(new Error('Edge TTS WebSocket timed out'));
    }, 2500);

    socket.on('data', (chunk: Buffer) => {
      rxBuffer = Buffer.concat([rxBuffer, chunk]);

      if (!handshakeComplete) {
        const headerEnd = rxBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        const headerStr = rxBuffer.subarray(0, headerEnd).toString('utf8');
        if (!headerStr.startsWith('HTTP/1.1 101')) {
          finish(new Error(`Edge TTS handshake failed: ${headerStr.split('\r\n')[0]}`));
          return;
        }

        handshakeComplete = true;
        rxBuffer = rxBuffer.subarray(headerEnd + 4);

        const timestamp = new Date().toUTCString();
        const configMsg =
          `X-Timestamp:${timestamp}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: 'false',
                    wordBoundaryEnabled: 'false',
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          });
        socket.write(encodeWsFrame(0x01, Buffer.from(configMsg, 'utf8')));

        const langMatch = voice.match(/^[a-z]{2}-[A-Z]{2}/);
        const xmlLang = langMatch ? langMatch[0] : 'en-US';
        const ssmlMsg =
          `X-RequestId:${reqId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${timestamp}\r\n` +
          `Path:ssml\r\n\r\n` +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'>` +
          `<voice name='${escapeXml(voice)}'>` +
          `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody>` +
          `</voice></speak>`;
        socket.write(encodeWsFrame(0x01, Buffer.from(ssmlMsg, 'utf8')));
      }

      while (rxBuffer.length >= 2) {
        const firstByte = rxBuffer[0];
        const secondByte = rxBuffer[1];
        const opcode = firstByte & 0x0f;
        const isMasked = (secondByte & 0x80) !== 0;
        let payloadLen = secondByte & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (rxBuffer.length < 4) return;
          payloadLen = rxBuffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (rxBuffer.length < 10) return;
          payloadLen = Number(rxBuffer.readBigUInt64BE(2));
          offset = 10;
        }

        const maskOffset = isMasked ? 4 : 0;
        if (rxBuffer.length < offset + maskOffset + payloadLen) return;

        let payload = rxBuffer.subarray(offset + maskOffset, offset + maskOffset + payloadLen);
        if (isMasked) {
          const mask = rxBuffer.subarray(offset, offset + 4);
          const unmasked = Buffer.alloc(payloadLen);
          for (let i = 0; i < payloadLen; i++) {
            unmasked[i] = payload[i] ^ mask[i % 4];
          }
          payload = unmasked;
        }

        rxBuffer = rxBuffer.subarray(offset + maskOffset + payloadLen);

        if (opcode === 0x01) {
          const textData = payload.toString('utf8');
          if (textData.includes('Path:turn.end')) {
            if (mp3Chunks.length > 0) {
              finish(undefined, Buffer.concat(mp3Chunks));
            } else {
              finish(new Error('Edge TTS completed with no audio chunks'));
            }
            return;
          }
        } else if (opcode === 0x02) {
          if (payload.length > 2) {
            const headerLen = payload.readUInt16BE(0);
            if (payload.length > 2 + headerLen) {
              const headerText = payload.subarray(2, 2 + headerLen).toString('utf8');
              if (headerText.includes('Path:audio')) {
                const audioSlice = payload.subarray(2 + headerLen);
                if (audioSlice.length > 0) {
                  mp3Chunks.push(Buffer.from(audioSlice));
                }
              }
            }
          }
        } else if (opcode === 0x08) {
          if (mp3Chunks.length > 0) {
            finish(undefined, Buffer.concat(mp3Chunks));
          } else {
            finish(new Error('Edge TTS WebSocket closed before audio arrived'));
          }
          return;
        } else if (opcode === 0x09) {
          socket.write(encodeWsFrame(0x0a, payload));
        }
      }
    });

    socket.on('error', (err) => {
      finish(err);
    });

    socket.on('close', () => {
      if (mp3Chunks.length > 0) {
        finish(undefined, Buffer.concat(mp3Chunks));
      } else {
        finish(new Error('Socket closed without audio'));
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
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
    try {
      const edgeBuf = await synthesizeEdgeWebSocket(text, voice);
      if (edgeBuf && edgeBuf.length > 100) {
        mp3Buffer = edgeBuf;
      }
    } catch {
      // Fallback below
    }

    if (!mp3Buffer) {
      try {
        mp3Buffer = await synthesizeFallbackMp3(text, voice);
      } catch (err: any) {
        res.status(502).json({ error: err?.message || 'TTS synthesis failed' });
        return;
      }
    }

    res.status(200);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3Buffer.length));
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
