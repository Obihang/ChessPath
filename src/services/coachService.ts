import { GoogleGenAI } from '@google/genai';
import { CoachPersonality, CoachVerbosity } from '../types/chess';
import { PROGRESS_KEY, SETTINGS_KEY } from './storageService';

export type SmartAIProvider =
  | 'gemini'
  | 'groq'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'xai'
  | 'none';

export interface DetectedProviderInfo {
  provider: SmartAIProvider;
  label: string;
  model: string;
  apiKey: string;
}

/**
 * Resolves the user's saved AI API key from localStorage (`chesspath_progress_v1` or `chesspath_settings_v1`),
 * falling back to `process.env.GEMINI_API_KEY`.
 */
export function getResolvedAiApiKey(explicitKey?: string): string {
  if (explicitKey !== undefined && explicitKey.trim() !== '') {
    return explicitKey.trim();
  }

  if (explicitKey === undefined && typeof localStorage !== 'undefined') {
    try {
      const progressRaw = localStorage.getItem(PROGRESS_KEY);
      if (progressRaw) {
        const parsed = JSON.parse(progressRaw);
        const key = parsed?.aiApiKey || parsed?.geminiApiKey;
        if (key && typeof key === 'string' && key.trim()) {
          return key.trim();
        }
      }
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw);
        const key = parsed?.aiApiKey || parsed?.geminiApiKey;
        if (key && typeof key === 'string' && key.trim()) {
          return key.trim();
        }
      }
    } catch {
      // Ignore localStorage parse errors
    }
  }

  const envKey =
    (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '') ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    '';
  return envKey.trim();
}

/**
 * Automatically detects the AI provider, label, and default fast model from an API key prefix.
 */
export function detectApiKeyProvider(rawKey?: string): {
  provider: SmartAIProvider;
  label: string;
  model: string;
} {
  const key = getResolvedAiApiKey(rawKey);

  if (!key) {
    return {
      provider: 'none',
      label: 'Using Built-in Environment Key / Offline Heuristics',
      model: 'offline',
    };
  }

  if (key.startsWith('AIza')) {
    return {
      provider: 'gemini',
      label: 'Google Gemini',
      model: 'gemini-2.5-flash',
    };
  }
  if (key.startsWith('gsk_')) {
    return {
      provider: 'groq',
      label: 'Groq (Llama 3.3 70B)',
      model: 'llama-3.3-70b-versatile',
    };
  }
  if (key.startsWith('sk-ant-')) {
    return {
      provider: 'anthropic',
      label: 'Anthropic Claude',
      model: 'claude-3-5-haiku-latest',
    };
  }
  if (key.startsWith('sk-or-')) {
    return {
      provider: 'openrouter',
      label: 'OpenRouter',
      model: 'meta-llama/llama-3.3-70b-instruct',
    };
  }
  if (key.startsWith('xai-')) {
    return {
      provider: 'xai',
      label: 'xAI Grok',
      model: 'grok-2-latest',
    };
  }
  if (key.startsWith('sk-')) {
    return {
      provider: 'openai',
      label: 'OpenAI',
      model: 'gpt-4o-mini',
    };
  }

  return {
    provider: 'openai',
    label: 'OpenAI-Compatible Key',
    model: 'gpt-4o-mini',
  };
}

/**
 * Unified multi-provider AI dispatcher supporting Gemini, Groq, OpenAI, OpenRouter, xAI, and Anthropic.
 */
export async function callSmartAI(
  prompt: string,
  systemInstruction: string,
  explicitKey?: string
): Promise<string> {
  const apiKey = getResolvedAiApiKey(explicitKey);
  const detected = detectApiKeyProvider(apiKey);

  if (detected.provider === 'none' || !apiKey) {
    throw new Error('NO_KEY');
  }

  if (detected.provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    try {
      const response = await ai.models.generateContent({
        model: detected.model,
        contents: prompt,
        config: {
          systemInstruction,
        },
      });
      return (response.text || '').trim();
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound')) {
        const fallback = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            systemInstruction,
          },
        });
        return (fallback.text || '').trim();
      }
      throw err;
    }
  }

  if (detected.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: detected.model,
        max_tokens: 300,
        system: systemInstruction,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Anthropic HTTP ${response.status}: ${errText.slice(0, 150)}`);
    }

    const data = await response.json();
    const contentBlock = Array.isArray(data?.content)
      ? data.content.find((b: any) => b.type === 'text')
      : null;
    return (contentBlock?.text || '').trim();
  }

  // OpenAI-compatible endpoints: Groq, OpenAI, OpenRouter, xAI
  const endpointMap: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
  };

  const url = endpointMap[detected.provider] || endpointMap.openai;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (detected.provider === 'openrouter' && typeof window !== 'undefined') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'ChessPath AI Coach';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: detected.model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`${detected.label} HTTP ${response.status}: ${errText.slice(0, 150)}`);
  }

  const data = await response.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

export async function askCoach(
  fen: string,
  question: string,
  moveHistory: string[] = [],
  evaluation?: number
): Promise<string> {
  const detected = detectApiKeyProvider();
  if (detected.provider === 'none') {
    return 'AI Coach is currently offline (no AI API key configured). Add your Gemini, Groq, OpenAI, Anthropic, or OpenRouter key in the Coach Settings modal, or use the local Stockfish evaluation bar and hints!';
  }

  const evalContext =
    evaluation !== undefined
      ? `Current Stockfish Evaluation: ${evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1)} (positive favors White).`
      : '';

  const systemInstruction =
    'You are a world-class chess coach teaching a student on ChessPath. Keep your response concise (2-4 sentences max), clear, and actionable. Reference concrete squares and pieces without markdown clutter.';

  const prompt = `Current Position (FEN): ${fen}
Recent Moves: ${moveHistory.slice(-10).join(', ') || 'Opening position'}
${evalContext}

Student's Question: "${question}"

Instructions:
- Keep your response concise (2-4 sentences max), clear, and encouraging.
- Explain the strategic or tactical "why" behind ideas (e.g. king safety, center control, pins, forks, weak squares).
- Reference concrete squares and pieces when helpful.`;

  try {
    const reply = await callSmartAI(prompt, systemInstruction);
    return reply || "I couldn't generate a response for this position.";
  } catch (error) {
    console.error('Smart AI Coach Error:', error);
    return 'Unable to reach AI Coach right now. Check your internet connection or API key, and rely on the local engine evaluation!';
  }
}

export async function generateGameSummary(
  moveHistory: string[],
  result: string,
  blunders: number,
  mistakes: number,
  inaccuracies: number
): Promise<string> {
  const detected = detectApiKeyProvider();
  if (detected.provider === 'none') {
    return `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Review your critical turns using the move list!`;
  }

  const systemInstruction =
    'You are an insightful chess coach reviewing a completed game. Write a brief, encouraging 3-sentence post-game summary in plain text.';

  const prompt = `Result: ${result}
Moves played: ${moveHistory.join(' ')}
Stats: ${blunders} blunders, ${mistakes} mistakes, ${inaccuracies} inaccuracies.

Write a brief, encouraging 3-sentence post-game summary:
1. Acknowledge the result and overall accuracy.
2. Point out one opening or middlegame takeaway based on the moves played.
3. Give one actionable tip for the next game.`;

  try {
    const reply = await callSmartAI(prompt, systemInstruction);
    return (
      reply ||
      `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies.`
    );
  } catch {
    return `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Keep practicing!`;
  }
}

export interface AnalyzeMoveWithAIInput {
  fen: string;
  prevFen: string;
  moveSan: string;
  classification: string;
  evalDrop?: number | null;
  bestMoveSan?: string;
  tacticalReasons?: string[];
  verbosity?: CoachVerbosity;
  personality?: CoachPersonality;
}

/**
 * Fast, concise live coach reaction to a player's move that analyzes the move,
 * criticizes mistakes/blunders, and suggests the better plan or move according to
 * the chosen coachPersonality and coachVerbosity.
 */
export async function analyzeMoveWithAI({
  fen,
  prevFen,
  moveSan,
  classification,
  evalDrop,
  bestMoveSan,
  tacticalReasons = [],
  verbosity = 'detailed',
  personality = 'strict',
}: AnalyzeMoveWithAIInput): Promise<string> {
  const personaDescriptions: Record<CoachPersonality, string> = {
    strict:
      'You are a Strict Grandmaster: direct, sharp, and demanding of precision. Do not sugarcoat mistakes; point out the concrete flaw immediately and challenge the player to find stronger continuations.',
    supportive:
      'You are a Supportive Mentor: warm, encouraging, and constructive. Frame mistakes as learning opportunities and gently guide the student toward the stronger idea.',
    aggressive:
      'You are a Tactical Attacker: energetic and focused on initiative, king hunt, sacrifices, tempo, and punishing passive play.',
    professor:
      'You are a Positional Professor: analytical and focused on pawn structure, outposts, piece coordination, king safety, and long-term strategic plans.',
  };

  const verbosityDescriptions: Record<CoachVerbosity, string> = {
    silent: 'Output nothing.',
    brief:
      'Keep it to 1 punchy sentence (max 22 words). Criticize why the mistake/blunder fails and hint at the better plan without spoiling the exact move.',
    detailed:
      'Keep it to 1-2 sentences (max 38 words). Analyze the move, criticize any flaw or praise strong execution, and suggest the strategic/tactical idea behind the best continuation without spoiling the exact move name.',
    verbose:
      `Keep it to 2 sentences (max 50 words). Give a deep tactical and positional breakdown of ${moveSan}, explicitly naming the engine's best move (${bestMoveSan || 'the top engine line'}) and explaining why it is superior.`,
  };

  if (verbosity === 'silent') return '';

  const spoilerRule =
    verbosity === 'verbose'
      ? `Explicitly name the best move (${bestMoveSan || 'the engine recommendation'}) and explain the concrete continuation.`
      : `Do NOT spoil the exact move notation "${bestMoveSan || ''}" directly; instead, describe the tactical motif or strategic plan the player should look for.`;

  const systemInstruction = `${personaDescriptions[personality]}
${verbosityDescriptions[verbosity]}
Rules:
- Output PLAIN SPOKEN TEXT ONLY (no markdown, no asterisks, no bullet points).
- ${spoilerRule}`;

  const dropInfo =
    evalDrop !== undefined && evalDrop !== null
      ? `Evaluation drop: ${typeof evalDrop === 'number' ? evalDrop.toFixed(2) : evalDrop} pawns.`
      : '';

  const prompt = `Position before move (FEN): ${prevFen}
Move played: ${moveSan}
Position after move (FEN): ${fen}
Move classification: ${classification}
${dropInfo}
Engine best move: ${bestMoveSan || 'N/A'}
Tactical/positional notes: ${tacticalReasons.join('; ') || 'Standard positional play'}

Give your live spoken reaction to ${moveSan}:`;

  return await callSmartAI(prompt, systemInstruction);
}
