import { GoogleGenAI } from '@google/genai';
import { PROGRESS_KEY, SETTINGS_KEY } from './storageService';

/**
 * Resolves the Gemini API key from localStorage (`chesspath_progress_v1` first,
 * then `chesspath_settings_v1`), falling back to `process.env.GEMINI_API_KEY`.
 */
function getResolvedGeminiApiKey(): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const progressRaw = localStorage.getItem(PROGRESS_KEY);
      if (progressRaw) {
        const parsed = JSON.parse(progressRaw);
        if (parsed?.geminiApiKey && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
          return parsed.geminiApiKey.trim();
        }
      }
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        const parsed = JSON.parse(settingsRaw);
        if (parsed?.geminiApiKey && typeof parsed.geminiApiKey === 'string' && parsed.geminiApiKey.trim()) {
          return parsed.geminiApiKey.trim();
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

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = getResolvedGeminiApiKey();
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error('Failed to initialize GoogleGenAI in coachService:', err);
    return null;
  }
}

export async function askCoach(
  fen: string,
  question: string,
  moveHistory: string[] = [],
  evaluation?: number
): Promise<string> {
  const ai = getGenAIClient();
  if (!ai) {
    return 'AI Coach is currently offline (no Gemini API key configured). Add your Gemini key in the Coach Settings modal, or use the local Stockfish evaluation bar and hints!';
  }

  const evalContext =
    evaluation !== undefined
      ? `Current Stockfish Evaluation: ${evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1)} (positive favors White).`
      : '';

  const prompt = `You are a friendly, world-class chess coach teaching a student on ChessPath.
Current Position (FEN): ${fen}
Recent Moves: ${moveHistory.slice(-10).join(', ') || 'Opening position'}
${evalContext}

Student's Question: "${question}"

Instructions:
- Keep your response concise (2-4 sentences max), clear, and encouraging.
- Explain the strategic or tactical "why" behind ideas (e.g. king safety, center control, pins, forks, weak squares).
- Reference concrete squares and pieces when helpful.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "I couldn't generate a response for this position.";
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound')) {
      try {
        const fallback = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return fallback.text || "I couldn't generate a response for this position.";
      } catch (fallbackErr) {
        console.error('Gemini fallback error:', fallbackErr);
      }
    }
    console.error('Gemini Coach Error:', error);
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
  const ai = getGenAIClient();
  if (!ai) {
    return `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Review your critical turns using the move list!`;
  }

  const prompt = `You are a supportive chess coach reviewing a completed game.
Result: ${result}
Moves played: ${moveHistory.join(' ')}
Stats: ${blunders} blunders, ${mistakes} mistakes, ${inaccuracies} inaccuracies.

Write a brief, encouraging 3-sentence post-game summary:
1. Acknowledge the result and overall accuracy.
2. Point out one opening or middlegame takeaway based on the moves played.
3. Give one actionable tip for the next game.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return (
      response.text ||
      `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies.`
    );
  } catch {
    return `Game Over (${result}). You made ${blunders} blunders, ${mistakes} mistakes, and ${inaccuracies} inaccuracies. Keep practicing!`;
  }
}
