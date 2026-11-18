import { GoogleGenAI } from '@google/genai';
import { storageService } from './storageService';
import { GEMINI_MODELS } from '../constants/aiModels';
import { base64ToArrayBuffer } from '../utils/audioUtils';
import {
  detectApiKeyProvider,
  callSmartAI,
  getResolvedAiApiKey,
  isClientHttpError,
} from './coachService';

export { base64ToArrayBuffer };

export function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string = 'audio/wav'): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
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

export const geminiService = {
  hasKey(): boolean {
    return detectApiKeyProvider().provider !== 'none';
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

  async generateLiveCommentary(
    prompt: string,
    systemInstruction: string,
    _maxSentences: number = 1,
    signal?: AbortSignal
  ): Promise<string> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const detected = detectApiKeyProvider();
    if (detected.provider === 'none') {
      throw new Error('NO_KEY');
    }

    return await callSmartAI(prompt, systemInstruction, undefined, signal);
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
        const modelsToTry = [
          GEMINI_MODELS.TEXT_PRIMARY,
          GEMINI_MODELS.TEXT_FALLBACK,
          GEMINI_MODELS.TEXT_LEGACY_FALLBACK,
        ];
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
            if (isClientHttpError(err)) {
              break;
            }
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
