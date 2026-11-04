import { EDGE_NEURAL_VOICES, EdgeVoiceOption } from '../constants/aiModels';
import { storageService } from '../services/storageService';
import { TTSEngineType } from '../types/chess';

export { EDGE_NEURAL_VOICES };
export type { EdgeVoiceOption };

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

// In-memory ObjectURL cache for synthesized Edge Neural TTS audio clips
const audioCache = new Map<string, string>();

// Active HTMLAudioElement and speech generation ID counter
let activeEdgeAudio: HTMLAudioElement | null = null;
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
    // Strip markdown formatting
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

  // Clean up en passant and normalize whitespace
  clean = clean.replace(/\be\.p\.\b/gi, 'en passant');
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

/**
 * Checks if window.speechSynthesis has a native Microsoft Natural/Online neural voice matching the persona.
 */
export function findNativeEdgeNeuralVoice(edgeVoiceId: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const persona = EDGE_VOICES.find((v) => v.id === edgeVoiceId) || EDGE_VOICES[0];
  const shortNameLower = persona.name.toLowerCase();

  const exactNatural = voices.find((v) => {
    const nameLower = v.name.toLowerCase();
    const uriLower = (v.voiceURI || '').toLowerCase();
    return (
      uriLower.includes(edgeVoiceId.toLowerCase()) ||
      (nameLower.includes(shortNameLower) && (nameLower.includes('natural') || nameLower.includes('online')))
    );
  });

  return exactNatural || null;
}

/**
 * Selects the highest-quality local voice matching the US/GB locale and gender of the selected coach persona.
 */
export function findBestBrowserVoiceForPersona(edgeVoiceId: string): {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rateMultiplier: number;
} {
  const persona = EDGE_VOICES.find((v) => v.id === edgeVoiceId) || EDGE_VOICES[0];
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { voice: null, pitch: persona.pitch, rateMultiplier: persona.rateMultiplier };
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return { voice: null, pitch: persona.pitch, rateMultiplier: persona.rateMultiplier };
  }

  const enVoices = voices.filter((v) => v.lang.startsWith('en'));
  if (enVoices.length === 0) {
    return { voice: voices[0] || null, pitch: persona.pitch, rateMultiplier: persona.rateMultiplier };
  }

  const femaleKeywords = ['female', 'aria', 'sonia', 'jenny', 'samantha', 'victoria', 'karen', 'zira', 'susan', 'hazel', 'libby'];
  const maleKeywords = ['male', 'andrew', 'ryan', 'brian', 'guy', 'christopher', 'eric', 'daniel', 'alex', 'david', 'mark', 'george', 'oliver', 'arthur'];
  const targetKeywords = persona.gender === 'female' ? femaleKeywords : maleKeywords;

  const localeVoices = enVoices.filter(
    (v) => v.lang.replace('_', '-').toLowerCase().startsWith(persona.lang.toLowerCase())
  );
  const candidatePool = localeVoices.length > 0 ? localeVoices : enVoices;

  const genderMatch =
    candidatePool.find(
      (v) =>
        (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google')) &&
        targetKeywords.some((kw) => v.name.toLowerCase().includes(kw))
    ) ||
    candidatePool.find((v) => targetKeywords.some((kw) => v.name.toLowerCase().includes(kw))) ||
    candidatePool.find((v) => v.name.includes('Natural') || v.name.includes('Online')) ||
    candidatePool.find((v) => v.name.includes('Google')) ||
    candidatePool[0];

  return {
    voice: genderMatch || enVoices[0] || null,
    pitch: persona.pitch,
    rateMultiplier: persona.rateMultiplier,
  };
}

let isEdgeServerAvailable = true;

/**
 * Fetches synthesized MP3 audio from the local /api/edge-tts proxy endpoint (with 6s timeout and ObjectURL caching).
 */
export async function synthesizeEdgeNeuralAudio(
  cleanText: string,
  edgeVoice: string = 'en-US-AndrewNeural',
  _rate: number = 1.0
): Promise<string | null> {
  const cacheKey = `${edgeVoice}:${cleanText}`;
  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  if (
    !isEdgeServerAvailable ||
    typeof window === 'undefined' ||
    (typeof navigator !== 'undefined' && !navigator.onLine)
  ) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const endpoint = `./api/edge-tts?voice=${encodeURIComponent(edgeVoice)}&text=${encodeURIComponent(cleanText)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('audio')) {
      if (response.status === 404 && contentType.includes('text/html')) {
        isEdgeServerAvailable = false;
      }
      throw new Error('Not audio');
    }

    const blob = await response.blob();
    if (!blob || blob.size < 100) {
      return null;
    }

    const objectUrl = URL.createObjectURL(blob);
    audioCache.set(cacheKey, objectUrl);
    return objectUrl;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Plays an audio URL via HTML5 Audio and resolves true if playback succeeded.
 */
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
      activeEdgeAudio = audio;

      let started = false;
      audio.onplay = () => {
        started = true;
        options.onStart?.();
      };
      audio.onended = () => {
        if (activeEdgeAudio === audio) activeEdgeAudio = null;
        options.onEnd?.();
        resolve(true);
      };
      audio.onerror = () => {
        if (activeEdgeAudio === audio) activeEdgeAudio = null;
        if (started) options.onEnd?.();
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
 * HTML5 Audio fallback when window.speechSynthesis has 0 voices or errors on Linux / Brave.
 * First attempts /api/edge-tts MP3, then direct translate_tts audio, and resolves gracefully.
 */
async function playHtml5SpeechFallback(
  cleanText: string,
  edgeVoice: string,
  rate: number,
  volume: number,
  mySpeechId: number,
  options: SpeakOptions = {}
): Promise<{ success: boolean; usedEdgeNeural: boolean }> {
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedEdgeNeural: false };
  }

  // Try /api/edge-tts endpoint if available
  const serverAudioUrl = await synthesizeEdgeNeuralAudio(cleanText, edgeVoice, rate);
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedEdgeNeural: false };
  }
  if (serverAudioUrl) {
    const played = await playHtml5AudioUrl(serverAudioUrl, volume, rate, options);
    if (played) {
      return { success: true, usedEdgeNeural: true };
    }
  }

  // Try direct HTML5 audio stream with no-referrer
  if (typeof document !== 'undefined' && (typeof navigator === 'undefined' || navigator.onLine)) {
    const tl = edgeVoice.startsWith('en-GB') ? 'en-GB' : 'en-US';
    const shortChunk = cleanText.slice(0, 180);
    const directUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(shortChunk)}`;
    const playedDirect = await new Promise<boolean>((resolve) => {
      try {
        const audio = document.createElement('audio');
        audio.setAttribute('referrerpolicy', 'no-referrer');
        audio.src = directUrl;
        audio.volume = volume;
        audio.playbackRate = rate;
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

    if (playedDirect) {
      return { success: true, usedEdgeNeural: false };
    }
  }

  // Graceful resolution on headless/muted Linux environments so UI never errors
  options.onStart?.();
  options.onEnd?.();
  return { success: true, usedEdgeNeural: false };
}

/**
 * Fallback to browser speech synthesis tuned to the selected coach persona's locale, gender, pitch, and rate.
 * Automatically falls back to HTML5 audio or resolves gracefully if Linux/Brave has 0 voices or fires onerror.
 */
async function fallbackToBrowserSpeech(
  cleanText: string,
  edgeVoice: string,
  baseRate: number,
  volume: number,
  mySpeechId: number,
  options: SpeakOptions = {}
): Promise<{ success: boolean; usedEdgeNeural: boolean }> {
  if (mySpeechId !== currentSpeechId) {
    return { success: false, usedEdgeNeural: false };
  }

  const hasSpeechSynthesis =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const voices = hasSpeechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!hasSpeechSynthesis || !voices || voices.length === 0) {
    return playHtml5SpeechFallback(cleanText, edgeVoice, baseRate, volume, mySpeechId, options);
  }

  const browserResult = await new Promise<{ success: boolean; usedEdgeNeural: boolean } | null>((resolve) => {
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
        resolve(null);
      }
    }, 1500);

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const { voice, pitch, rateMultiplier } = findBestBrowserVoiceForPersona(edgeVoice);
      const persona = EDGE_VOICES.find((v) => v.id === edgeVoice) || EDGE_VOICES[0];

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || persona.lang;
      } else {
        utterance.lang = persona.lang;
      }

      utterance.pitch = pitch;
      utterance.rate = Math.max(0.5, Math.min(2.0, baseRate * rateMultiplier));
      utterance.volume = volume;

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
        resolve({ success: true, usedEdgeNeural: false });
      };
      utterance.onerror = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimeout);
        if (e.error === 'canceled' || e.error === 'interrupted') {
          resolve({ success: true, usedEdgeNeural: false });
          return;
        }
        resolve(null);
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(startTimeout);
        resolve(null);
      }
    }
  });

  if (browserResult) {
    return browserResult;
  }

  return playHtml5SpeechFallback(cleanText, edgeVoice, baseRate, volume, mySpeechId, options);
}

/**
 * Speaks a chess coaching phrase using Edge Neural TTS (or browser offline TTS),
 * automatically converting algebraic chess notation into natural spoken words.
 * Always tries `/api/edge-tts` FIRST when `isEdgeServerAvailable` is true.
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
    // 1. Always try /api/edge-tts FIRST whenever isEdgeServerAvailable is true
    if (isEdgeServerAvailable) {
      const audioUrl = await synthesizeEdgeNeuralAudio(cleanText, edgeVoice, rate);
      if (mySpeechId !== currentSpeechId) {
        return { success: false, usedEdgeNeural: false };
      }

      if (audioUrl) {
        const played = await playHtml5AudioUrl(audioUrl, volume, rate, options);
        if (played) {
          return { success: true, usedEdgeNeural: true };
        }
      }
    }

    // 2. Check if window.speechSynthesis has a native Microsoft Natural/Online neural voice matching the persona
    const nativeEdgeVoice = findNativeEdgeNeuralVoice(edgeVoice);
    if (nativeEdgeVoice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const nativePlayed = await new Promise<boolean>((resolve) => {
        if (mySpeechId !== currentSpeechId) {
          resolve(false);
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
          resolve(true);
        };
        utterance.onerror = (e) => {
          if (e.error === 'canceled' || e.error === 'interrupted') {
            resolve(true);
            return;
          }
          resolve(false);
        };

        window.speechSynthesis.speak(utterance);
      });

      if (nativePlayed) {
        return { success: true, usedEdgeNeural: true };
      }
    }
  }

  // 3. Fallback to persona-tuned local browser speech synthesis (with HTML5 audio fallback on Linux)
  return fallbackToBrowserSpeech(cleanText, edgeVoice, rate, volume, mySpeechId, options);
}
