import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import {
  WSS_URL,
  CHROMIUM_MAJOR_VERSION,
  SEC_MS_GEC_VERSION,
  generateSecMsGec,
  generateMuid,
  generateConnectId,
  adjustClockSkewFromServerDate,
} from './edgeDrm';

function buildMaskedTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const mask = crypto.randomBytes(4);

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ mask[i & 3];
  }

  return Buffer.concat([header, mask, masked]);
}

/**
 * Synthesizes MP3 audio from Microsoft Edge Read Aloud WebSocket using Node's built-in https Upgrade
 * so custom Origin, User-Agent, and Cookie headers are sent with zero external dependencies.
 * Automatically adjusts clock skew from the server's Date header if HTTP 403 occurs (matching rany2/edge-tts).
 */
export async function synthesizeEdgeMp3(
  text: string,
  voice: string = 'en-US-AndrewNeural',
  timeoutMs: number = 8000,
  isRetryAfterSkew: boolean = false
): Promise<Buffer> {
  const secMsGec = generateSecMsGec();
  const connectId = generateConnectId();
  const muid = generateMuid();
  const wsUrl = `${WSS_URL}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId}`;
  const httpUrl = wsUrl.replace(/^wss:/i, 'https:');
  const wsKey = crypto.randomBytes(16).toString('base64');

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const audioChunks: Buffer[] = [];
    let rxBuffer: Buffer = Buffer.alloc(0);
    let activeSocket: any = null;

    const finish = (err?: Error, data?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeSocket) {
        try {
          activeSocket.destroy();
        } catch {
          // Ignore
        }
      }
      if (err) reject(err);
      else resolve(data || Buffer.alloc(0));
    };

    const timer = setTimeout(() => {
      finish(new Error(`Edge TTS WebSocket timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const req = https.request(httpUrl, {
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': wsKey,
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: `muid=${muid};`,
      },
    });

    req.on('response', (res) => {
      const serverDate = res.headers['date'];
      if (res.statusCode === 403 && serverDate && !isRetryAfterSkew) {
        settled = true;
        clearTimeout(timer);
        adjustClockSkewFromServerDate(
          Array.isArray(serverDate) ? serverDate[0] : serverDate
        );
        synthesizeEdgeMp3(text, voice, timeoutMs, true).then(resolve).catch(reject);
        return;
      }
      finish(new Error(`Edge TTS handshake rejected with HTTP ${res.statusCode}`));
    });

    req.on('error', (err) => {
      finish(new Error(`Edge TTS request error: ${err.message}`));
    });

    req.on('upgrade', (_res, socket, head) => {
      activeSocket = socket;
      if (head && head.length > 0) {
        rxBuffer = Buffer.concat([rxBuffer, head]);
      }

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
      socket.write(buildMaskedTextFrame(configMsg));

      const ssmlMsg =
        `X-RequestId:${connectId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapedText}</prosody></voice></speak>`;
      socket.write(buildMaskedTextFrame(ssmlMsg));

      const processFrames = () => {
        while (rxBuffer.length >= 2) {
          const byte0 = rxBuffer[0];
          const byte1 = rxBuffer[1];
          const opcode = byte0 & 0x0f;
          const isMasked = (byte1 & 0x80) !== 0;
          let payloadLen = byte1 & 0x7f;
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

          let maskKey: Buffer | null = null;
          if (isMasked) {
            if (rxBuffer.length < offset + 4) return;
            maskKey = rxBuffer.subarray(offset, offset + 4);
            offset += 4;
          }

          if (rxBuffer.length < offset + payloadLen) {
            return;
          }

          const frameData = Buffer.from(rxBuffer.subarray(offset, offset + payloadLen));
          rxBuffer = rxBuffer.subarray(offset + payloadLen);

          if (maskKey) {
            for (let i = 0; i < frameData.length; i++) {
              frameData[i] ^= maskKey[i & 3];
            }
          }

          if (opcode === 0x01) {
            const textMsg = frameData.toString('utf8');
            if (textMsg.includes('Path:turn.end')) {
              if (audioChunks.length > 0) {
                finish(undefined, Buffer.concat(audioChunks));
              } else {
                finish(new Error('Edge TTS turn ended with no audio chunks'));
              }
              return;
            }
          } else if (opcode === 0x02) {
            if (frameData.length > 2) {
              const headerLen = frameData.readUInt16BE(0);
              if (frameData.length > 2 + headerLen) {
                const headerStr = frameData.subarray(2, 2 + headerLen).toString('utf8');
                if (headerStr.includes('Path:audio')) {
                  const audioPayload = frameData.subarray(2 + headerLen);
                  if (audioPayload.length > 0) {
                    audioChunks.push(Buffer.from(audioPayload));
                  }
                }
              }
            }
          } else if (opcode === 0x08) {
            if (audioChunks.length > 0) {
              finish(undefined, Buffer.concat(audioChunks));
            } else {
              finish(new Error('Edge TTS WebSocket closed by server before audio arrived'));
            }
            return;
          }
        }
      };

      socket.on('data', (chunk: Buffer) => {
        rxBuffer = Buffer.concat([rxBuffer, chunk]);
        processFrames();
      });

      socket.on('error', (err: Error) => {
        finish(new Error(`Edge TTS socket error: ${err.message}`));
      });

      socket.on('close', () => {
        if (audioChunks.length > 0) {
          finish(undefined, Buffer.concat(audioChunks));
        } else {
          finish(new Error('Edge TTS socket closed before audio arrived'));
        }
      });

      processFrames();
    });

    req.end();
  });
}

/**
 * Checks whether a buffer begins with a valid MP3 frame sync (0xFF 0xE0..0xFF) or ID3v2 tag ('ID3').
 */
export function hasValidMp3Header(buf: Buffer): boolean {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return true;
  }
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return true;
  }
  return false;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 8787);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const parsed = new URL(req.url || '/', `http://localhost:${port}`);
    const voice = parsed.searchParams.get('voice') || 'en-US-AndrewNeural';
    const text = (parsed.searchParams.get('text') || '').trim().slice(0, 600);

    if (!text) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing text parameter' }));
      return;
    }

    try {
      const mp3 = await synthesizeEdgeMp3(text, voice);
      if (!hasValidMp3Header(mp3)) {
        throw new Error('Synthesized payload did not contain a valid MP3 header');
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(mp3.length));
      res.end(mp3);
    } catch (err: any) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'Edge TTS synthesis failed' }));
    }
  });

  server.listen(port, () => {
    console.log(`Optional Edge TTS proxy listening on http://localhost:${port}`);
  });
}
