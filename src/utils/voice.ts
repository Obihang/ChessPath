import { EDGE_NEURAL_VOICES, EdgeVoiceOption } from '../constants/aiModels';
import { storageService } from '../services/storageService';
import { TTSEngineType } from '../types/chess';

export { EDGE_NEURAL_VOICES };
export type { EdgeVoiceOption };

export const EDGE_VOICES = [
  { id: 'en-US-AndrewNeural', label: 'Coach Andrew (Warm & Confident US Male)', name: 'Andrew', lang: 'en-US' },
  { id: 'en-US-AriaNeural', label: 'Coach Aria (Expressive US Female)', name: 'Aria', lang: 'en-US' },
  { id: 'en-GB-RyanNeural', label: 'Grandmaster Ryan (Classic British Male)', name: 'Ryan', lang: 'en-GB' },
  { id: 'en-GB-SoniaNeural', label: 'Coach Sonia (Articulate British Female)', name: 'Sonia', lang: 'en-GB' },
  { id: 'en-US-BrianNeural', label: 'Coach Brian (Clear & Calm US Male)', name: 'Brian', lang: 'en-US' },
] as const;

// In-memory ObjectURL cache for synthesized Edge Neural TTS audio clips
const edgeAudioCache = new Map<string, string>();

// Active HTMLAudioElement and speech generation ID counter
let activeEdgeAudio: HTMLAudioElement | null = null;
let currentSpeechId = 0;

/**
 * Formats chess notation into natural phonetic English for TTS engines.
 */
export function formatChessTextForSpeech(text: string): string {
  if (!text) return '';

  let clean = text
    // Strip markdown formatting
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s*/g, '');

  // 1. Handle castling FIRST before piece move regexes
  clean = clean.replace(/\b(?:O-O-O|0-0-0)\b/g, 'castles queenside');
  clean = clean.replace(/\b(?:O-O|0-0)\b/g, 'castles kingside');

  // 2. Convert numerical evaluations like +1.5 -> "plus 1.5" and -0.8 -> "minus 0.8"
  // BEFORE '+' is converted to " check"
  clean = clean.replace(/([+-])(\d+(?:\.\d+)?)/g, (_, sign, num) => {
    return `${sign === '+' ? 'plus' : 'minus'} ${num}`;
  });

  const pieceMap: Record<string, string> = {
    K: 'King',
    Q: 'Queen',
    R: 'Rook',
    B: 'Bishop',
    N: 'Knight',
  };

  // 3. Convert pawn promotions like e8=Q or d1=N+ before piece moves & check symbols
  clean = clean.replace(/\b([a-h][18])=([QRBN])(?=[+#\s.,;!?)]|$)/g, (_, sq, promo) => {
    return `${sq} promotes to ${pieceMap[promo] || promo}`;
  });

  // 4. Piece captures (e.g., Nxe5, Nxd4+, Bxf7#) - allow trailing + or # before word boundary
  clean = clean.replace(
    /\b([KQRBN])([a-h1-8]?)x([a-h][1-8])(?=[+#\s.,;!?)]|$)/g,
    (_, piece, disambig, square) => {
      const fromPart = disambig ? ` ${disambig}` : '';
      return `${pieceMap[piece] || piece}${fromPart} takes ${square}`;
    }
  );

  // 5. Pawn captures (e.g., exd5, exd5+, cxb4)
  clean = clean.replace(
    /\b([a-h])x([a-h][1-8])(?=[+#\s.,;!?)]|$)/g,
    (_, file, square) => `${file} takes ${square}`
  );

  // 6. Standard piece moves (e.g., Nf3, Nf3+, Qh5#, Nbd7, R1e2)
  clean = clean.replace(
    /\b([KQRBN])([a-h1-8]?)([a-h][1-8])(?=[+#\s.,;!?)]|$)/g,
    (_, piece, disambig, square) => {
      const fromPart = disambig ? ` ${disambig}` : '';
      return `${pieceMap[piece] || piece}${fromPart} ${square}`;
    }
  );

  // 7. Convert check (+) and checkmate (#) symbols AFTER move regexes
  clean = clean.replace(/#/g, ' checkmate');
  clean = clean.replace(/\+/g, ' check');
  clean = clean.replace(/!!/g, ', brilliant move');

  // 8. Clean up en passant and extra whitespace
  clean = clean.replace(/\be\.p\.\b/gi, 'en passant');
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

/**
 * Finds a native Microsoft Natural / Online Edge Neural voice in window.speechSynthesis if installed.
 */
export function findNativeEdgeNeuralVoice(edgeVoiceId: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const voiceMeta = EDGE_VOICES.find((v) => v.id === edgeVoiceId) || EDGE_VOICES[0];
  const shortPersona = voiceMeta.name.toLowerCase(); // e.g., "andrew", "aria", "ryan", "sonia", "brian"

  // Exact match on Microsoft Natural/Online neural voice for the chosen persona
  const exactNatural = voices.find((v) => {
    const nameLower = v.name.toLowerCase();
    const uriLower = (v.voiceURI || '').toLowerCase();
    return (
      uriLower.includes(edgeVoiceId.toLowerCase()) ||
      (nameLower.includes(shortPersona) && (nameLower.includes('natural') || nameLower.includes('online')))
    );
  });
  if (exactNatural) return exactNatural;

  // Fallback to any Microsoft Natural/Online English voice if available natively
  const anyMicrosoftNatural = voices.find((v) => {
    const nameLower = v.name.toLowerCase();
    return (
      v.lang.startsWith('en') &&
      nameLower.includes('microsoft') &&
      (nameLower.includes('natural') || nameLower.includes('online'))
    );
  });

  return anyMicrosoftNatural || null;
}

/**
 * Selects the best available local browser fallback voice.
 */
export function findBestBrowserVoice(preferredLang: string = 'en-US'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const enVoices = voices.filter((v) => v.lang.startsWith('en'));
  if (enVoices.length === 0) return voices[0] || null;

  return (
    enVoices.find((v) => v.name.includes('Natural') || v.name.includes('Online')) ||
    enVoices.find((v) => v.name.includes('Google') && v.lang === preferredLang) ||
    enVoices.find((v) => v.name.includes('Google')) ||
    enVoices.find((v) => v.name.includes('Samantha') || v.name.includes('Daniel')) ||
    enVoices.find((v) => v.lang === preferredLang) ||
    enVoices[0]
  );
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Synthesizes speech audio using Edge Neural TTS WebSocket protocol with a 4-second timeout
 * and caches the resulting ObjectURL in memory.
 */
export async function synthesizeEdgeNeuralAudio(
  cleanText: string,
  edgeVoice: string = 'en-US-AndrewNeural',
  rate: number = 1.0
): Promise<string | null> {
  const cacheKey = `${edgeVoice}:${rate.toFixed(1)}:${cleanText}`;
  if (edgeAudioCache.has(cacheKey)) {
    return edgeAudioCache.get(cacheKey)!;
  }

  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return null;
  }

  const ratePct = Math.round((rate - 1.0) * 100);
  const rateStr = `${ratePct >= 0 ? '+' : ''}${ratePct}%`;
  const langMatch = edgeVoice.match(/^[a-z]{2}-[A-Z]{2}/);
  const xmlLang = langMatch ? langMatch[0] : 'en-US';

  const trustedClientToken = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const reqId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${trustedClientToken}&ConnectionId=${reqId}`;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const audioChunks: BlobPart[] = [];

    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      }
      resolve(url);
    };

    const timeoutId = setTimeout(() => {
      finish(null);
    }, 4000);

    try {
      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        if (!ws || settled) return;
        const timestamp = new Date().toISOString();
        const configHeader =
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
        ws.send(configHeader);

        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'>` +
          `<voice name='${edgeVoice}'>` +
          `<prosody pitch='+0Hz' rate='${rateStr}' volume='+0%'>` +
          `${escapeSsml(cleanText)}` +
          `</prosody></voice></speak>`;

        const ssmlHeader =
          `X-RequestId:${reqId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${timestamp}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml;

        ws.send(ssmlHeader);
      };

      ws.onmessage = (event) => {
        if (settled) return;
        if (typeof event.data === 'string') {
          if (event.data.includes('Path:turn.end')) {
            if (audioChunks.length > 0) {
              const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
              const url = URL.createObjectURL(blob);
              edgeAudioCache.set(cacheKey, url);
              finish(url);
            } else {
              finish(null);
            }
          }
        } else if (event.data instanceof ArrayBuffer) {
          const view = new DataView(event.data);
          if (event.data.byteLength > 2) {
            const headerLen = view.getUint16(0, false);
            if (event.data.byteLength > 2 + headerLen) {
              const mp3Slice = event.data.slice(2 + headerLen);
              if (mp3Slice.byteLength > 0) {
                audioChunks.push(mp3Slice);
              }
            }
          }
        }
      };

      ws.onerror = () => {
        finish(null);
      };

      ws.onclose = () => {
        if (!settled) {
          if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            edgeAudioCache.set(cacheKey, url);
            finish(url);
          } else {
            finish(null);
          }
        }
      };
    } catch {
      finish(null);
    }
  });
}

/**
 * Stops all active speech playback (both browser speechSynthesis and Edge Neural HTMLAudioElement)
 * and increments the speech generation counter to cancel in-flight requests.
 */
export function stopSpeech(): void {
  currentSpeechId++;

  if (activeEdgeAudio) {
    try {
      activeEdgeAudio.pause();
      activeEdgeAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    activeEdgeAudio = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

export interface SpeakOptions {
  ttsEngine?: TTSEngineType;
  edgeVoice?: string;
  rate?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Speaks a chess coaching phrase using Edge Neural TTS (or browser offline TTS),
 * automatically converting algebraic chess notation into natural spoken words.
 */
export async function speak(
  text: string,
  force: boolean = false,
  options: SpeakOptions = {}
): Promise<{ success: boolean; usedEdgeNeural: boolean }> {
  const settings = storageService.getSettings();
  const progress = storageService.getProgress();

  if (!force && !settings.voiceEnabled) {
    return { success: false, usedEdgeNeural: false };
  }

  const cleanText = formatChessTextForSpeech(text);
  if (!cleanText) {
    return { success: true, usedEdgeNeural: false };
  }

  stopSpeech();
  const mySpeechId = currentSpeechId;

  const engine: TTSEngineType =
    options.ttsEngine ||
    progress.ttsEngine ||
    settings.ttsEngine ||
    (settings.useNaturalVoice ? 'edge' : 'browser');

  const edgeVoice =
    options.edgeVoice ||
    progress.edgeVoice ||
    settings.edgeVoice ||
    'en-US-AndrewNeural';

  const rate = Math.max(0.5, Math.min(2.0, options.rate ?? settings.voiceRate ?? 1.0));
  const volume = Math.max(0, Math.min(1.0, options.volume ?? settings.voiceVolume ?? 1.0));

  if (engine === 'edge') {
    // 1. Check Native Edge Neural Voices First (zero latency on Edge / Windows)
    const nativeEdgeVoice = findNativeEdgeNeuralVoice(edgeVoice);
    if (nativeEdgeVoice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return new Promise((resolve) => {
        if (mySpeechId !== currentSpeechId) {
          resolve({ success: false, usedEdgeNeural: false });
          return;
        }
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.voice = nativeEdgeVoice;
        utterance.lang = nativeEdgeVoice.lang || 'en-US';
        utterance.rate = rate;
        utterance.volume = volume;
        utterance.pitch = 1.0;

        utterance.onstart = () => options.onStart?.();
        utterance.onend = () => {
          options.onEnd?.();
          resolve({ success: true, usedEdgeNeural: true });
        };
        utterance.onerror = (e) => {
          if (e.error === 'canceled' || e.error === 'interrupted') {
            resolve({ success: true, usedEdgeNeural: true });
            return;
          }
          options.onEnd?.();
          resolve({ success: false, usedEdgeNeural: false });
        };

        window.speechSynthesis.speak(utterance);
      });
    }

    // 2. Synthesize via Edge Neural TTS with in-memory ObjectURL cache
    const audioUrl = await synthesizeEdgeNeuralAudio(cleanText, edgeVoice, rate);
    if (mySpeechId !== currentSpeechId) {
      return { success: false, usedEdgeNeural: false };
    }

    if (audioUrl) {
      const played = await new Promise<boolean>((resolve) => {
        try {
          const audio = new Audio(audioUrl);
          audio.volume = volume;
          activeEdgeAudio = audio;

          audio.onplay = () => options.onStart?.();
          audio.onended = () => {
            if (activeEdgeAudio === audio) activeEdgeAudio = null;
            options.onEnd?.();
            resolve(true);
          };
          audio.onerror = () => {
            if (activeEdgeAudio === audio) activeEdgeAudio = null;
            resolve(false);
          };

          audio.play().catch(() => {
            if (activeEdgeAudio === audio) activeEdgeAudio = null;
            resolve(false);
          });
        } catch {
          resolve(false);
        }
      });

      if (played) {
        return { success: true, usedEdgeNeural: true };
      }
    }
  }

  // 3. Standard Browser SpeechSynthesis (100% Offline or fallback)
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedEdgeNeural: false };
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    const err = new Error('Browser speech synthesis is not supported on this device.');
    options.onError?.(err);
    return { success: false, usedEdgeNeural: false };
  }

  return new Promise((resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voiceMeta = EDGE_VOICES.find((v) => v.id === edgeVoice);
      const bestVoice = findBestBrowserVoice(voiceMeta?.lang || 'en-US');
      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang;
      }
      utterance.rate = rate;
      utterance.volume = volume;
      utterance.pitch = 1.0;

      utterance.onstart = () => options.onStart?.();
      utterance.onend = () => {
        options.onEnd?.();
        resolve({ success: true, usedEdgeNeural: false });
      };
      utterance.onerror = (e) => {
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve({ success: true, usedEdgeNeural: false });
          return;
        }
        const err = new Error(`Browser speech error: ${e.error || 'Playback failed'}`);
        options.onError?.(err);
        resolve({ success: false, usedEdgeNeural: false });
      };

      window.speechSynthesis.speak(utterance);
    } catch (e: any) {
      options.onError?.(e instanceof Error ? e : new Error(String(e)));
      resolve({ success: false, usedEdgeNeural: false });
    }
  });
}
