import { Chess } from 'chess.js';
import { CoachPersonality, CoachVerbosity } from '../types/chess';

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

/**
 * Converts a UCI move string (e.g. "g1f3") on a given FEN into SAN (e.g. "Nf3").
 */
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
  prevFen: string,
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

  // Determine mover color from prevFen
  const moverColor = prevFen.split(' ')[1] === 'b' ? 'b' : 'w';
  // evalBefore & evalAfter may be in pawns or centipawns; normalize to pawns from mover's perspective
  const normBefore = Math.abs(evalBefore) > 25 ? evalBefore / 100 : evalBefore;
  const normAfter = Math.abs(evalAfter) > 25 ? evalAfter / 100 : evalAfter;

  const moverEvalBefore = moverColor === 'w' ? normBefore : -normBefore;
  const moverEvalAfter = moverColor === 'w' ? normAfter : -normAfter;
  const evalDrop = Math.max(0, moverEvalBefore - moverEvalAfter);

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

  if (verbosity === 'silent') {
    return {
      text: '',
      classification,
      evalDrop,
      bestMoveSan,
      bestMoveUci,
      tacticalReasons,
    };
  }

  const showExactBestMove = verbosity === 'verbose' && bestMoveSan;
  const suggestionText = showExactBestMove
    ? `You should have played ${bestMoveSan} to seize the initiative.`
    : bestMoveSan?.includes('x')
    ? 'Look for the active capture that wins material or relieves pressure.'
    : bestMoveSan?.includes('+')
    ? 'Look for a forcing check that seizes tempo.'
    : 'Focus on developing your pieces toward the center and keeping every piece defended.';

  let text = '';

  if (classification === 'blunder') {
    switch (personality) {
      case 'strict':
        text = `Serious blunder with ${moveSan}! You dropped ${evalDrop.toFixed(1)} pawns of evaluation and left your position tactically compromised. ${suggestionText}`;
        break;
      case 'supportive':
        text = `Careful—${moveSan} is a blunder that gives away a big tactical chance. Take a breath and check for undefended pieces. ${suggestionText}`;
        break;
      case 'aggressive':
        text = `${moveSan} hands the initiative straight to your opponent and invites an immediate counterattack! ${suggestionText}`;
        break;
      case 'professor':
        text = `${moveSan} is a critical structural and tactical oversight, losing ${evalDrop.toFixed(1)} pawns of value. ${suggestionText}`;
        break;
    }
  } else if (classification === 'mistake') {
    switch (personality) {
      case 'strict':
        text = `Mistake with ${moveSan}. That move surrenders control of key squares and costs valuable tempo. ${suggestionText}`;
        break;
      case 'supportive':
        text = `${moveSan} is a mistake here—there was a more active way to coordinate your pieces. ${suggestionText}`;
        break;
      case 'aggressive':
        text = `${moveSan} is too passive and lets your opponent off the hook! Look for forcing threats instead. ${suggestionText}`;
        break;
      case 'professor':
        text = `${moveSan} weakens your coordination and drops ${evalDrop.toFixed(1)} pawns in evaluation. ${suggestionText}`;
        break;
    }
  } else if (classification === 'inaccuracy') {
    switch (personality) {
      case 'strict':
        text = `Inaccurate play with ${moveSan}. Precision matters—don't drift when a sharper plan is available. ${suggestionText}`;
        break;
      case 'supportive':
        text = `${moveSan} is playable, though a slightly more accurate continuation was available. ${suggestionText}`;
        break;
      case 'aggressive':
        text = `${moveSan} misses a chance to apply maximum pressure on your opponent. ${suggestionText}`;
        break;
      case 'professor':
        text = `${moveSan} is a minor inaccuracy that concedes a small positional edge. ${suggestionText}`;
        break;
    }
  } else if (classification === 'great' || classification === 'brilliant') {
    switch (personality) {
      case 'strict':
        text = `Accurate move with ${moveSan}. That matches the engine's top choice and ${tacticalReasons[0]}.`;
        break;
      case 'supportive':
        text = `Excellent find! ${moveSan} is the strongest move on the board and ${tacticalReasons[0]}.`;
        break;
      case 'aggressive':
        text = `Powerful play! ${moveSan} keeps maximum pressure on the board and ${tacticalReasons[0]}.`;
        break;
      case 'professor':
        text = `Principled execution with ${moveSan}, which ${tacticalReasons[0]} and maintains optimal harmony.`;
        break;
    }
  } else {
    switch (personality) {
      case 'strict':
        text = `Solid move ${moveSan}, which ${tacticalReasons[0]}. Keep calculating forcing replies.`;
        break;
      case 'supportive':
        text = `Good move! ${moveSan} ${tacticalReasons[0]} and keeps your position healthy.`;
        break;
      case 'aggressive':
        text = `Decent move ${moveSan}—now look to build attacking momentum on the next turn.`;
        break;
      case 'professor':
        text = `Sound positional choice with ${moveSan}, as it ${tacticalReasons[0]}.`;
        break;
    }
  }

  if (verbosity === 'brief') {
    // Keep brief commentary to the first 1-2 short sentences
    const firstSentence = text.split(/(?<=[.!])\s+/)[0] || text;
    text = firstSentence;
  }

  return {
    text,
    classification,
    evalDrop,
    bestMoveSan,
    bestMoveUci,
    tacticalReasons,
  };
}
