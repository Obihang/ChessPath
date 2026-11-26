import {
  DEFAULT_EDGE_TTS_URL,
  DEFAULT_EDGE_VOICE,
  EDGE_NEURAL_VOICES,
  EdgeVoiceOption,
  VoiceOption,
} from '../constants/aiModels';
import { storageService } from '../services/storageService';
import { soundService } from '../services/audioService';
import { audioCacheService } from '../services/audioCacheService';

export { DEFAULT_EDGE_TTS_URL, DEFAULT_EDGE_VOICE, EDGE_NEURAL_VOICES };
export type { EdgeVoiceOption, VoiceOption };

const MAX_TTS_LRU_ENTRIES = 40;

interface CachedAudioEntry {
  buffer: ArrayBuffer;
  mimeType: string;
}

// In-memory LRU cache (max 40 entries) keyed by voice|rate|text
const ttsAudioLruCache = new Map<string, CachedAudioEntry>();

let activeHtmlAudio: HTMLAudioElement | null = null;
let activeHtmlObjectUrl: string | null = null;
let currentSpeechId = 0;

const pieceNames: Record<string, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight',
};

/**
 * Formats chess notation into natural phonetic English for TTS engines.
 * Never produces literal "undefined" on optional capture groups.
 */
export function formatChessTextForSpeech(text: string): string {
  if (!text) return '';

  let clean = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/(?:^|\n)#{1,6}\s+/g, ' ');

  // 1. Replace O-O-O with 'castles queenside' and O-O with 'castles kingside'
  clean = clean.replace(/\b(?:O-O-O|0-0-0)\b/g, 'castles queenside');
  clean = clean.replace(/\b(?:O-O|0-0)\b/g, 'castles kingside');

  // 2. Replace pawn promotions \b([a-h][18])=([QRBN])([+#])?(?=\s|[.,!?;:]|$)
  clean = clean.replace(
    /\b([a-h][18])=([QRBN])([+#])?(?=\s|[.,!?;:)]|$)/g,
    (_, sq: string, promo: string, check?: string) => {
      const promoName = pieceNames[promo] || promo;
      const suffix = check === '#' ? ' checkmate' : check === '+' ? ' check' : '';
      return `${sq} promotes to ${promoName}${suffix}`;
    }
  );

  // 3. Replace piece moves \b([KQRBN])([a-h])?([1-8])?(x)?([a-h][1-8])([+#])?(?=\s|[.,!?;:]|$)
  clean = clean.replace(
    /\b([KQRBN])([a-h])?([1-8])?(x)?([a-h][1-8])([+#])?(?=\s|[.,!?;:)]|$)/g,
    (_, piece: string, file?: string, rank?: string, capture?: string, square?: string, check?: string) => {
      const suffix = check === '#' ? ' checkmate' : check === '+' ? ' check' : '';
      return `${pieceNames[piece] || piece}${file ? ' ' + file : ''}${rank ? ' ' + rank : ''} ${capture ? 'takes' : 'to'} ${square}${suffix}`;
    }
  );

  // 4. Replace pawn captures \b([a-h])x([a-h][1-8])([+#])?(?=\s|[.,!?;:]|$)
  clean = clean.replace(
    /\b([a-h])x([a-h][1-8])([+#])?(?=\s|[.,!?;:)]|$)/g,
    (_, file: string, square: string, check?: string) => {
      const suffix = check === '#' ? ' checkmate' : check === '+' ? ' check' : '';
      return `${file} takes ${square}${suffix}`;
    }
  );

  // 5. Replace standalone pawn moves with check/mate \b([a-h][1-8])([+#])(?=\s|[.,!?;:]|$)
  clean = clean.replace(
    /\b([a-h][1-8])([+#])(?=\s|[.,!?;:)]|$)/g,
    (_, square: string, check: string) => {
      return `${square} ${check === '#' ? 'checkmate' : 'check'}`;
    }
  );

  // 6. Replace evaluations (?:\s|^)\+(\d+\.\d+) -> ' plus $1' and (?:\s|^)-(\d+\.\d+) -> ' minus $1'
  clean = clean.replace(/(^|\s)\+(\d+\.\d+)/g, '$1plus $2');
  clean = clean.replace(/(^|\s)-(\d+\.\d+)/g, '$1minus $2');

  clean = clean.replace(/\be\.p\.\b/gi, 'en passant');
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

/**
 * Verifies that an ArrayBuffer starts with a valid MP3 header ("ID3" or MPEG frame sync 0xFF 0xE0+)
 * or RIFF WAV header ("RIFF") so invalid payloads are never played.
 */
function hasValidAudioHeader(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 64) return false;
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true;
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return true;
  }
  return false;
}

function getLruEntry(cacheKey: string): CachedAudioEntry | undefined {
  const entry = ttsAudioLruCache.get(cacheKey);
  if (!entry) return undefined;
  // Refresh LRU recency
  ttsAudioLruCache.delete(cacheKey);
  ttsAudioLruCache.set(cacheKey, entry);
  return entry;
}

function setLruEntry(cacheKey: string, entry: CachedAudioEntry): void {
  if (ttsAudioLruCache.has(cacheKey)) {
    ttsAudioLruCache.delete(cacheKey);
  } else if (ttsAudioLruCache.size >= MAX_TTS_LRU_ENTRIES) {
    const oldestKey = ttsAudioLruCache.keys().next().value;
    if (oldestKey !== undefined) {
      ttsAudioLruCache.delete(oldestKey);
    }
  }
  ttsAudioLruCache.set(cacheKey, entry);
}

/**
 * Fetches synthesized MP3 audio from the hardcoded MS Edge Neural TTS endpoint
 * with in-memory LRU caching (max 40 entries keyed by voice|rate|text) and AbortController support.
 */
async function fetchEdgeTtsAudio(
  cleanText: string,
  edgeVoice: string,
  rate: number,
  externalSignal?: AbortSignal
): Promise<{ entry?: CachedAudioEntry; aborted?: boolean; error?: string }> {
  if (externalSignal?.aborted) {
    return { aborted: true };
  }

  const cacheKey = `${edgeVoice}|${rate.toFixed(2)}|${cleanText}`;
  const cached = getLruEntry(cacheKey);
  if (cached) {
    return { entry: cached };
  }

  // Check persistent IndexedDB cache before network call
  try {
    const idbBuffer = await audioCacheService.getClip(cleanText, edgeVoice);
    if (idbBuffer && hasValidAudioHeader(idbBuffer)) {
      const entry: CachedAudioEntry = { buffer: idbBuffer, mimeType: 'audio/mpeg' };
      setLruEntry(cacheKey, entry);
      return { entry };
    }
  } catch {
    // Proceed to network fetch on cache read error
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 7500);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const endpoint = `${DEFAULT_EDGE_TTS_URL}?voice=${encodeURIComponent(edgeVoice)}&text=${encodeURIComponent(cleanText)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.error) detail += `: ${errJson.error}`;
      } catch {
        // Ignore non-JSON error body
      }
      return { error: `Edge TTS service returned ${detail}` };
    }

    const arrayBuf = await response.arrayBuffer();
    if (externalSignal?.aborted) {
      return { aborted: true };
    }

    if (!hasValidAudioHeader(arrayBuf)) {
      return { error: 'Edge TTS response did not contain a valid MP3/WAV audio header.' };
    }

    const headerType = response.headers.get('content-type') || 'audio/mpeg';
    const mimeType = headerType.includes('audio') ? headerType : 'audio/mpeg';
    const entry: CachedAudioEntry = { buffer: arrayBuf, mimeType };
    setLruEntry(cacheKey, entry);
    audioCacheService.saveClip(cleanText, edgeVoice, arrayBuf).catch(() => {});
    return { entry };
  } catch (err: any) {
    if (externalSignal?.aborted && !timedOut) {
      return { aborted: true };
    }
    const msg = timedOut
      ? 'Edge TTS request timed out.'
      : err?.message || 'Unable to reach Edge Neural TTS service.';
    return { error: msg };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function cleanupActiveAudioElement(): void {
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.onplay = null;
      activeHtmlAudio.onended = null;
      activeHtmlAudio.onerror = null;
      activeHtmlAudio.pause();
      activeHtmlAudio.removeAttribute('src');
      activeHtmlAudio.load();
    } catch {
      // Ignore cleanup errors
    }
    activeHtmlAudio = null;
  }
  if (activeHtmlObjectUrl) {
    try {
      URL.revokeObjectURL(activeHtmlObjectUrl);
    } catch {
      // Ignore revoke errors
    }
    activeHtmlObjectUrl = null;
  }
}

function playAudioBuffer(
  entry: CachedAudioEntry,
  volume: number,
  rate: number,
  mySpeechId: number,
  options: SpeakOptions = {}
): Promise<{ played: boolean; aborted?: boolean; error?: string }> {
  if (mySpeechId !== currentSpeechId || options.signal?.aborted) {
    return Promise.resolve({ played: false, aborted: true });
  }

  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    let objectUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;

    const cleanup = () => {
      options.signal?.removeEventListener('abort', onAbort);
      if (activeHtmlAudio === audio) {
        cleanupActiveAudioElement();
      } else if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Ignore
        }
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ played: false, aborted: true });
    };

    if (options.signal) {
      if (options.signal.aborted) {
        resolve({ played: false, aborted: true });
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      const blob = new Blob([entry.buffer], { type: entry.mimeType });
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audio.preload = 'auto';
      audio.volume = volume;
      audio.playbackRate = rate;

      activeHtmlAudio = audio;
      activeHtmlObjectUrl = objectUrl;

      audio.onplay = () => {
        if (mySpeechId !== currentSpeechId || options.signal?.aborted) {
          onAbort();
          return;
        }
        started = true;
        options.onStart?.();
      };

      audio.onended = () => {
        if (settled) return;
        settled = true;
        cleanup();
        options.onEnd?.();
        resolve({ played: true });
      };

      audio.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (started) options.onEnd?.();
        resolve({ played: false, error: 'Audio playback failed on this device.' });
      };

      audio.play().catch((err: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          played: false,
          error: err?.message || 'Audio playback was blocked or unsupported.',
        });
      });
    } catch (err: any) {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({
          played: false,
          error: err?.message || 'Failed to initialize audio playback.',
        });
      }
    }
  });
}

/**
 * Stops all active speech playback immediately.
 */
export function stopSpeech(): void {
  currentSpeechId++;
  soundService.stopActiveSpeech(40);
  cleanupActiveAudioElement();
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

/**
 * Speaks a phrase using the device browser's built-in Web Speech API (speechSynthesis).
 * Used automatically as a fallback when offline or when Edge Neural TTS is unreachable.
 */
function speakWithWebSpeech(
  cleanText: string,
  rate: number,
  volume: number,
  mySpeechId: number,
  options: SpeakOptions = {}
): Promise<SpeakResult> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve({
      success: false,
      usedNatural: false,
      error: 'Device speech synthesis is unavailable on this device.',
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = rate;
    utterance.volume = volume;
    utterance.lang = 'en-US';

    const onAbort = () => {
      if (settled) return;
      settled = true;
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
      options.signal?.removeEventListener('abort', onAbort);
      resolve({ success: false, usedNatural: false, aborted: true });
    };

    if (options.signal) {
      if (options.signal.aborted) {
        resolve({ success: false, usedNatural: false, aborted: true });
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    utterance.onstart = () => {
      if (mySpeechId !== currentSpeechId || options.signal?.aborted) {
        onAbort();
        return;
      }
      options.onStart?.();
    };

    utterance.onend = () => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      options.onEnd?.();
      resolve({ success: true, usedNatural: false });
    };

    utterance.onerror = (e) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', onAbort);
      resolve({
        success: false,
        usedNatural: false,
        error: e.error || 'Device speech synthesis error',
      });
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err: any) {
      if (!settled) {
        settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        resolve({
          success: false,
          usedNatural: false,
          error: err?.message || 'Failed to start device speech synthesis',
        });
      }
    }
  });
}

export interface SpeakOptions {
  edgeVoice?: string;
  rate?: number;
  volume?: number;
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export interface SpeakResult {
  success: boolean;
  usedNatural: boolean;
  aborted?: boolean;
  error?: string;
}

/**
 * Speaks a chess coaching phrase using MS Edge Neural TTS (https://chesspath-tts.vercel.app/tts)
 * with IndexedDB + LRU caching and automatic offline Web Speech API fallback.
 */
export async function speak(
  text: string,
  force: boolean = false,
  options: SpeakOptions = {}
): Promise<SpeakResult> {
  if (options.signal?.aborted) {
    return { success: false, usedNatural: false, aborted: true };
  }

  const settings = storageService.getSettings();
  if (!force && !settings.voiceEnabled) {
    return { success: false, usedNatural: false, error: 'Voice is muted in Settings.' };
  }

  const cleanText = formatChessTextForSpeech(text);
  if (!cleanText) {
    return { success: true, usedNatural: true };
  }

  stopSpeech();
  const mySpeechId = currentSpeechId;

  const edgeVoice = options.edgeVoice || settings.edgeVoice || DEFAULT_EDGE_VOICE;
  const rate = Math.max(0.5, Math.min(2.0, options.rate ?? settings.voiceRate ?? 1.0));
  const volume = Math.max(0, Math.min(1.0, options.volume ?? settings.voiceVolume ?? 1.0));

  const fetchRes = await fetchEdgeTtsAudio(cleanText, edgeVoice, rate, options.signal);
  if (fetchRes.aborted || mySpeechId !== currentSpeechId || options.signal?.aborted) {
    return { success: false, usedNatural: false, aborted: true };
  }

  if (!fetchRes.entry) {
    // Edge Neural TTS unavailable or device offline: fallback to device browser speech
    return await speakWithWebSpeech(cleanText, rate, volume, mySpeechId, options);
  }

  const playRes = await playAudioBuffer(fetchRes.entry, volume, rate, mySpeechId, options);
  if (playRes.aborted || mySpeechId !== currentSpeechId || options.signal?.aborted) {
    return { success: false, usedNatural: false, aborted: true };
  }

  if (!playRes.played) {
    // Audio playback error: fallback to device browser speech
    return await speakWithWebSpeech(cleanText, rate, volume, mySpeechId, options);
  }

  return { success: true, usedNatural: true };
}
