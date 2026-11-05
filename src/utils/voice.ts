import {
  EDGE_NEURAL_VOICES,
  GEMINI_PREBUILT_VOICES,
  EdgeVoiceOption,
  VoiceOption,
} from '../constants/aiModels';
import { storageService, isValidHttpsProxyUrl } from '../services/storageService';
import { geminiService } from '../services/geminiService';
import { soundService } from '../services/audioService';
import { TTSEngineType } from '../types/chess';

export { EDGE_NEURAL_VOICES, GEMINI_PREBUILT_VOICES };
export type { EdgeVoiceOption, VoiceOption };

// Exported for backwards compatibility
export const GEMINI_TTS_CALL_BUDGET = 0;

export const EDGE_VOICES = [
  {
    id: 'en-US-AndrewNeural',
    label: 'Coach Andrew (Warm & Confident US Male)',
    name: 'Andrew',
    lang: 'en-US',
    gender: 'male' as const,
    pitch: 0.96,
    rateMultiplier: 1.0,
  },
  {
    id: 'en-US-AriaNeural',
    label: 'Coach Aria (Expressive US Female)',
    name: 'Aria',
    lang: 'en-US',
    gender: 'female' as const,
    pitch: 1.08,
    rateMultiplier: 1.02,
  },
  {
    id: 'en-GB-RyanNeural',
    label: 'Grandmaster Ryan (Classic British Male)',
    name: 'Ryan',
    lang: 'en-GB',
    gender: 'male' as const,
    pitch: 0.92,
    rateMultiplier: 0.96,
  },
  {
    id: 'en-GB-SoniaNeural',
    label: 'Coach Sonia (Articulate British Female)',
    name: 'Sonia',
    lang: 'en-GB',
    gender: 'female' as const,
    pitch: 1.05,
    rateMultiplier: 0.98,
  },
  {
    id: 'en-US-BrianNeural',
    label: 'Coach Brian (Clear & Calm US Male)',
    name: 'Brian',
    lang: 'en-US',
    gender: 'male' as const,
    pitch: 0.9,
    rateMultiplier: 0.95,
  },
] as const;

// In-memory ObjectURL cache for optional custom HTTPS Edge proxy audio clips
const edgeProxyAudioCache = new Map<string, string>();

let activeHtmlAudio: HTMLAudioElement | null = null;
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
 * or RIFF WAV header ("RIFF") so static/garbage bytes are never played.
 */
function hasValidAudioHeader(buf: ArrayBuffer): boolean {
  if (!buf || buf.byteLength < 64) return false;
  const bytes = new Uint8Array(buf);
  // ID3v2 tag ("ID3")
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  // MPEG audio frame sync (0xFF followed by 0xE0..0xFF)
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return true;
  }
  // RIFF WAV ("RIFF")
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return true;
  }
  return false;
}

/**
 * Fetches synthesized MP3 audio from the user's configured HTTPS Voice Proxy URL.
 * Only executes when proxyUrl starts with https://.
 */
export async function synthesizeEdgeProxyAudio(
  cleanText: string,
  edgeVoice: string,
  proxyUrl: string
): Promise<{ objectUrl?: string; error?: string }> {
  if (!isValidHttpsProxyUrl(proxyUrl)) {
    return { error: 'Voice proxy URL must be a valid https:// endpoint.' };
  }

  const normalizedProxy = proxyUrl.trim();
  const cacheKey = `${normalizedProxy}|${edgeVoice}|${cleanText}`;
  if (edgeProxyAudioCache.has(cacheKey)) {
    return { objectUrl: edgeProxyAudioCache.get(cacheKey)! };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const separator = normalizedProxy.includes('?') ? '&' : '?';
    const endpoint = `${normalizedProxy}${separator}voice=${encodeURIComponent(edgeVoice)}&text=${encodeURIComponent(cleanText)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.error) detail += `: ${errJson.error}`;
      } catch {
        // Ignore non-JSON error body
      }
      return { error: `Voice proxy returned ${detail}` };
    }

    const arrayBuf = await response.arrayBuffer();
    if (!hasValidAudioHeader(arrayBuf)) {
      return { error: 'Voice proxy response did not contain a valid MP3/WAV audio header.' };
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const blob = new Blob([arrayBuf], { type: contentType.includes('audio') ? contentType : 'audio/mpeg' });
    const objectUrl = URL.createObjectURL(blob);
    edgeProxyAudioCache.set(cacheKey, objectUrl);
    return { objectUrl };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const msg =
      err?.name === 'AbortError'
        ? 'Voice proxy timed out after 7 seconds.'
        : err?.message || 'Failed to reach voice proxy URL.';
    return { error: msg };
  }
}

function playHtml5AudioUrl(
  audioUrl: string,
  volume: number,
  rate: number,
  options: SpeakOptions = {}
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioUrl;
      audio.volume = volume;
      audio.playbackRate = rate;
      activeHtmlAudio = audio;

      let started = false;
      audio.onplay = () => {
        started = true;
        options.onStart?.();
      };
      audio.onended = () => {
        if (activeHtmlAudio === audio) activeHtmlAudio = null;
        options.onEnd?.();
        resolve(true);
      };
      audio.onerror = () => {
        if (activeHtmlAudio === audio) activeHtmlAudio = null;
        if (started) options.onEnd?.();
        resolve(false);
      };

      audio.play().catch(() => {
        if (activeHtmlAudio === audio) activeHtmlAudio = null;
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Stops all active speech playback across Web Audio, HTMLAudioElement, and browser speechSynthesis.
 */
export function stopSpeech(): void {
  currentSpeechId++;
  soundService.stopActiveSpeech(40);

  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    activeHtmlAudio = null;
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
  geminiVoice?: string;
  edgeVoice?: string;
  voiceProxyUrl?: string;
  rate?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

export interface SpeakResult {
  success: boolean;
  usedNatural: boolean;
  error?: string;
  proxyWarning?: string;
}

async function speakWithGeminiTts(
  cleanText: string,
  geminiVoice: string,
  rate: number,
  volume: number,
  mySpeechId: number,
  options: SpeakOptions,
  proxyWarning?: string
): Promise<SpeakResult> {
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedNatural: false };
  }

  const ttsRes = await geminiService.generateSpeech(cleanText, geminiVoice);
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedNatural: false };
  }

  if (!ttsRes.success || !ttsRes.audioBuffer) {
    const combinedErr = proxyWarning
      ? `${proxyWarning} Fallback to Gemini TTS also failed: ${ttsRes.error || 'No audio returned.'}`
      : ttsRes.error || 'Gemini TTS failed to generate speech.';
    options.onError?.(new Error(combinedErr));
    return { success: false, usedNatural: false, error: combinedErr, proxyWarning };
  }

  options.onStart?.();
  const played = await soundService.playAudioArrayBuffer(
    ttsRes.audioBuffer,
    volume,
    () => {
      options.onEnd?.();
    },
    rate
  );

  if (!played) {
    const playErr = 'Web Audio / HTML5 Audio playback failed on this device.';
    options.onError?.(new Error(playErr));
    return { success: false, usedNatural: false, error: playErr, proxyWarning };
  }

  return {
    success: true,
    usedNatural: true,
    ...(proxyWarning ? { proxyWarning } : {}),
  };
}

async function speakWithBrowserTts(
  cleanText: string,
  rate: number,
  volume: number,
  mySpeechId: number,
  options: SpeakOptions
): Promise<SpeakResult> {
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedNatural: false };
  }

  const hasSpeechSynthesis =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  if (!hasSpeechSynthesis) {
    const err = 'Browser SpeechSynthesis is not supported in this browser.';
    options.onError?.(new Error(err));
    return { success: false, usedNatural: false, error: err };
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    const err = 'No local browser speech voices are installed on this device. Switch Speech Engine to Gemini TTS.';
    options.onError?.(new Error(err));
    return { success: false, usedNatural: false, error: err };
  }

  return new Promise<SpeakResult>((resolve) => {
    let settled = false;
    let started = false;

    const startTimeout = setTimeout(() => {
      if (!settled && !started) {
        settled = true;
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
        const err = 'Browser speech synthesis timed out without starting audio.';
        options.onError?.(new Error(err));
        resolve({ success: false, usedNatural: false, error: err });
      }
    }, 2000);

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const enVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
      if (enVoice) {
        utterance.voice = enVoice;
        utterance.lang = enVoice.lang || 'en-US';
      } else {
        utterance.lang = 'en-US';
      }
      utterance.rate = Math.max(0.5, Math.min(2.0, rate));
      utterance.volume = Math.max(0, Math.min(1.0, volume));

      utterance.onstart = () => {
        started = true;
        clearTimeout(startTimeout);
        options.onStart?.();
      };
      utterance.onend = () => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimeout);
        options.onEnd?.();
        resolve({ success: true, usedNatural: false });
      };
      utterance.onerror = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimeout);
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve({ success: true, usedNatural: false });
          return;
        }
        const errMsg = `Browser speech synthesis error: ${e.error || 'playback failed'}`;
        options.onError?.(new Error(errMsg));
        resolve({ success: false, usedNatural: false, error: errMsg });
      };

      window.speechSynthesis.speak(utterance);
    } catch (e: any) {
      if (!settled) {
        settled = true;
        clearTimeout(startTimeout);
        const errMsg = e?.message || 'Browser speech synthesis threw an exception.';
        options.onError?.(new Error(errMsg));
        resolve({ success: false, usedNatural: false, error: errMsg });
      }
    }
  });
}

/**
 * Speaks a chess coaching phrase using:
 * 1. Gemini TTS (default, official @google/genai API with PCM trim/fade pipeline & IndexedDB cache)
 * 2. Edge Neural TTS (optional, ONLY when Settings -> Voice proxy URL is a valid https:// URL; if proxy fails, shows exact error and falls back to Gemini TTS)
 * 3. Browser Device TTS (local window.speechSynthesis, failing honestly if unavailable)
 */
export async function speak(
  text: string,
  force: boolean = false,
  options: SpeakOptions = {}
): Promise<SpeakResult> {
  const settings = storageService.getSettings();

  if (!force && !settings.voiceEnabled) {
    return { success: false, usedNatural: false, error: 'Voice is muted in Settings.' };
  }

  const cleanText = formatChessTextForSpeech(text);
  if (!cleanText) {
    return { success: true, usedNatural: false };
  }

  stopSpeech();
  const mySpeechId = currentSpeechId;

  const voiceProxyUrl = (options.voiceProxyUrl ?? settings.voiceProxyUrl ?? '').trim();
  const hasHttpsProxy = isValidHttpsProxyUrl(voiceProxyUrl);

  let engine: TTSEngineType = options.ttsEngine || settings.ttsEngine || 'gemini';
  if (engine === 'edge' && !hasHttpsProxy) {
    engine = 'gemini';
  }

  const geminiVoice = options.geminiVoice || settings.geminiVoice || 'Kore';
  const edgeVoice = options.edgeVoice || settings.edgeVoice || 'en-US-AndrewNeural';
  const rate = Math.max(0.5, Math.min(2.0, options.rate ?? settings.voiceRate ?? 1.0));
  const volume = Math.max(0, Math.min(1.0, options.volume ?? settings.voiceVolume ?? 1.0));

  if (engine === 'browser') {
    return speakWithBrowserTts(cleanText, rate, volume, mySpeechId, options);
  }

  if (engine === 'edge' && hasHttpsProxy) {
    const proxyRes = await synthesizeEdgeProxyAudio(cleanText, edgeVoice, voiceProxyUrl);
    if (mySpeechId !== currentSpeechId) {
      return { success: false, usedNatural: false };
    }

    if (proxyRes.objectUrl) {
      const played = await playHtml5AudioUrl(proxyRes.objectUrl, volume, rate, options);
      if (played) {
        return { success: true, usedNatural: true };
      }
      const playbackErr = `Edge proxy audio playback failed (${voiceProxyUrl}). Falling back to Gemini TTS.`;
      return speakWithGeminiTts(cleanText, geminiVoice, rate, volume, mySpeechId, options, playbackErr);
    }

    const proxyErr = `Edge proxy error (${proxyRes.error || 'failed'}). Falling back to Gemini TTS.`;
    return speakWithGeminiTts(cleanText, geminiVoice, rate, volume, mySpeechId, options, proxyErr);
  }

  return speakWithGeminiTts(cleanText, geminiVoice, rate, volume, mySpeechId, options);
}
