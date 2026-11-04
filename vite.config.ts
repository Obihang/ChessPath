import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import tls from 'tls';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '130.0.2849.68';
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

function synthesizeEdgeTtsMp3(text: string, voice: string): Promise<Buffer> {
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
          `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0`,
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
    }, 3500);

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

        const timestamp = new Date().toISOString();
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
          `X-Timestamp:${timestamp}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'>` +
          `<voice name='${escapeXml(voice)}'>` +
          `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody>` +
          `</voice></speak>`;
        socket.write(encodeWsFrame(0x01, Buffer.from(ssmlMsg, 'utf8')));
      }

      // Parse WebSocket frames
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
          // Text frame
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
          // Binary frame
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
          // Close frame
          if (mp3Chunks.length > 0) {
            finish(undefined, Buffer.concat(mp3Chunks));
          } else {
            finish(new Error('Edge TTS WebSocket closed before audio arrived'));
          }
          return;
        } else if (opcode === 0x09) {
          // Ping -> Pong
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

    try {
      const mp3Buffer = await synthesizeEdgeTtsMp3(text, voice);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(mp3Buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(mp3Buffer);
    } catch (err: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Edge TTS synthesis failed' }));
    }
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
