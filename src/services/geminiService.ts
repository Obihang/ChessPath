import { storageService, PROGRESS_KEY } from './storageService';
import { GEMINI_MODELS } from '../constants/aiModels';
import { base64ToArrayBuffer, stripMarkdown } from '../utils/audioUtils';
import { detectApiKeyProvider, callSmartAI, getResolvedAiApiKey } from './coachService';

export { base64ToArrayBuffer };

export function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string = 'audio/wav'): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Resolves any optional custom key from localStorage (`chesspath_progress_v1` first, then `chesspath_settings_v1`).
 * Server-side Gemini endpoints use `process.env.GEMINI_API_KEY` on the server automatically.
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

/**
 * Resolves the client-side API key for the currently configured text AI provider.
 */
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

async function callOpenAICompatible(
  messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
  systemInstruction?: string
): Promise<string> {
  const settings = storageService.getSettings();
  const provider = settings.aiProvider || 'gemini';
  const apiKey = getTextProviderApiKey();
  if (!apiKey) {
    throw new Error('NO_KEY');
  }

  let baseUrl = '';
  let defaultModel = '';

  switch (provider) {
    case 'openrouter':
      baseUrl = settings.aiBaseUrl || 'https://openrouter.ai/api/v1';
      defaultModel = settings.aiModelName || 'anthropic/claude-3.5-sonnet';
      break;
    case 'groq':
      baseUrl = settings.aiBaseUrl || 'https://api.groq.com/openai/v1';
      defaultModel = settings.aiModelName || 'llama-3.3-70b-versatile';
      break;
    case 'openai':
      baseUrl = settings.aiBaseUrl || 'https://api.openai.com/v1';
      defaultModel = settings.aiModelName || 'gpt-4o-mini';
      break;
    case 'bytez':
      baseUrl = settings.aiBaseUrl || 'https://api.bytez.com/v1';
      defaultModel = settings.aiModelName || 'Qwen/Qwen2.5-72B-Instruct';
      break;
    case 'custom':
    default:
      baseUrl = settings.aiBaseUrl || 'https://api.openai.com/v1';
      defaultModel = settings.aiModelName || 'gpt-3.5-turbo';
      break;
  }

  const formattedMessages: any[] = [];
  if (systemInstruction) {
    formattedMessages.push({ role: 'system', content: systemInstruction });
  }
  for (const m of messages) {
    const text = m.parts ? m.parts.map((p) => p.text).join('\n') : (m as any).content;
    const role = m.role === 'model' ? 'assistant' : m.role;
    formattedMessages.push({ role, content: text });
  }

  let endpoint = baseUrl.trim().replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = `${endpoint}/chat/completions`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'bytez' ? { 'bytez-api-key': apiKey } : {}),
      ...(provider === 'openrouter'
        ? {
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://chesspath.app',
            'X-Title': 'ChessPath AI',
          }
        : {}),
    },
    body: JSON.stringify({
      model: defaultModel,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Invalid API Key for ${provider} (401/403)`);
    }
    if (res.status === 429) {
      throw new Error(`429 Rate limit exceeded on ${provider}`);
    }
    if (res.status === 404) {
      throw new Error(`404 Model or Endpoint not found (${defaultModel}). Check base URL and model.`);
    }
    throw new Error(`API Error ${res.status}: ${errText.slice(0, 160)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response from API.';
}

export const geminiService = {
  hasKey(): boolean {
    return detectApiKeyProvider().provider !== 'none';
  },

  hasGeminiVoiceKey(): boolean {
    return true;
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

  async transcribeAudio(
    audioBlob: Blob,
    customMimeType?: string,
    _customKey?: string
  ): Promise<{ success: boolean; transcript?: string; error?: string }> {
    try {
      const arrayBuf = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      const mimeType = customMimeType || audioBlob.type || 'audio/webm';

      const response = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Gemini STT HTTP ${response.status}`);
      }

      const cleanTranscript = stripMarkdown(data.transcript || '').replace(/^["']|["']$/g, '').trim();
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
    const apiKey = (options?.apiKey || getActiveApiKey()).trim();

    if (provider === 'gemini' || provider === 'auto') {
      try {
        const res = await fetch('/api/gemini/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          return { success: false, error: data?.error || `Gemini HTTP ${res.status}` };
        }
        return { success: true, reply: data.reply || 'Connected to Gemini successfully!' };
      } catch (e: any) {
        const msg = e?.message || 'Failed to connect to Gemini.';
        return { success: false, error: msg };
      }
    }

    if (!apiKey) {
      return { success: false, error: `No API key provided for ${provider}. Please enter a valid API key.` };
    }

    let baseUrl = options?.baseUrl || settings.aiBaseUrl || '';
    let modelName = options?.modelName || settings.aiModelName || '';

    if (!baseUrl) {
      if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
      else if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
      else if (provider === 'bytez') baseUrl = 'https://api.bytez.com/v1';
      else baseUrl = 'https://api.openai.com/v1';
    }

    if (!modelName) {
      if (provider === 'groq') modelName = 'llama-3.3-70b-versatile';
      else if (provider === 'openrouter') modelName = 'anthropic/claude-3.5-sonnet';
      else if (provider === 'bytez') modelName = 'Qwen/Qwen2.5-72B-Instruct';
      else if (provider === 'openai') modelName = 'gpt-4o-mini';
      else modelName = 'gpt-3.5-turbo';
    }

    let endpoint = baseUrl.trim().replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint = `${endpoint}/chat/completions`;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(provider === 'bytez' ? { 'bytez-api-key': apiKey } : {}),
          ...(provider === 'openrouter'
            ? {
                'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://chesspath.app',
                'X-Title': 'ChessPath AI',
              }
            : {}),
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: 'Say "Chess coach connection verified!" in one short sentence.' },
          ],
          temperature: 0.7,
          max_tokens: 60,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401 || res.status === 403) {
          return { success: false, error: `Invalid API key for ${provider} (HTTP ${res.status}). Please check your key.` };
        }
        if (res.status === 404) {
          return { success: false, error: `Endpoint or model not found (HTTP 404). Check Base URL and Model (${modelName}).` };
        }
        return { success: false, error: `API Error (HTTP ${res.status}): ${errText.slice(0, 160)}` };
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || 'Connected successfully!';
      return { success: true, reply };
    } catch (e: any) {
      return { success: false, error: e?.message || `Network error connecting to ${provider}.` };
    }
  },
};
