import { GoogleGenAI } from '@google/genai';
import { storageService } from './storageService';
import { GEMINI_MODELS } from '../constants/aiModels';
import { pcmToWav, base64ToArrayBuffer, stripMarkdown, processRawPcmOrWavToProcessedWav, processPcmToFloat32, float32ToPcm } from '../utils/audioUtils';
import { audioCacheService } from './audioCacheService';

export { base64ToArrayBuffer };

export function arrayBufferToBlobUrl(buffer: ArrayBuffer, mimeType: string = 'audio/wav'): string {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Resolves the client-side API key for Gemini features (Voice TTS / STT, and Gemini text).
 * Does NOT pick up third-party text provider keys (Groq, OpenRouter, OpenAI, etc.).
 * Stored locally in user's browser settings.
 */
export function getGeminiVoiceApiKey(customKey?: string): string {
  const settings = storageService.getSettings();
  const envKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '') ||
    '';
  const rawKey = (customKey || settings.geminiApiKey || (settings.aiProvider === 'gemini' ? settings.aiApiKey : '') || envKey || '').trim();
  return rawKey.replace(/^["'`]|["'`]$/g, '').trim();
}

/**
 * Resolves the client-side API key for the currently configured text AI provider.
 */
export function getTextProviderApiKey(customKey?: string): string {
  const settings = storageService.getSettings();
  const provider = settings.aiProvider || 'gemini';
  if (provider === 'gemini') {
    return getGeminiVoiceApiKey(customKey);
  }
  const rawKey = (customKey || settings.aiApiKey || '').trim();
  return rawKey.replace(/^["'`]|["'`]$/g, '').trim();
}

/**
 * Backward compatibility helper for general callers.
 */
export function getActiveApiKey(customKey?: string): string {
  return getTextProviderApiKey(customKey);
}

function getGeminiClient(customKey?: string): GoogleGenAI | null {
  const apiKey = getGeminiVoiceApiKey(customKey);
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

export const DEFAULT_TEXT_MODEL = 'gemini-3.8-flash';
export const FALLBACK_TEXT_MODEL = 'gemini-flash-latest';
let rememberedTextModel = DEFAULT_TEXT_MODEL;

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
      baseUrl = settings.aiBaseUrl || 'https://api.openai.com/v1';
      defaultModel = settings.aiModelName || 'gpt-3.5-turbo';
      break;
    default:
      baseUrl = settings.aiBaseUrl || 'https://api.openai.com/v1';
      defaultModel = settings.aiModelName || 'gpt-3.5-turbo';
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
    const settings = storageService.getSettings();
    const provider = settings.aiProvider || 'gemini';
    if (provider === 'gemini') {
      return !!getGeminiVoiceApiKey();
    }
    return !!getTextProviderApiKey();
  },

  hasGeminiVoiceKey(): boolean {
    return !!getGeminiVoiceApiKey();
  },

  hasTextProviderKey(): boolean {
    return !!getTextProviderApiKey();
  },

  async explainPosition(fen: string, moveHistory: string[] = []): Promise<string> {
    const settings = storageService.getSettings();
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

    if (settings.aiProvider && settings.aiProvider !== 'gemini') {
      try {
        return await callOpenAICompatible([{ role: 'user', parts: [{ text: prompt }] }], 'You are an expert chess mentor.');
      } catch (e: any) {
        return `AI Coach response error: ${e?.message || 'Check your API key in Settings.'}`;
      }
    }

    const ai = getGeminiClient();
    if (!ai) {
      return 'To get personalized AI position breakdowns, configure your API key in Settings.';
    }

    try {
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
    const settings = storageService.getSettings();
    if (!this.hasKey()) {
      return 'Look for undefended pieces, potential knight forks, or checks that force the opponent’s king to move.';
    }

    const prompt = `You are a chess coach giving a subtle hint to a student.
Current FEN: "${fen}"
Goal: "${goal}"
Side to move: "${playerColor}"

Provide a gentle nudge (1-2 sentences) pointing to the relevant sector of the board or tactical motif, WITHOUT explicitly spelling out the exact move coordinates. Be encouraging!`;

    if (settings.aiProvider && settings.aiProvider !== 'gemini') {
      try {
        return await callOpenAICompatible([{ role: 'user', parts: [{ text: prompt }] }], 'You are a helpful chess coach.');
      } catch {
        return 'Focus on piece activity: look for forcing moves, checks, and double attacks.';
      }
    }

    const ai = getGeminiClient();
    if (!ai) {
      return 'Look for undefended pieces, potential knight forks, or checks that force the opponent’s king to move.';
    }

    try {
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
    const settings = storageService.getSettings();
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

    if (settings.aiProvider && settings.aiProvider !== 'gemini') {
      try {
        return await callOpenAICompatible([{ role: 'user', parts: [{ text: prompt }] }], 'You are a grandmaster chess mentor.');
      } catch {
        return 'Well played! Review your moves and look for missed opportunities to control the center.';
      }
    }

    const ai = getGeminiClient();
    if (!ai) {
      return 'Game completed! Configure your API key in Settings to receive grandmaster post-game reports.';
    }

    try {
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
    systemInstruction: string
  ): Promise<string> {
    const settings = storageService.getSettings();
    const provider = settings.aiProvider || 'gemini';

    if (!getActiveApiKey()) {
      throw new Error('NO_KEY');
    }

    if (provider !== 'gemini') {
      return callOpenAICompatible(messages, systemInstruction);
    }

    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('NO_KEY');
    }

    try {
      const response = await ai.models.generateContent({
        model: rememberedTextModel,
        contents: messages,
        config: { systemInstruction },
      });
      return response.text || 'No response from AI.';
    } catch (e: any) {
      const msg = e?.message || '';
      if (
        rememberedTextModel === DEFAULT_TEXT_MODEL &&
        (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound'))
      ) {
        console.warn(`Model ${DEFAULT_TEXT_MODEL} not found, retrying with ${FALLBACK_TEXT_MODEL}...`);
        rememberedTextModel = FALLBACK_TEXT_MODEL;
        const fallbackRes = await ai.models.generateContent({
          model: rememberedTextModel,
          contents: messages,
          config: { systemInstruction },
        });
        return fallbackRes.text || 'No response from AI.';
      }
      throw e;
    }
  },

  async generateLiveCommentary(
    prompt: string,
    systemInstruction: string,
    maxSentences: number = 2
  ): Promise<string> {
    const settings = storageService.getSettings();
    const provider = settings.aiProvider || 'gemini';

    if (!getActiveApiKey()) {
      throw new Error('NO_KEY');
    }

    if (provider !== 'gemini') {
      return callOpenAICompatible([{ role: 'user', parts: [{ text: prompt }] }], systemInstruction);
    }

    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('NO_KEY');
    }

    try {
      const response = await ai.models.generateContent({
        model: rememberedTextModel,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          maxOutputTokens: 60,
          temperature: 0.7,
          thinkingConfig: { thinkingLevel: 'LOW' as any },
        },
      });
      return response.text || '';
    } catch (e: any) {
      const msg = e?.message || '';
      if (
        rememberedTextModel === DEFAULT_TEXT_MODEL &&
        (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound'))
      ) {
        console.warn(`Model ${DEFAULT_TEXT_MODEL} not found, retrying live commentary with ${FALLBACK_TEXT_MODEL}...`);
        rememberedTextModel = FALLBACK_TEXT_MODEL;
        const fallbackRes = await ai.models.generateContent({
          model: rememberedTextModel,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction,
            maxOutputTokens: 60,
            temperature: 0.7,
            thinkingConfig: { thinkingLevel: 'LOW' as any },
          },
        });
        return fallbackRes.text || '';
      }
      throw e;
    }
  },

  async generateNaturalVoiceStream(
    text: string,
    onChunk: (pcmBuffer: ArrayBuffer) => void,
    customKey?: string
  ): Promise<{ success: boolean; error?: string }> {
    const settings = storageService.getSettings();
    const voiceName = settings.geminiVoice || 'Kore';
    const cleanText = stripMarkdown(text).slice(0, 500);

    if (!cleanText) {
      return { success: false, error: 'Empty text' };
    }

    const ai = getGeminiClient(customKey || settings.geminiApiKey);
    if (!ai) {
      return { success: false, error: 'NO_KEY' };
    }

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    };

    try {
      const responseStream = await ai.models.generateContentStream({
        model: GEMINI_MODELS.TTS_PRIMARY,
        ...requestBody,
      });

      let receivedAny = false;
      let carryByte: number | null = null;
      let accumulatedBytes: number[] = [];

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data) {
            receivedAny = true;
            const chunkBuffer = base64ToArrayBuffer(p.inlineData.data);
            const chunkBytes = new Uint8Array(chunkBuffer);

            let combined: Uint8Array;
            if (carryByte !== null) {
              combined = new Uint8Array(chunkBytes.length + 1);
              combined[0] = carryByte;
              combined.set(chunkBytes, 1);
              carryByte = null;
            } else {
              combined = chunkBytes;
            }

            let processLen = combined.length;
            if (processLen % 2 !== 0) {
              carryByte = combined[combined.length - 1];
              processLen -= 1;
            }

            if (processLen > 0) {
              const evenBytes = combined.subarray(0, processLen);
              for (let i = 0; i < evenBytes.length; i++) {
                accumulatedBytes.push(evenBytes[i]);
              }
            }

            // Hold back final 120 ms (5760 bytes at 24kHz 16-bit mono)
            const holdBackBytes = 5760;
            if (accumulatedBytes.length > holdBackBytes) {
              const sendLen = accumulatedBytes.length - holdBackBytes;
              const sendBuf = new Uint8Array(sendLen);
              for (let i = 0; i < sendLen; i++) {
                sendBuf[i] = accumulatedBytes.shift()!;
              }
              onChunk(sendBuf.buffer);
            }
          }
        }
      }

      if (accumulatedBytes.length > 0) {
        const finalBuf = new Uint8Array(accumulatedBytes);
        const float32Final = processPcmToFloat32(finalBuf.buffer, {
          isFullClip: false,
          isFirstChunk: false,
          isLastChunk: true,
          sampleRate: 24000,
        });
        const pcm16Final = float32ToPcm(float32Final);
        onChunk(pcm16Final);
      }

      if (!receivedAny) {
        return { success: false, error: 'No audio chunks' };
      }

      return { success: true };
    } catch (e: any) {
      console.warn('Streaming TTS failed:', e);
      return { success: false, error: e?.message || 'Streaming failed' };
    }
  },

  async generateNaturalVoice(
    text: string,
    customKey?: string
  ): Promise<{ success: boolean; audioUrl?: string; audioBuffer?: ArrayBuffer; error?: string }> {
    const settings = storageService.getSettings();
    const voiceName = settings.geminiVoice || 'Kore';
    const cleanText = stripMarkdown(text).slice(0, 500);

    if (!cleanText) {
      return { success: false, error: 'Empty text to speak.' };
    }

    // 1. Check IndexedDB cache
    const cachedWav = await audioCacheService.getClip(cleanText, voiceName);
    if (cachedWav) {
      const audioUrl = arrayBufferToBlobUrl(cachedWav, 'audio/wav');
      return { success: true, audioUrl, audioBuffer: cachedWav };
    }

    // 2. Initialize Gemini Voice Client (Voice always uses Gemini key)
    const ai = getGeminiClient(customKey || settings.geminiApiKey);
    if (!ai) {
      return { success: false, error: 'NO_KEY: No Gemini API key found for voice features.' };
    }

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    };

    try {
      let rawBase64: string | undefined;
      let modelUsed: string = GEMINI_MODELS.TTS_PRIMARY;

      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODELS.TTS_PRIMARY,
          ...requestBody,
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data) {
            rawBase64 = p.inlineData.data;
            break;
          }
        }
      } catch (primaryErr: any) {
        const errMsg = primaryErr?.message || '';
        if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('NotFound')) {
          console.warn(`TTS Model ${GEMINI_MODELS.TTS_PRIMARY} unavailable, retrying with ${GEMINI_MODELS.TTS_FALLBACK}...`);
          modelUsed = GEMINI_MODELS.TTS_FALLBACK;
          const fallbackRes = await ai.models.generateContent({
            model: GEMINI_MODELS.TTS_FALLBACK,
            ...requestBody,
          });
          const parts = fallbackRes.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p.inlineData?.data) {
              rawBase64 = p.inlineData.data;
              break;
            }
          }
        } else {
          throw primaryErr;
        }
      }

      if (!rawBase64) {
        return {
          success: false,
          error: 'Gemini TTS responded without audio data.',
        };
      }

      const pcmBuffer = base64ToArrayBuffer(rawBase64);
      const processedWav = processRawPcmOrWavToProcessedWav(pcmBuffer, 24000);
      const audioUrl = arrayBufferToBlobUrl(processedWav, 'audio/wav');

      // Cache clip in IndexedDB
      await audioCacheService.saveClip(cleanText, voiceName, processedWav);

      return { success: true, audioUrl, audioBuffer: processedWav };
    } catch (e: any) {
      console.warn('Gemini TTS error:', e);
      let errMsg = e?.message || 'Gemini TTS request failed.';
      if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('401') || errMsg.includes('403')) {
        errMsg = 'Invalid Gemini API key. Please check your key in Settings.';
      } else if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429')) {
        errMsg = 'Gemini API quota reached (429). Speech paused.';
      } else if (errMsg.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        errMsg = 'Offline / No internet connection.';
      }
      return { success: false, error: errMsg };
    }
  },

  async transcribeAudio(
    audioBlob: Blob,
    customMimeType?: string,
    customKey?: string
  ): Promise<{ success: boolean; transcript?: string; error?: string }> {
    const settings = storageService.getSettings();
    const ai = getGeminiClient(customKey || settings.geminiApiKey);
    if (!ai) {
      return { success: false, error: 'NO_KEY: No Gemini API key found for audio transcription.' };
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

      const promptPart = { text: 'Transcribe exactly, return only the transcript' };
      const audioPart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      let resultText = '';
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODELS.STT_PRIMARY,
          contents: [{ role: 'user', parts: [audioPart, promptPart] }],
        });
        resultText = response.text || '';
      } catch (primaryErr: any) {
        const errMsg = primaryErr?.message || '';
        if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('NotFound')) {
          console.warn(`STT Model ${GEMINI_MODELS.STT_PRIMARY} unavailable, retrying with ${GEMINI_MODELS.STT_FALLBACK}...`);
          const fallbackRes = await ai.models.generateContent({
            model: GEMINI_MODELS.STT_FALLBACK,
            contents: [{ role: 'user', parts: [audioPart, promptPart] }],
          });
          resultText = fallbackRes.text || '';
        } else {
          throw primaryErr;
        }
      }

      const cleanTranscript = stripMarkdown(resultText).replace(/^["']|["']$/g, '').trim();
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

  async testVoiceConnection(key?: string): Promise<{ success: boolean; audioUrl?: string; audioBuffer?: ArrayBuffer; error?: string }> {
    return this.generateNaturalVoice('Welcome to ChessPath! Your mentor is ready.', key);
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

    if (!apiKey) {
      return { success: false, error: `No API key provided for ${provider}. Please enter a valid API key.` };
    }

    if (provider === 'gemini') {
      const ai = getGeminiClient(apiKey);
      if (!ai) {
        return { success: false, error: 'Failed to initialize Gemini client with key.' };
      }
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'Say "Chess coach connection verified!" in one short sentence.',
        });
        return { success: true, reply: response.text?.trim() || 'Connected to Gemini successfully!' };
      } catch (e: any) {
        const msg = e?.message || 'Failed to connect to Gemini.';
        return { success: false, error: msg };
      }
    }

    // OpenAI-compatible providers: groq, openrouter, bytez, openai, custom
    let baseUrl = options?.baseUrl || settings.aiBaseUrl || '';
    let modelName = options?.modelName || settings.aiModelName || '';

    if (!baseUrl) {
      if (provider === 'groq') baseUrl = 'https://api.groq.com/openai/v1';
      else if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
      else if (provider === 'bytez') baseUrl = 'https://api.bytez.com/v1';
      else if (provider === 'openai') baseUrl = 'https://api.openai.com/v1';
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
