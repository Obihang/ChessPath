import { Chess } from 'chess.js';
import { GoogleGenAI } from '@google/genai';
import { CoachPersonality, CoachVerbosity } from '../types/chess';
import { GEMINI_MODELS } from '../constants/aiModels';
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

export type HeuristicClassification =
  | 'brilliant'
  | 'great'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export interface HeuristicCommentary {
  text: string;
  classification: HeuristicClassification;
  evalDrop: number;
  bestMoveSan?: string;
  bestMoveUci?: string;
  tacticalReasons: string[];
}

const PERSONA_PROMPTS: Record<CoachPersonality, string> = {
  strict:
    'You are a Strict Grandmaster: direct, sharp, and demanding of precision. Do not sugarcoat mistakes; point out the concrete flaw immediately and challenge the player to find stronger continuations.',
  supportive:
    'You are a Supportive Mentor: warm, encouraging, and constructive. Frame mistakes as learning opportunities and gently guide the student toward the stronger idea.',
  aggressive:
    'You are a Tactical Attacker: energetic and focused on initiative, king hunt, sacrifices, tempo, and punishing passive play.',
  professor:
    'You are a Positional Professor: analytical and focused on pawn structure, outposts, piece coordination, king safety, and long-term strategic plans.',
};

/**
 * Resolves the user's saved coachPersonality from localStorage, defaulting to 'strict'.
 */
export function getResolvedCoachPersonality(explicitPersonality?: CoachPersonality): CoachPersonality {
  if (explicitPersonality) return explicitPersonality;
  if (typeof localStorage !== 'undefined') {
    try {
      const progressRaw = localStorage.getItem(PROGRESS_KEY);
      if (progressRaw) {
        const parsed = JSON.parse(progressRaw);
        if (parsed?.coachPersonality) return parsed.coachPersonality;
      }
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw);
        if (parsed?.coachPersonality) return parsed.coachPersonality;
      }
    } catch {
      // Ignore parse errors
    }
  }
  return 'strict';
}

/**
 * Resolves the user's saved AI API key strictly from localStorage (`chesspath_progress_v1` or `chesspath_settings_v1`).
 * Never reads process.env.
 */
export function getResolvedAiApiKey(explicitKey?: string): string {
  if (explicitKey !== undefined && explicitKey.trim() !== '') {
    return explicitKey.trim().replace(/^["'`]|["'`]$/g, '').trim();
  }

  if (explicitKey === undefined && typeof localStorage !== 'undefined') {
    try {
      const progressRaw = localStorage.getItem(PROGRESS_KEY);
      if (progressRaw) {
        const parsed = JSON.parse(progressRaw);
        const key = parsed?.aiApiKey || parsed?.geminiApiKey;
        if (key && typeof key === 'string' && key.trim()) {
          return key.trim().replace(/^["'`]|["'`]$/g, '').trim();
        }
      }
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw);
        const key = parsed?.aiApiKey || parsed?.geminiApiKey;
        if (key && typeof key === 'string' && key.trim()) {
          return key.trim().replace(/^["'`]|["'`]$/g, '').trim();
        }
      }
    } catch {
      // Ignore localStorage parse errors
    }
  }

  return '';
}

const PROVIDER_PRESETS: Record<Exclude<SmartAIProvider, 'none'>, { label: string; model: string }> = {
  gemini: { label: 'Google Gemini', model: GEMINI_MODELS.TEXT_PRIMARY },
  groq: { label: 'Groq (Llama 3.3 70B)', model: 'llama-3.3-70b-versatile' },
  openai: { label: 'OpenAI', model: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter', model: 'meta-llama/llama-3.3-70b-instruct' },
  anthropic: { label: 'Anthropic Claude', model: 'claude-3-5-haiku-latest' },
  xai: { label: 'xAI Grok', model: 'grok-2-latest' },
};

function getSavedProviderOverride(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw);
        if (parsed?.aiProvider && typeof parsed.aiProvider === 'string') {
          return parsed.aiProvider;
        }
      }
    } catch {
      // Ignore
    }
  }
  return 'auto';
}

/**
 * Automatically detects the AI provider, label, and default fast model from an API key prefix.
 * Only activates when the user has configured an API key in Settings.
 */
export function detectApiKeyProvider(
  rawKey?: string,
  explicitProvider?: string
): {
  provider: SmartAIProvider;
  label: string;
  model: string;
} {
  const key = getResolvedAiApiKey(rawKey);
  const chosenProvider = explicitProvider || getSavedProviderOverride();

  if (!key) {
    return {
      provider: 'none',
      label: 'Local Stockfish Coach (No API Key)',
      model: 'stockfish-19-local',
    };
  }

  if (
    chosenProvider &&
    chosenProvider !== 'auto' &&
    chosenProvider in PROVIDER_PRESETS
  ) {
    const preset = PROVIDER_PRESETS[chosenProvider as Exclude<SmartAIProvider, 'none'>];
    return {
      provider: chosenProvider as SmartAIProvider,
      label: preset.label,
      model: preset.model,
    };
  }

  if (key.startsWith('AIza')) {
    return { provider: 'gemini', ...PROVIDER_PRESETS.gemini };
  }
  if (key.startsWith('gsk_')) {
    return { provider: 'groq', ...PROVIDER_PRESETS.groq };
  }
  if (key.startsWith('sk-ant-')) {
    return { provider: 'anthropic', ...PROVIDER_PRESETS.anthropic };
  }
  if (key.startsWith('sk-or-')) {
    return { provider: 'openrouter', ...PROVIDER_PRESETS.openrouter };
  }
  if (key.startsWith('xai-')) {
    return { provider: 'xai', ...PROVIDER_PRESETS.xai };
  }
  if (key.startsWith('sk-')) {
    return { provider: 'openai', ...PROVIDER_PRESETS.openai };
  }

  return {
    provider: 'gemini',
    ...PROVIDER_PRESETS.gemini,
  };
}

/**
 * Returns true when an error is an abort or HTTP 4xx client/auth/quota/model error
 * where retrying fallback models adds latency without helping.
 */
export function isClientHttpError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: number; message?: string; name?: string };
  if (anyErr.name === 'AbortError') return true;
  const status = anyErr.status ?? anyErr.code;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return true;
  }
  const msg = String(anyErr.message || err || '');
  return (
    /\bHTTP 4\d\d\b/i.test(msg) ||
    /\b(400|401|403|404|429)\b/.test(msg) ||
    /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|NOT_FOUND|INVALID_ARGUMENT|RESOURCE_EXHAUSTED|AbortError|aborted/i.test(
      msg
    )
  );
}

/**
 * Client-side Gemini streaming helper using the user's API key from Settings.
 */
export async function streamSmartAI(
  prompt: string,
  systemInstruction: string,
  onChunk?: (chunkText: string) => void,
  explicitKey?: string,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const apiKey = getResolvedAiApiKey(explicitKey);
  if (!apiKey) {
    throw new Error('NO_KEY');
  }

  const ai = new GoogleGenAI({ apiKey });
  let fullText = '';

  const modelsToTry = [
    GEMINI_MODELS.TEXT_PRIMARY,
    GEMINI_MODELS.TEXT_FALLBACK,
    GEMINI_MODELS.TEXT_LEGACY_FALLBACK,
  ];
  let lastError: unknown = null;

  for (const model of modelsToTry) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 160,
          abortSignal: signal,
        },
      });

      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const text = chunk.text || '';
        if (text) {
          fullText += text;
          onChunk?.(text);
        }
      }

      if (fullText.trim()) {
        return fullText.trim();
      }
    } catch (err) {
      lastError = err;
      if (isClientHttpError(err) || signal?.aborted) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  return fullText.trim();
}

/**
 * Unified client-side multi-provider AI dispatcher supporting Gemini (via @google/genai),
 * Groq, OpenAI, OpenRouter, xAI, and Anthropic using the user's API key from Settings.
 */
export async function callSmartAI(
  prompt: string,
  systemInstruction: string,
  explicitKey?: string,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const apiKey = getResolvedAiApiKey(explicitKey);
  const detected = detectApiKeyProvider(apiKey);

  if (detected.provider === 'none' || !apiKey) {
    throw new Error('NO_KEY');
  }

  if (detected.provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    const modelsToTry = [
      detected.model || GEMINI_MODELS.TEXT_PRIMARY,
      GEMINI_MODELS.TEXT_FALLBACK,
      GEMINI_MODELS.TEXT_LEGACY_FALLBACK,
    ];
    let lastErr: unknown = null;

    for (const model of modelsToTry) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.4,
            maxOutputTokens: 180,
            abortSignal: signal,
          },
        });
        const text = (response.text || '').trim();
        if (text) return text;
      } catch (err) {
        lastErr = err;
        // Fail fast on 4xx errors or abort instead of waiting on sequential model fallbacks
        if (isClientHttpError(err) || signal?.aborted) {
          break;
        }
      }
    }

    if (lastErr instanceof Error) {
      throw lastErr;
    }
    throw new Error('Gemini returned an empty response.');
  }

  if (detected.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: detected.model,
        max_tokens: 180,
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
  const openRouterPath = ['https://openrouter.ai', 'api', 'v1', 'chat', 'completions'].join('/');
  const endpointMap: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    openrouter: openRouterPath,
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
    signal,
    headers,
    body: JSON.stringify({
      model: detected.model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 180,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`${detected.label} HTTP ${response.status}: ${errText.slice(0, 150)}`);
  }

  const data = await response.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

function uciToSanOnFen(fen: string, uci?: string): string | undefined {
  if (!uci || uci.length < 4) return undefined;
  try {
    const game = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = game.move({ from, to, promotion });
    return move ? move.san : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts concrete tactical and positional reasons from the position before and after a move.
 */
export function extractTacticalReasons(
  _prevFen: string,
  fen: string,
  moveSan: string,
  bestMoveSan?: string
): string[] {
  const reasons: string[] = [];
  try {
    const afterGame = new Chess(fen);
    if (afterGame.isCheckmate()) {
      reasons.push('delivers checkmate on the board');
    } else if (afterGame.inCheck()) {
      reasons.push('forces the opponent king to respond to check');
    }

    if (moveSan.includes('x')) {
      reasons.push('captures material and changes the tension');
    }
    if (moveSan.startsWith('O-O')) {
      reasons.push('tucks the king to safety and activates the rook');
    }
    if (['e4', 'd4', 'e5', 'd5', 'c4', 'c5'].includes(moveSan)) {
      reasons.push('fights directly for key central squares');
    }
    if (/^[NB][a-h]?[1-8]?x?[cdef][3456]/.test(moveSan)) {
      reasons.push('develops a minor piece toward the center');
    }
    if (bestMoveSan && bestMoveSan !== moveSan) {
      if (bestMoveSan.includes('x')) {
        reasons.push(`missed a stronger capture (${bestMoveSan})`);
      } else if (bestMoveSan.includes('+')) {
        reasons.push(`missed a forcing check (${bestMoveSan})`);
      } else if (bestMoveSan.startsWith('O-O')) {
        reasons.push('delayed king safety instead of castling');
      } else {
        reasons.push(`overlooked a stronger continuation (${bestMoveSan})`);
      }
    }
  } catch {
    // Ignore parse errors
  }

  if (reasons.length === 0) {
    reasons.push('repositions for piece coordination and central control');
  }
  return reasons;
}

/**
 * Generates persona-aware and verbosity-aware local heuristic commentary for a move.
 */
export function generateCommentary(
  fen: string,
  prevFen: string,
  moveSan: string,
  evalAfter: number = 0,
  evalBefore: number = 0,
  bestMoveUci?: string,
  verbosity: CoachVerbosity = 'detailed',
  personality: CoachPersonality = 'strict'
): HeuristicCommentary {
  const bestMoveSan = uciToSanOnFen(prevFen, bestMoveUci);

  const moverColor = prevFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const isLikelyCentipawns =
    Math.abs(evalBefore) > 15 ||
    Math.abs(evalAfter) > 15 ||
    (Number.isInteger(evalBefore) &&
      Number.isInteger(evalAfter) &&
      (Math.abs(evalBefore) >= 4 || Math.abs(evalAfter) >= 4));
  const normBefore = isLikelyCentipawns ? evalBefore / 100 : evalBefore;
  const normAfter = isLikelyCentipawns ? evalAfter / 100 : evalAfter;

  const moverEvalBefore = moverColor === 'w' ? normBefore : -normBefore;
  const moverEvalAfter = moverColor === 'w' ? normAfter : -normAfter;
  const evalDrop = Number(Math.max(0, moverEvalBefore - moverEvalAfter).toFixed(2));

  const isBest = !!(bestMoveSan && bestMoveSan === moveSan);
  let classification: HeuristicClassification = 'good';

  if (evalDrop >= 2.2) {
    classification = 'blunder';
  } else if (evalDrop >= 1.0) {
    classification = 'mistake';
  } else if (evalDrop >= 0.5) {
    classification = 'inaccuracy';
  } else if (isBest && (moveSan.includes('+') || moveSan.includes('x')) && evalDrop <= 0.05) {
    classification = 'brilliant';
  } else if (isBest) {
    classification = 'great';
  }

  const tacticalReasons = extractTacticalReasons(prevFen, fen, moveSan, bestMoveSan);

  const text = buildFallbackMoveComment(
    {
      moveSan,
      classification,
      evalDrop,
      bestMoveSan,
      tacticalReasons,
    },
    verbosity,
    personality
  );

  return {
    text,
    classification,
    evalDrop,
    bestMoveSan,
    bestMoveUci,
    tacticalReasons,
  };
}

export async function askCoach(
  fen: string,
  question: string,
  moveHistory: string[] = [],
  evaluation?: number,
  personality?: CoachPersonality,
  verbosity?: CoachVerbosity
): Promise<string> {
  const activePersonality = getResolvedCoachPersonality(personality);
  const detected = detectApiKeyProvider();
  if (detected.provider === 'none') {
    return 'AI Coach is currently offline (no AI API key configured). Add your Gemini, Groq, OpenAI, Anthropic, or OpenRouter key in the Coach Settings modal, or use the local Stockfish evaluation bar and hints!';
  }

  const evalContext =
    evaluation !== undefined
      ? `Current Stockfish Evaluation: ${evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1)} (positive favors White).`
      : '';

  const lengthRule =
    verbosity === 'brief'
      ? 'Keep your response to 1-2 short sentences.'
      : verbosity === 'verbose'
      ? 'Provide a thorough 3-4 sentence tactical and positional explanation.'
      : 'Keep your response concise (2-3 sentences max), clear, and actionable.';

  const systemInstruction = `${PERSONA_PROMPTS[activePersonality]}
${lengthRule} Reference concrete squares and pieces in plain spoken text without markdown formatting.`;

  const prompt = `Current Position (FEN): ${fen}
Recent Moves: ${moveHistory.slice(-10).join(', ') || 'Opening position'}
${evalContext}

Student's Question: "${question}"

Instructions:
- Stay strictly in your ${activePersonality} coach persona.
- ${lengthRule}
- Explain the strategic or tactical "why" behind ideas (e.g. king safety, center control, pins, forks, weak squares).`;

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
  inaccuracies: number,
  personality?: CoachPersonality,
  _verbosity?: CoachVerbosity
): Promise<string> {
  const activePersonality = getResolvedCoachPersonality(personality);
  const detected = detectApiKeyProvider();
  if (detected.provider === 'none') {
    if (activePersonality === 'strict') {
      return `Game Over (${result}). You committed ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Eliminate those tactical oversights by reviewing each critical turn in the move list.`;
    }
    if (activePersonality === 'aggressive') {
      return `Game Over (${result})! You had ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Look for missed attacking chances and forcing checks in the move list!`;
    }
    if (activePersonality === 'professor') {
      return `Game Over (${result}). Structural review shows ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Examine the move list to see where piece coordination shifted.`;
    }
    return `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Review your critical turns using the move list!`;
  }

  const systemInstruction = `${PERSONA_PROMPTS[activePersonality]}
Write a brief, 3-sentence post-game review in plain text (no markdown).`;

  const prompt = `Result: ${result}
Moves played: ${moveHistory.join(' ')}
Stats: ${blunders} blunders, ${mistakes} mistakes, ${inaccuracies} inaccuracies.

Write a 3-sentence post-game summary in your ${activePersonality} persona:
1. Evaluate the result and overall accuracy (${blunders} blunders, ${mistakes} mistakes, ${inaccuracies} inaccuracies).
2. Point out one opening or middlegame takeaway based on the moves played.
3. Give one concrete, actionable directive for the next game.`;

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
  signal?: AbortSignal;
}

export function buildFallbackMoveComment(
  facts: {
    moveSan: string;
    classification: string;
    evalDrop?: number | null;
    bestMoveSan?: string;
    tacticalReasons?: string[];
  },
  verbosity: CoachVerbosity = 'detailed',
  personality: CoachPersonality = 'strict'
): string {
  if (verbosity === 'silent') return '';

  const activePersonality = getResolvedCoachPersonality(personality);
  const { moveSan, classification, bestMoveSan, tacticalReasons = [] } = facts;
  const rawDrop = typeof facts.evalDrop === 'number' ? Math.max(0, facts.evalDrop) : 0;
  const dropPawns = rawDrop > 15 ? Number((rawDrop / 100).toFixed(2)) : Number(rawDrop.toFixed(2));
  const primaryReason =
    tacticalReasons[0] || 'maintains piece coordination and central control';

  const showExactBestMove = verbosity === 'verbose' && bestMoveSan && bestMoveSan !== moveSan;
  const suggestionText = showExactBestMove
    ? `You should have played ${bestMoveSan} instead.`
    : bestMoveSan && bestMoveSan !== moveSan
    ? bestMoveSan.includes('x')
      ? 'Look for the active capture that wins material or relieves pressure.'
      : bestMoveSan.includes('+')
      ? 'Look for a forcing check that seizes the initiative.'
      : 'Focus on active piece development and central control.'
    : 'Keep your pieces coordinated and defended.';

  let text = '';

  if (classification === 'blunder') {
    switch (activePersonality) {
      case 'strict':
        text = `Serious blunder with ${moveSan}! You dropped ${dropPawns.toFixed(1)} pawns of evaluation. ${suggestionText}`;
        break;
      case 'supportive':
        text = `Careful—${moveSan} is a blunder that leaves a tactical opening. ${suggestionText}`;
        break;
      case 'aggressive':
        text = `${moveSan} hands the attack straight to your opponent! ${suggestionText}`;
        break;
      case 'professor':
        text = `${moveSan} is a critical oversight costing ${dropPawns.toFixed(1)} pawns in evaluation. ${suggestionText}`;
        break;
    }
  } else if (classification === 'mistake') {
    switch (activePersonality) {
      case 'strict':
        text = `Mistake with ${moveSan}. That concedes key squares and costs valuable tempo. ${suggestionText}`;
        break;
      case 'supportive':
        text = `${moveSan} is a mistake here—there was a stronger way to coordinate your pieces. ${suggestionText}`;
        break;
      case 'aggressive':
        text = `${moveSan} is too passive and lets your opponent seize the initiative! ${suggestionText}`;
        break;
      case 'professor':
        text = `${moveSan} weakens your position and drops ${dropPawns.toFixed(1)} pawns. ${suggestionText}`;
        break;
    }
  } else if (classification === 'inaccuracy') {
    switch (activePersonality) {
      case 'strict':
        text = `Inaccurate play with ${moveSan}. Look for a sharper continuation. ${suggestionText}`;
        break;
      case 'supportive':
        text = `${moveSan} is playable, though a slightly more accurate plan was available. ${suggestionText}`;
        break;
      case 'aggressive':
        text = `${moveSan} misses a chance to put maximum pressure on your opponent. ${suggestionText}`;
        break;
      case 'professor':
        text = `${moveSan} is a minor inaccuracy that concedes a small positional edge. ${suggestionText}`;
        break;
    }
  } else if (classification === 'best' || classification === 'great' || classification === 'brilliant') {
    switch (activePersonality) {
      case 'strict':
        text = `Accurate move with ${moveSan}. That matches the engine's top choice and ${primaryReason}.`;
        break;
      case 'supportive':
        text = `Excellent find! ${moveSan} is the strongest move on the board and ${primaryReason}.`;
        break;
      case 'aggressive':
        text = `Powerful play! ${moveSan} keeps maximum pressure on the board and ${primaryReason}.`;
        break;
      case 'professor':
        text = `Principled execution with ${moveSan}, which ${primaryReason} and maintains optimal harmony.`;
        break;
    }
  } else {
    switch (activePersonality) {
      case 'strict':
        text = `Solid move ${moveSan}, which ${primaryReason}. Keep calculating forcing replies.`;
        break;
      case 'supportive':
        text = `Good move! ${moveSan} ${primaryReason} and keeps your position healthy.`;
        break;
      case 'aggressive':
        text = `Good move ${moveSan}—now look to build attacking momentum on the next turn.`;
        break;
      case 'professor':
        text = `Sound positional choice with ${moveSan}, as it ${primaryReason}.`;
        break;
    }
  }

  if (verbosity === 'brief') {
    const firstSentence = text.split(/(?<=[.!])\s+/)[0] || text;
    return firstSentence;
  }

  return text;
}

/**
 * Fast, concise live coach reaction to a player's move (1 crisp sentence <= 18 words)
 * that analyzes the move according to coachPersonality and coachVerbosity.
 * Cleanly falls back to buildFallbackMoveComment if no API key is set or if the AI call fails/aborts.
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
  signal,
}: AnalyzeMoveWithAIInput): Promise<string> {
  if (verbosity === 'silent' || signal?.aborted) return '';

  const activePersonality = getResolvedCoachPersonality(personality);
  const rawDrop = typeof evalDrop === 'number' ? Math.max(0, evalDrop) : 0;
  const normalizedDropPawns = rawDrop > 15 ? Number((rawDrop / 100).toFixed(2)) : Number(rawDrop.toFixed(2));

  const fallbackText = buildFallbackMoveComment(
    {
      moveSan,
      classification,
      evalDrop: normalizedDropPawns,
      bestMoveSan,
      tacticalReasons,
    },
    verbosity,
    activePersonality
  );

  const detected = detectApiKeyProvider();
  if (detected.provider === 'none') {
    return fallbackText;
  }

  const verbosityDescriptions: Record<CoachVerbosity, string> = {
    silent: 'Output nothing.',
    brief: 'Reply in 1 crisp sentence (max 18 words).',
    detailed: 'Reply in 1 crisp sentence (max 18 words). State why it works or what idea was stronger.',
    verbose: `Reply in 1 crisp sentence (max 18 words). State the tactical key or stronger move (${bestMoveSan || 'engine line'}).`,
  };

  const spoilerRule =
    verbosity === 'verbose'
      ? `Name the best move (${bestMoveSan || 'top engine move'}) succinctly.`
      : `Do NOT state exact move notation "${bestMoveSan || ''}"; mention the strategic idea only.`;

  const systemInstruction = `${PERSONA_PROMPTS[activePersonality]}
${verbosityDescriptions[verbosity]}
Rules:
- Output 1 crisp sentence of PLAIN SPOKEN TEXT ONLY, max 18 words (no markdown, no asterisks).
- Respect the move classification "${classification}".
- ${spoilerRule}`;

  const dropInfo =
    evalDrop !== undefined && evalDrop !== null
      ? `Eval drop: ${normalizedDropPawns.toFixed(2)}p.`
      : '';

  const prompt = `Before: ${prevFen}
Move: ${moveSan} (${classification}) ${dropInfo}
After: ${fen}
Best: ${bestMoveSan || 'N/A'}
Notes: ${tacticalReasons.slice(0, 2).join('; ') || 'Positional play'}
Spoken 1-sentence reaction (<=18 words):`;

  try {
    const aiReply = await callSmartAI(prompt, systemInstruction, undefined, signal);
    if (signal?.aborted) return '';
    return aiReply || fallbackText;
  } catch {
    return signal?.aborted ? '' : fallbackText;
  }
}
