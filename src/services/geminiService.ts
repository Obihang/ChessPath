import { GoogleGenAI } from '@google/genai';
import { storageService } from './storageService';

// Audio cache for repeated speech lines
interface CachedVoice {
  buffer: ArrayBuffer;
  url: string;
}
const audioCache = new Map<string, CachedVoice>();

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64.replace(/\s/g, ''));
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string = 'audio/wav'): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

function getGeminiClient(customKey?: string): GoogleGenAI | null {
  const settings = storageService.getSettings();
  const envKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '') ||
    '';

  const rawKey = (customKey || settings.geminiApiKey || envKey || '').trim();
  const apiKey = rawKey.replace(/^["'`]|["'`]$/g, '').trim();

  if (!apiKey) {
    return null;
  }

  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.warn('Failed to initialize GoogleGenAI client', e);
    return null;
  }
}

export const geminiService = {
  hasKey(): boolean {
    const settings = storageService.getSettings();
    return !!(settings.geminiApiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : ''));
  },

  async explainPosition(fen: string, moveHistory: string[] = []): Promise<string> {
    const ai = getGeminiClient();
    if (!ai) {
      return 'To get personalized AI position breakdowns and strategic plans, paste your free Gemini API key in Settings. All other app features remain fully functional offline!';
    }

    try {
      const prompt = `You are ChessPath's encouraging chess mentor. Explain the current position in plain, instructive English for an improving chess player.
Board FEN: "${fen}"
Move History: ${moveHistory.slice(-8).join(' ') || 'Starting position'}

Please cover:
1. Who has the initiative and why
2. Key strategic ideas and pawn levers
3. The main threats to watch out for
Keep your answer concise (2-3 short paragraphs), warm, encouraging, and clear without overwhelming engine notation.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return response.text || 'Unable to analyze the position at this moment.';
    } catch (e: any) {
      console.warn('Gemini explainPosition error', e);
      return `AI Coach response: ${e?.message || 'Check your internet connection or API key in Settings.'}`;
    }
  },

  async getHint(fen: string, goal: string = 'find the best move', playerColor: string = 'White'): Promise<string> {
    const ai = getGeminiClient();
    if (!ai) {
      return 'Look for undefended pieces, potential knight forks, or checks that force the opponent’s king to move.';
    }

    try {
      const prompt = `You are a chess coach giving a subtle hint to a student.
Current FEN: "${fen}"
Goal: "${goal}"
Side to move: "${playerColor}"

Provide a gentle nudge (1-2 sentences) pointing to the relevant sector of the board or tactical motif, WITHOUT explicitly spelling out the exact move coordinates. Be encouraging!`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return response.text || 'Look for checks, captures, and threats on your opponent’s undefended pieces.';
    } catch {
      return 'Focus on piece activity: look for forcing moves, checks, and double attacks.';
    }
  },

  async analyzeGame(moves: string[], result: string): Promise<string> {
    const ai = getGeminiClient();
    if (!ai) {
      return 'Game completed! Paste your Gemini API key in Settings to receive grandmaster post-game reports and lessons to learn.';
    }

    try {
      const prompt = `You are a grandmaster mentor reviewing a completed chess game.
Moves: ${moves.join(' ')}
Result: ${result}

Write a human-friendly review with:
1. A 2-sentence summary of the match
2. Exactly 2-3 key strategic lessons the student should take away to improve their play
Keep the tone encouraging, constructive, and inspiring!`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return response.text || 'Great game! Consistent calculation and king safety are the pillars of improvement.';
    } catch {
      return 'Well played! Review your moves and look for missed opportunities to control the center.';
    }
  },

  async chat(
    messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
    systemInstruction: string,
    model: string = 'gemini-3.8-flash'
  ): Promise<string> {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('NO_KEY');
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: messages,
        config: { systemInstruction },
      });
      return response.text || 'No response from AI.';
    } catch (e: any) {
      if (model === 'gemini-3.8-flash' && (e.message.includes('404') || e.message.includes('model not found'))) {
        return this.chat(messages, systemInstruction, 'gemini-flash-latest');
      }
      throw e;
    }
  },

  async generateNaturalVoice(
    text: string,
    customKey?: string
  ): Promise<{ success: boolean; audioUrl?: string; audioBuffer?: ArrayBuffer; error?: string }> {
    const ai = getGeminiClient(customKey);
    if (!ai) {
      return { success: false, error: 'No Gemini API key found. Please paste your key in Settings.' };
    }

    const cleanText = text.replace(/[*_#`]/g, '').trim().slice(0, 500);
    if (!cleanText) {
      return { success: false, error: 'Empty text to speak.' };
    }

    // Check cache
    if (audioCache.has(cleanText)) {
      const cached = audioCache.get(cleanText)!;
      return { success: true, audioUrl: cached.url, audioBuffer: cached.buffer };
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      let base64Audio: string | undefined;
      let mimeType = 'audio/wav';

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          base64Audio = part.inlineData.data;
          if (part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          break;
        }
      }

      if (base64Audio) {
        const buffer = base64ToArrayBuffer(base64Audio);
        const audioUrl = arrayBufferToBlobUrl(buffer, mimeType);
        audioCache.set(cleanText, { buffer, url: audioUrl });
        return { success: true, audioUrl, audioBuffer: buffer };
      }

      return {
        success: false,
        error: 'Gemini responded without audio data. The model might be temporarily busy.',
      };
    } catch (e: any) {
      console.warn('Gemini TTS request error:', e);
      let errMsg = e?.message || 'Gemini TTS request failed.';
      if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
        errMsg = 'Invalid Gemini API key. Please check your key from Google AI Studio.';
      } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
        errMsg = 'Gemini API quota reached. Offline browser voice will be used as fallback.';
      } else if (errMsg.includes('not found') || errMsg.includes('404')) {
        errMsg = 'TTS model unavailable with this key. Offline browser voice will be used as fallback.';
      }
      return {
        success: false,
        error: errMsg,
      };
    }
  },

  async testVoiceConnection(key?: string): Promise<{ success: boolean; audioUrl?: string; audioBuffer?: ArrayBuffer; error?: string }> {
    const ai = getGeminiClient(key);
    if (!ai) {
      return { success: false, error: 'Please enter a Gemini API key first.' };
    }

    return this.generateNaturalVoice(
      'Welcome to ChessPath! Your mentor is ready.',
      key
    );
  },
};
