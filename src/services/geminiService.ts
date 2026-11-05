import { GoogleGenAI } from '@google/genai';
import { storageService, PROGRESS_KEY } from './storageService';
import { GEMINI_MODELS, GEMINI_PREBUILT_VOICES } from '../constants/aiModels';
import {
  base64ToArrayBuffer,
  stripMarkdown,
  processRawPcmOrWavToProcessedWav,
} from '../utils/audioUtils';
import { audioCacheService } from './audioCacheService';
import { detectApiKeyProvider, callSmartAI, getResolvedAiApiKey } from './coachService';

export { base64ToArrayBuffer };

export function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string = 'audio/wav'): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Resolves the user's Gemini API key strictly from localStorage (`chesspath_progress_v1` first, then `chesspath_settings_v1`).
 * Never reads process.env.
 */
export function getGeminiVoiceApiKey(customKey?: string): string {
  let progressKey = '';
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const k = parsed?.aiApiKey || parsed?.geminiApiKey;
        if (k && typeof k === 'string') {
          progressKey = k.trim();
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  const settings = storageService.getSettings();
  const rawKey = (
    customKey ||
    progressKey ||
    settings.aiApiKey ||
    settings.geminiApiKey ||
    ''
  ).trim();

  return rawKey.replace(/^["'`]|["'`]$/g, '').trim();
}

export function getTextProviderApiKey(customKey?: string): string {
  return getResolvedAiApiKey(customKey);
}

export function getActiveApiKey(customKey?: string): string {
  return getTextProviderApiKey(customKey);
}

export const DEFAULT_TEXT_MODEL = GEMINI_MODELS.TEXT_PRIMARY;
export const FALLBACK_TEXT_MODEL = GEMINI_MODELS.TEXT_FALLBACK;
let rememberedTextModel: string = DEFAULT_TEXT_MODEL;

export function getActiveTextModel(): string {
  return rememberedTextModel;
}

export function resetActiveTextModel(): void {
  rememberedTextModel = DEFAULT_TEXT_MODEL;
}

const VALID_GEMINI_VOICE_NAMES = new Set(GEMINI_PREBUILT_VOICES.map((v) => v.id));

export function normalizeGeminiVoiceName(voiceName?: string): string {
  if (voiceName && VALID_GEMINI_VOICE_NAMES.has(voiceName)) {
    return voiceName;
  }
  return 'Kore';
}

export const geminiService = {
  hasKey(): boolean {
    return detectApiKeyProvider().provider !== 'none';
  },

  hasGeminiVoiceKey(customKey?: string): boolean {
    const key = getGeminiVoiceApiKey(customKey);
    return Boolean(key && key.startsWith('AIza'));
  },

  hasTextProviderKey(): boolean {
    return detectApiKeyProvider().provider !== 'none';
  },

  async explainPosition(fen: string, moveHistory: string[] = []): Promise<string> {
    if (!this.hasKey()) {
      return 'To get personalized AI position breakdowns and strategic plans, configure your AI API key in Settings. All other app features remain fully functional offline!';
    }

    const prompt = `You are ChessPath's encouraging chess mentor. Explain the current position in plain, instructive English for an improving chess player.
Board FEN: "${fen}"
Move History: ${moveHistory.slice(-8).join(' ') || 'Starting position'}

Please cover:
1. Who has the initiative and why
2. Key strategic ideas and pawn levers
3. The main threats to watch out for
Keep your answer concise (2-3 short paragraphs), warm, encouraging, and clear without overwhelming engine notation.`;

    try {
      const reply = await callSmartAI(prompt, 'You are an expert chess mentor.');
      return reply || 'Unable to analyze the position at this moment.';
    } catch (e: any) {
      return `AI Coach response: ${e?.message || 'Check your internet connection or API key in Settings.'}`;
    }
  },

  async getHint(fen: string, goal: string = 'find the best move', playerColor: string = 'White'): Promise<string> {
    if (!this.hasKey()) {
      return 'Look for undefended pieces, potential knight forks, or checks that force the opponent’s king to move.';
    }

    const prompt = `You are a chess coach giving a subtle hint to a student.
Current FEN: "${fen}"
Goal: "${goal}"
Side to move: "${playerColor}"

Provide a gentle nudge (1-2 sentences) pointing to the relevant sector of the board or tactical motif, WITHOUT explicitly spelling out the exact move coordinates. Be encouraging!`;

    try {
      const reply = await callSmartAI(prompt, 'You are a helpful chess coach.');
      return reply || 'Look for checks, captures, and threats on your opponent’s undefended pieces.';
    } catch {
      return 'Focus on piece activity: look for forcing moves, checks, and double attacks.';
    }
  },

  async analyzeGame(moves: string[], result: string): Promise<string> {
    if (!this.hasKey()) {
      return 'Game completed! Configure your AI API key in Settings to receive grandmaster post-game reports and lessons to learn.';
    }

    const prompt = `You are a grandmaster mentor reviewing a completed chess game.
Moves: ${moves.join(' ')}
Result: ${result}

Write a human-friendly review with:
1. A 2-sentence summary of the match
2. Exactly 2-3 key strategic lessons the student should take away to improve their play
Keep the tone encouraging, constructive, and inspiring!`;

    try {
      const reply = await callSmartAI(prompt, 'You are a grandmaster chess mentor.');
      return reply || 'Great game! Consistent calculation and king safety are the pillars of improvement.';
    } catch {
      return 'Well played! Review your moves and look for missed opportunities to control the center.';
    }
  },

  async chat(
    messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
    systemInstruction: string
  ): Promise<string> {
    const detected = detectApiKeyProvider();
    if (detected.provider === 'none') {
      throw new Error('NO_KEY');
    }

    if (detected.provider === 'gemini') {
      const apiKey = getResolvedAiApiKey();
      if (!apiKey) throw new Error('NO_KEY');
      const ai = new GoogleGenAI({ apiKey });

      const contents = messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: m.parts?.length ? m.parts : [{ text: (m as any).content || '' }],
      }));

      const modelsToTry = [GEMINI_MODELS.TEXT_PRIMARY, GEMINI_MODELS.TEXT_FALLBACK];
      let lastErr: unknown = null;

      for (const model of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0.6,
              maxOutputTokens: 450,
            },
          });
          const text = (response.text || '').trim();
          if (text) {
            rememberedTextModel = model;
            return text;
          }
        } catch (err) {
          lastErr = err;
        }
      }

      if (lastErr instanceof Error) {
        throw lastErr;
      }
    }

    const transcript = messages
      .map((m) => {
        const speaker = m.role === 'user' ? 'Student' : 'Coach';
        const text = m.parts ? m.parts.map((p) => p.text).join('\n') : (m as any).content || '';
        return `${speaker}: ${text}`;
      })
      .join('\n\n');

    return await callSmartAI(transcript, systemInstruction);
  },

  async generateLiveCommentary(
    prompt: string,
    systemInstruction: string,
    _maxSentences: number = 2
  ): Promise<string> {
    const detected = detectApiKeyProvider();
    if (detected.provider === 'none') {
      throw new Error('NO_KEY');
    }

    return await callSmartAI(prompt, systemInstruction);
  },

  /**
   * Generates speech audio using the official @google/genai Gemini TTS API in the browser,
   * processes raw 24kHz PCM through the trim/fade pipeline (processRawPcmOrWavToProcessedWav),
   * and caches the processed WAV buffer in IndexedDB (audioCacheService).
   */
  async generateSpeech(
    text: string,
    voiceName?: string,
    customKey?: string
  ): Promise<{ success: boolean; audioBuffer?: ArrayBuffer; fromCache?: boolean; error?: string }> {
    const cleanText = stripMarkdown(text).trim();
    if (!cleanText) {
      return { success: false, error: 'Empty text provided for TTS.' };
    }

    const settings = storageService.getSettings();
    const resolvedVoice = normalizeGeminiVoiceName(voiceName || settings.geminiVoice);

    // 1. Check IndexedDB cache first
    const cachedBuffer = await audioCacheService.getClip(cleanText, resolvedVoice);
    if (cachedBuffer && cachedBuffer.byteLength > 44) {
      return { success: true, audioBuffer: cachedBuffer, fromCache: true };
    }

    const apiKey = getGeminiVoiceApiKey(customKey);
    if (!apiKey) {
      return {
        success: false,
        error: 'No Gemini API key configured in Settings. Enter your Gemini key (AIza...) in Settings to enable Gemini TTS.',
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const ttsModels = [GEMINI_MODELS.TTS_PRIMARY, GEMINI_MODELS.TTS_FALLBACK];
    let lastError: any = null;

    for (const model of ttsModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text: cleanText }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: resolvedVoice,
                },
              },
            },
          },
        });

        const base64Audio =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const rawPcmBuffer = base64ToArrayBuffer(base64Audio);
          const processedWav = processRawPcmOrWavToProcessedWav(rawPcmBuffer, 24000);
          await audioCacheService.saveClip(cleanText, resolvedVoice, processedWav);
          return { success: true, audioBuffer: processedWav, fromCache: false };
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    const errMsg = lastError?.message || 'Gemini TTS failed to synthesize audio.';
    return { success: false, error: errMsg };
  },

  /**
   * Client-side audio transcription using @google/genai and the user's API key from Settings.
   */
  async transcribeAudio(
    audioBlob: Blob,
    customMimeType?: string,
    customKey?: string
  ): Promise<{ success: boolean; transcript?: string; error?: string }> {
    const apiKey = getGeminiVoiceApiKey(customKey);
    if (!apiKey) {
      return {
        success: false,
        error: 'NO_KEY: No Gemini API key found in Settings. Add your Gemini API key in Settings to use microphone transcription.',
      };
    }

    try {
      const arrayBuf = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      const mimeType = customMimeType || audioBlob.type || 'audio/webm';

      const ai = new GoogleGenAI({ apiKey });
      const sttModels = [GEMINI_MODELS.STT_PRIMARY, GEMINI_MODELS.STT_FALLBACK];
      let transcriptText = '';
      let lastError: any = null;

      for (const model of sttModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: 'Transcribe this spoken chess question or move command into plain English text. Output only the exact spoken words without quotes or commentary.',
                  },
                ],
              },
            ],
          });

          if (response.text && response.text.trim()) {
            transcriptText = response.text.trim();
            break;
          }
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!transcriptText) {
        throw lastError || new Error('Gemini returned an empty transcription.');
      }

      const cleanTranscript = stripMarkdown(transcriptText).replace(/^["']|["']$/g, '').trim();
      return { success: true, transcript: cleanTranscript };
    } catch (e: any) {
      console.warn('Gemini STT error:', e);
      let errMsg = e?.message || 'Gemini audio transcription failed.';
      if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('401') || errMsg.includes('403')) {
        errMsg = 'Invalid Gemini API key. Check key in Settings.';
      } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
        errMsg = 'Gemini quota reached (429). Please wait a moment.';
      } else if (errMsg.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        errMsg = 'Offline / No internet connection.';
      }
      return { success: false, error: errMsg };
    }
  },

  async testProviderConnection(options?: {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
  }): Promise<{ success: boolean; reply?: string; error?: string }> {
    const settings = storageService.getSettings();
    const provider = options?.provider || settings.aiProvider || 'gemini';
    const apiKey = (options?.apiKey ?? getActiveApiKey()).trim();

    if (!apiKey) {
      return {
        success: false,
        error: 'No API key entered in Settings. Please paste your API key first.',
      };
    }

    const detected = detectApiKeyProvider(apiKey, provider);

    if (detected.provider === 'gemini') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const modelsToTry = [GEMINI_MODELS.TEXT_PRIMARY, GEMINI_MODELS.TEXT_FALLBACK];
        let lastErr: any = null;

        for (const model of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: 'Say "Chess coach connection verified!" in one short sentence.',
            });
            const reply = (response.text || '').trim();
            if (reply) {
              return { success: true, reply };
            }
          } catch (err) {
            lastErr = err;
          }
        }
        return {
          success: false,
          error: lastErr?.message || 'Failed to connect to Gemini.',
        };
      } catch (e: any) {
        return {
          success: false,
          error: e?.message || 'Failed to connect to Gemini.',
        };
      }
    }

    try {
      const reply = await callSmartAI(
        'Say "Chess coach connection verified!" in one short sentence.',
        'You are a chess coach.',
        apiKey
      );
      return { success: true, reply: reply || 'Connected successfully!' };
    } catch (e: any) {
      return {
        success: false,
        error: e?.message || `Network error connecting to ${detected.label}.`,
      };
    }
  },
};
