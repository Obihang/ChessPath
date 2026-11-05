import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import WebSocket from 'ws';
import {
  TRUSTED_CLIENT_TOKEN,
  SEC_MS_GEC_VERSION,
  generateSecMsGecV2,
  generateMuid,
} from './src/utils/edgeDrm';

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

function edgeTtsServerPlugin(): Plugin {
  const middleware = async (req: any, res: any, next: () => void) => {
    if (!req.url) {
      next();
      return;
    }

    const parsedUrl = new URL(req.url, 'http://localhost');
    if (!parsedUrl.pathname.endsWith('/api/edge-tts')) {
      next();
      return;
    }

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    const voice = parsedUrl.searchParams.get('voice') || 'en-US-AndrewNeural';
    const text = (parsedUrl.searchParams.get('text') || '').trim().slice(0, 600);

    if (!text) {
      res.statusCode = 400;
      res.end('Missing text parameter');
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
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'TTS synthesis failed' }));
        return;
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3Buffer.length));
    res.setHeader('X-TTS-Engine', ttsEngineUsed);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(mp3Buffer);
  };

  return {
    name: 'edge-tts-middleware',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ command }) => {
  const isAndroid = process.env.VITE_TARGET === 'android';
  const basePath = isAndroid
    ? './'
    : process.env.VITE_BASE_PATH || (command === 'serve' ? '/' : '/ChessPath/');

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      edgeTtsServerPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'engine/stockfish-19-lite-single.js',
          'engine/stockfish-19-lite-single.wasm',
          'engine/stockfish.js',
          'engine/stockfish.wasm',
          'fonts/plus-jakarta-sans-latin.woff2',
          'fonts/jetbrains-mono-latin.woff2',
        ],
        manifest: {
          name: 'ChessPath — Free Offline Chess Academy & AI Coach',
          short_name: 'ChessPath',
          description: 'Free, offline-ready chess academy with Stockfish engine, interactive lessons, gambit trainer, and AI voice coach.',
          theme_color: '#090d16',
          background_color: '#090d16',
          display: 'standalone',
          start_url: './',
          scope: './',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff2,txt}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: ['**/android/**', '**/dist/**'],
            },
    },
  };
});
