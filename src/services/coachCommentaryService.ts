import { Chess } from 'chess.js';
import { CoachMode } from '../types/chess';
import { geminiService } from './geminiService';
import { speechService } from './speechService';
import { engineService } from './engineService';
import { storageService } from './storageService';
import { enforceLengthCaps } from '../utils/audioUtils';

export type MoveClassification = 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'unavailable';

export interface MoveFacts {
  fen: string;
  previousFen: string;
  moveSan: string;
  moveUci: string;
  moverColor: 'w' | 'b';
  evalBefore: number | null; // mover's perspective (cp)
  evalAfter: number | null;  // mover's perspective (cp)
  mateBefore?: number | null;
  mateAfter?: number | null;
  cpLoss: number | null;
  isEvaluationAvailable: boolean;
  isBestMove: boolean;
  bestMoveSan?: string;
  bestMoveUci?: string;
  opponentReplySan?: string;
  bestNextMoveSan?: string;
  isCapture: boolean;
  isCheck: boolean;
  isCastling: boolean;
  isPromotion: boolean;
  isSacrifice: boolean;
  classification: MoveClassification;
  gamePhase: 'opening' | 'middlegame' | 'endgame';
  isPhaseChange?: boolean;
  evalSwing: number | null;
}

export interface CommentaryResult {
  id?: string;
  comment: string;
  facts: MoveFacts;
  mode: CoachMode;
  source: 'gemini' | 'template' | 'cache';
  isRateLimited?: boolean;
  timestamp?: Date;
}

export interface MoveTimingDiagnostic {
  moveSan: string;
  mover: 'player' | 'opponent';
  engineMs: number;
  textGenMs: number;
  timeToFirstAudioMs: number;
  totalMs: number;
  timestamp: string;
}

const timingLogs: MoveTimingDiagnostic[] = [];

export function recordMoveTiming(entry: MoveTimingDiagnostic) {
  timingLogs.unshift(entry);
  if (timingLogs.length > 5) {
    timingLogs.pop();
  }
  console.log(
    `[CoachTiming] Move ${entry.moveSan} (${entry.mover}): Engine ${entry.engineMs}ms | Text ${entry.textGenMs}ms | FirstAudio ${entry.timeToFirstAudioMs}ms | Total ${entry.totalMs}ms`
  );
}

export function getMoveTimingLogs(): MoveTimingDiagnostic[] {
  return [...timingLogs];
}

/**
 * Pure module-level helpers for mode limits.
 * Guarantees no runtime failure from object method binding.
 */
export function getMaxSentencesForMode(mode: CoachMode): number {
  switch (mode) {
    case 'learning':
      return 4;
    case 'criticizing':
      return 3;
    case 'simple':
      return 2;
    case 'competitive':
      return 3;
    default:
      return 4;
  }
}

export function getMaxWordsForMode(mode: CoachMode): number {
  switch (mode) {
    case 'learning':
      return 65;
    case 'criticizing':
      return 50;
    case 'simple':
      return 20;
    case 'competitive':
      return 40;
    default:
      return 65;
  }
}

/**
 * Pure helper for move classification based on genuine engine evaluation.
 * Never fabricates 'good' move on missing evaluations.
 */
export function classifyMove(
  cpLoss: number | null,
  isBestMove: boolean,
  isSacrifice: boolean = false,
  isEvaluationAvailable: boolean = true
): MoveClassification {
  if (!isEvaluationAvailable || cpLoss === null) {
    return 'unavailable';
  }
  if (isBestMove || (isSacrifice && cpLoss <= 25)) {
    return 'great';
  }
  if (cpLoss > 250) {
    return 'blunder';
  }
  if (cpLoss > 100) {
    return 'mistake';
  }
  if (cpLoss > 50) {
    return 'inaccuracy';
  }
  return 'good';
}

// Versioned in-memory cache by full move context (previousFen + moveUci + currentFen + mode)
const CACHE_VERSION = 'v2.1';
const commentaryCache = new Map<string, string>();

interface PrecomputeEntry {
  score: number | null;
  mate: number | null;
  bestMoveUci: string;
  isAvailable: boolean;
}
const precomputeCache = new Map<string, PrecomputeEntry>();

// 429 cooldown state
let rateLimitedUntil = 0;

// Listeners for live commentary events
type CommentaryListener = (result: CommentaryResult) => void;
const commentaryListeners = new Set<CommentaryListener>();

export const coachCommentaryService = {
  getMaxSentencesForMode(mode: CoachMode): number {
    return getMaxSentencesForMode(mode);
  },

  getMaxWordsForMode(mode: CoachMode): number {
    return getMaxWordsForMode(mode);
  },

  /**
   * Precomputes evaluation for player's turn in background while player thinks
   */
  async precomputePlayerTurn(fen: string): Promise<void> {
    if (precomputeCache.has(fen)) return;
    try {
      const res = await engineService.evaluate(fen, 250);
      if (res.isAvailable) {
        precomputeCache.set(fen, {
          score: res.score,
          mate: res.mate,
          bestMoveUci: res.bestMove || '',
          isAvailable: true,
        });
        if (precomputeCache.size > 20) {
          const oldestKey = Array.from(precomputeCache.keys())[0];
          precomputeCache.delete(oldestKey);
        }
      }
    } catch {
      // Ignored
    }
  },

  /**
   * Classify move based on engine centipawn loss and flags
   */
  classifyMove(
    cpLoss: number | null,
    isBestMove: boolean,
    isSacrifice: boolean = false,
    isEvaluationAvailable: boolean = true
  ): MoveClassification {
    return classifyMove(cpLoss, isBestMove, isSacrifice, isEvaluationAvailable);
  },

  /**
   * Determine if the selected mode should comment on this move.
   * Player moves ALWAYS get feedback in ALL modes.
   * Opponent moves get a comment ONLY for big eval swing (>=150 cp), check, or blunder.
   */
  shouldModeComment(mode: CoachMode, facts: MoveFacts, isPlayerMove: boolean): boolean {
    if (isPlayerMove) {
      return true; // Always give feedback on player moves in ALL modes!
    }
    return (
      (facts.evalSwing !== null && facts.evalSwing >= 150) ||
      facts.isCheck ||
      facts.classification === 'blunder'
    );
  },

  /**
   * Strip markdown formatting and enforce strict word & sentence caps per coach mode
   */
  cleanAndTruncateComment(rawText: string, mode: CoachMode): string {
    return enforceLengthCaps(rawText, mode);
  },

  /**
   * Short truthful template comment built from engine facts without Gemini
   */
  getFallbackComment(facts: MoveFacts, mode: CoachMode): string {
    const better = facts.bestMoveSan ? ` The engine preferred ${facts.bestMoveSan}.` : '';

    if (facts.classification === 'unavailable') {
      const candidate = facts.bestMoveSan ? ` Engine candidate was ${facts.bestMoveSan}.` : '';
      if (facts.isCheck) return `Check on the king!${candidate}`;
      if (facts.isCapture) return `Capture played.${candidate}`;
      if (facts.isCastling) return `Castled to safety.${candidate}`;
      if (facts.isBestMove && facts.bestMoveSan) {
        return `You played ${facts.moveSan}, matching the engine candidate move. Detailed quality analysis was unavailable.`;
      }
      return `You played ${facts.moveSan}.${candidate} Engine evaluation was unavailable.`;
    }

    if (facts.classification === 'blunder') {
      return `Blunder with ${facts.moveSan}.${better} Look out for tactical vulnerabilities and piece safety.`;
    }
    if (facts.classification === 'mistake') {
      return `Mistake with ${facts.moveSan}.${better} Consider piece activity and controlling key squares.`;
    }
    if (facts.classification === 'inaccuracy') {
      return `Inaccuracy.${better} Focus on piece coordination and pawn levers.`;
    }
    if (facts.classification === 'great') {
      return facts.isBestMove
        ? `Great move! ${facts.moveSan} matches Stockfish's top recommendation.`
        : `Brilliant tactical resource played with ${facts.moveSan}!`;
    }
    if (facts.isCheck) {
      return `Check on the opponent's king with ${facts.moveSan}!`;
    }
    if (facts.isCapture) {
      return `Solid capture with ${facts.moveSan}.`;
    }
    if (mode === 'simple') {
      return `Good move playing ${facts.moveSan}.`;
    }
    return `Solid position with ${facts.moveSan}. Maintain central control and piece development.`;
  },

  /**
   * Check if rate limit pause is active
   */
  isRateLimited(): { active: boolean; secondsRemaining: number } {
    const now = Date.now();
    if (now < rateLimitedUntil) {
      return {
        active: true,
        secondsRemaining: Math.ceil((rateLimitedUntil - now) / 1000),
      };
    }
    return { active: false, secondsRemaining: 0 };
  },

  /**
   * Reset rate limit (for tests)
   */
  resetRateLimit(): void {
    rateLimitedUntil = 0;
  },

  /**
   * Clear commentary cache (for tests)
   */
  clearCache(): void {
    commentaryCache.clear();
    precomputeCache.clear();
  },

  /**
   * Generate live commentary for a move based on engine facts
   */
  async generateCommentary(
    facts: MoveFacts,
    recentMoves: string[],
    mode: CoachMode,
    isPlayerMove: boolean
  ): Promise<CommentaryResult | null> {
    const eventId = `${facts.previousFen}_${facts.moveUci}_${facts.fen}_${mode}`;

    try {
      // 1. Check mode silence rule for opponent moves
      if (!isPlayerMove && !this.shouldModeComment(mode, facts, isPlayerMove)) {
        return null;
      }

      // 2. Check cache (keyed by full move context: previousFen + moveUci + fen + mode)
      const cacheKey = `${CACHE_VERSION}_${mode}_${facts.previousFen}_${facts.moveUci}_${facts.fen}`;
      if (commentaryCache.has(cacheKey)) {
        const cached = commentaryCache.get(cacheKey)!;
        const result: CommentaryResult = {
          id: eventId,
          comment: cached,
          facts,
          mode,
          source: 'cache',
        };
        this.notifyListeners(result);
        return result;
      }

      // 3. Check rate limiting
      const rateLimit = this.isRateLimited();
      if (rateLimit.active) {
        const templateComment = this.getFallbackComment(facts, mode);
        const result: CommentaryResult = {
          id: eventId,
          comment: templateComment,
          facts,
          mode,
          source: 'template',
          isRateLimited: true,
        };
        this.notifyListeners(result);
        return result;
      }

      // 4. Check if API key exists
      if (!geminiService.hasKey()) {
        const templateComment = this.getFallbackComment(facts, mode);
        const result: CommentaryResult = {
          id: eventId,
          comment: templateComment,
          facts,
          mode,
          source: 'template',
          timestamp: new Date(),
        };
        this.notifyListeners(result);
        return result;
      }

      // 5. Build strict factual prompt
      const settings = storageService.getSettings();
      const revealMoveNames = settings.revealBetterMoveNames ?? true;
      const maxSentences = getMaxSentencesForMode(mode);
      const maxWords = getMaxWordsForMode(mode);
      const mover = facts.moverColor === 'w' ? 'White' : 'Black';
      const recentNotation = recentMoves.slice(-8).join(' ') || facts.moveSan;

      const moveNamingInstruction = revealMoveNames
        ? `If a better move existed, name the move notation explicitly (${facts.bestMoveSan || 'engine move'}).`
        : `Do NOT state exact move notation or coordinate names (like ${facts.bestMoveSan || 'Nf3'}). Instead, describe the strategic idea/motif in plain words (e.g., 'controlling the open central file').`;

      let modeGuidance = '';
      switch (mode) {
        case 'learning':
          modeGuidance = `Full Learning mode: Explain (1) what the move accomplished, (2) its main strategic/tactical idea, (3) why it is good or what weakness it introduced, and (4) a stronger alternative if available. Max 4 concise sentences and 65 words.`;
          break;
        case 'criticizing':
          modeGuidance = `Criticizing mode: Be direct about the mistake, concession, or missed tactic, and state the verified stronger move if available. Max 3 concise sentences and 50 words.`;
          break;
        case 'simple':
          modeGuidance = `Simple mode: Use ultra-clear beginner language to explain one key idea about this move. Max 2 short sentences and 20 words.`;
          break;
        case 'competitive':
          modeGuidance = `Competitive mode: Focus on evaluation shifts, calculation threats, tempo, and tactical continuations. Max 3 concise sentences and 40 words.`;
          break;
      }

      const evalNotes = facts.isEvaluationAvailable
        ? `- Centipawn loss: ${facts.cpLoss} cp\n- Eval before: ${facts.evalBefore !== null ? (facts.evalBefore > 0 ? '+' : '') + facts.evalBefore + ' cp' : 'N/A'}\n- Eval after: ${facts.evalAfter !== null ? (facts.evalAfter > 0 ? '+' : '') + facts.evalAfter + ' cp' : 'N/A'}`
        : `- Engine evaluation unavailable. Do NOT state fabricated scores. Describe move physical board effect truthfully.`;

      const systemInstruction = `You are an expert live chess coach providing post-move commentary for an improving player.
Mode: ${mode}.
Rules:
1. Output PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks, NO bolding, NO bullet points.
2. Max ${maxSentences} short sentences, max ${maxWords} words.
3. ${moveNamingInstruction}
4. Base your comment strictly on the provided Stockfish engine facts. Do not invent fake tactics or fabricated scores.`;

      const userPrompt = `Engine Facts:
- Move played: ${facts.moveSan} by ${mover}
- Classification: ${facts.classification === 'unavailable' ? 'Evaluation unavailable' : facts.classification}
${evalNotes}
- Was best engine move: ${facts.isBestMove ? 'Yes' : 'No'}
- Engine best move: ${facts.bestMoveSan || 'N/A'}
- Opponent best reply: ${facts.opponentReplySan || 'N/A'}
- Recommended next move after reply: ${facts.bestNextMoveSan || 'N/A'}
- Move flags: ${facts.isCheck ? 'check, ' : ''}${facts.isCapture ? 'capture, ' : ''}${facts.isCastling ? 'castles, ' : ''}none
- Recent moves: ${recentNotation}
- FEN: ${facts.fen}

Task: ${modeGuidance}`;

      try {
        const rawResponse = await geminiService.generateLiveCommentary(
          userPrompt,
          systemInstruction,
          maxSentences
        );

        const cleaned = this.cleanAndTruncateComment(rawResponse, mode);
        const finalComment = cleaned || this.getFallbackComment(facts, mode);

        // Bounded cache storage
        commentaryCache.set(cacheKey, finalComment);
        if (commentaryCache.size > 100) {
          const oldest = Array.from(commentaryCache.keys())[0];
          commentaryCache.delete(oldest);
        }

        const result: CommentaryResult = {
          id: eventId,
          comment: finalComment,
          facts,
          mode,
          source: 'gemini',
          timestamp: new Date(),
        };
        this.notifyListeners(result);
        return result;
      } catch (err: any) {
        speechService.logDiagnostic('warn', `Live commentary Gemini call failed: ${err?.message || err}`);

        // Handle 429
        if (err?.message?.includes('429') || err?.status === 429 || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          rateLimitedUntil = Date.now() + 60000;
          speechService.logDiagnostic('warn', 'Gemini 429 received. Pausing live coach API calls for 60 seconds.');
        }

        const fallback = this.getFallbackComment(facts, mode);
        const result: CommentaryResult = {
          id: eventId,
          comment: fallback,
          facts,
          mode,
          source: 'template',
          isRateLimited: Date.now() < rateLimitedUntil,
          timestamp: new Date(),
        };
        this.notifyListeners(result);
        return result;
      }
    } catch (topErr: any) {
      console.warn('generateCommentary unexpected error:', topErr);
      speechService.logDiagnostic('error', `Unexpected commentary error: ${topErr?.message || topErr}`);
      const fallback = this.getFallbackComment(facts, mode);
      const result: CommentaryResult = {
        id: eventId,
        comment: fallback,
        facts,
        mode,
        source: 'template',
        timestamp: new Date(),
      };
      this.notifyListeners(result);
      return result;
    }
  },

  /**
   * Determine game phase from FEN string
   */
  getGamePhase(fen: string): 'opening' | 'middlegame' | 'endgame' {
    const pieces = fen.split(' ')[0];
    const majors = (pieces.match(/[qQrR]/g) || []).length;
    const minors = (pieces.match(/[bBnN]/g) || []).length;

    if (majors <= 2 && minors <= 2) {
      return 'endgame';
    }

    const moveNum = parseInt(fen.split(' ')[5] || '1', 10);
    if (moveNum <= 10 && majors === 4 && minors >= 6) {
      return 'opening';
    }

    return 'middlegame';
  },

  /**
   * Compute comprehensive engine facts using Stockfish before and after the move
   */
  async computeMoveFacts(
    previousFen: string,
    currentFen: string,
    move: { from: string; to: string; promotion?: string; san: string; piece?: string; captured?: string },
    moverColor: 'w' | 'b',
    previousPhase?: 'opening' | 'middlegame' | 'endgame'
  ): Promise<MoveFacts> {
    const playedUci = `${move.from}${move.to}${move.promotion || ''}`.toLowerCase();

    // 1. Evaluate position before the move (using precalculated result if available)
    let evalBefore: number | null = null;
    let mateBefore: number | null = null;
    let bestMoveUci = '';
    let beforeEvalAvailable = false;

    const precomputed = precomputeCache.get(previousFen);
    if (precomputed && precomputed.isAvailable) {
      evalBefore = precomputed.score;
      mateBefore = precomputed.mate;
      bestMoveUci = precomputed.bestMoveUci;
      beforeEvalAvailable = true;
    } else {
      try {
        const beforeRes = await engineService.evaluate(previousFen, 250);
        if (beforeRes.isAvailable) {
          evalBefore = beforeRes.score;
          mateBefore = beforeRes.mate;
          beforeEvalAvailable = true;
        }
        bestMoveUci = beforeRes.bestMove || '';
      } catch (e) {
        console.warn('Evaluation before move failed:', e);
      }
    }

    // 2. Evaluate position after the move & get opponent's best reply
    let evalAfter: number | null = null;
    let mateAfter: number | null = null;
    let opponentReplyUci = '';
    let afterEvalAvailable = false;
    try {
      const afterRes = await engineService.evaluate(currentFen, 250);
      if (afterRes.isAvailable) {
        // In currentFen, it is opponent's turn. Negate score & mate to keep mover's perspective.
        evalAfter = afterRes.score !== null ? -afterRes.score : null;
        mateAfter = afterRes.mate !== null ? -afterRes.mate : null;
        afterEvalAvailable = true;
      }
      opponentReplyUci = afterRes.bestMove || '';
    } catch (e) {
      console.warn('Evaluation after move failed:', e);
    }

    // 3. Centipawn loss and eval swing
    const isEvaluationAvailable = beforeEvalAvailable && afterEvalAvailable;
    let cpLoss: number | null = null;
    let evalSwing: number | null = null;

    if (isEvaluationAvailable) {
      const effectiveBefore =
        mateBefore !== null
          ? mateBefore > 0
            ? 10000 - mateBefore * 100
            : -10000 - mateBefore * 100
          : evalBefore!;
      const effectiveAfter =
        mateAfter !== null
          ? mateAfter > 0
            ? 10000 - mateAfter * 100
            : -10000 - mateAfter * 100
          : evalAfter!;

      cpLoss = Math.max(0, effectiveBefore - effectiveAfter);
      evalSwing = Math.abs(effectiveAfter - effectiveBefore);
    }

    // 4. Was it the engine's best move? Validate best move with chess.js
    const isBestMove = !!(bestMoveUci && bestMoveUci.toLowerCase() === playedUci);

    // 5. Compute best move SAN, opponent reply SAN, and best next move SAN
    let bestMoveSan: string | undefined;
    if (bestMoveUci && bestMoveUci.length >= 4) {
      try {
        const tempGame = new Chess(previousFen);
        const from = bestMoveUci.substring(0, 2);
        const to = bestMoveUci.substring(2, 4);
        const promotion = bestMoveUci.length > 4 ? bestMoveUci[4] : undefined;
        const played = tempGame.move({ from, to, promotion });
        if (played) {
          bestMoveSan = played.san;
        }
      } catch {
        // Fallback
      }
    }

    let opponentReplySan: string | undefined;
    let bestNextMoveSan: string | undefined;
    if (opponentReplyUci && opponentReplyUci.length >= 4) {
      try {
        const oppGame = new Chess(currentFen);
        const oppFrom = opponentReplyUci.substring(0, 2);
        const oppTo = opponentReplyUci.substring(2, 4);
        const oppPromo = opponentReplyUci.length > 4 ? opponentReplyUci[4] : undefined;
        const oppPlayed = oppGame.move({ from: oppFrom, to: oppTo, promotion: oppPromo });
        if (oppPlayed) {
          opponentReplySan = oppPlayed.san;
          // Calculate best next move for player after opponent replies
          const nextFen = oppGame.fen();
          const nextRes = await engineService.evaluate(nextFen, 180);
          if (nextRes && nextRes.bestMove && nextRes.bestMove.length >= 4) {
            const nextGame = new Chess(nextFen);
            const nFrom = nextRes.bestMove.substring(0, 2);
            const nTo = nextRes.bestMove.substring(2, 4);
            const nPromo = nextRes.bestMove.length > 4 ? nextRes.bestMove[4] : undefined;
            const nPlayed = nextGame.move({ from: nFrom, to: nTo, promotion: nPromo });
            if (nPlayed) {
              bestNextMoveSan = nPlayed.san;
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    // 6. Flags
    const isCapture = !!move.captured || move.san.includes('x');
    const isCheck = move.san.includes('+') || move.san.includes('#');
    const isCastling = move.san.startsWith('O-O') || move.san.startsWith('0-0');
    const isPromotion = !!move.promotion || move.san.includes('=');
    const isSacrifice =
      !isCapture &&
      isEvaluationAvailable &&
      cpLoss !== null &&
      evalBefore !== null &&
      evalAfter !== null &&
      !!(move.piece && ['q', 'r', 'b', 'n'].includes(move.piece) && cpLoss <= 30 && evalAfter > evalBefore - 50);

    // 7. Classification
    const classification = classifyMove(cpLoss, isBestMove, isSacrifice, isEvaluationAvailable);

    // 8. Phase
    const gamePhase = this.getGamePhase(currentFen);
    const isPhaseChange = !!(previousPhase && previousPhase !== gamePhase);

    return {
      fen: currentFen,
      previousFen,
      moveSan: move.san,
      moveUci: playedUci,
      moverColor,
      evalBefore,
      evalAfter,
      mateBefore,
      mateAfter,
      cpLoss,
      isEvaluationAvailable,
      isBestMove,
      bestMoveSan,
      bestMoveUci,
      opponentReplySan,
      bestNextMoveSan,
      isCapture,
      isCheck,
      isCastling,
      isPromotion,
      isSacrifice,
      classification,
      gamePhase,
      isPhaseChange,
      evalSwing,
    };
  },

  /**
   * Event dispatcher & subscriber for live commentary
   */
  notifyListeners(result: CommentaryResult): void {
    commentaryListeners.forEach((listener) => {
      try {
        listener(result);
      } catch (e) {
        console.warn('Error in commentary listener:', e);
      }
    });
  },

  subscribeToCommentary(listener: CommentaryListener): () => void {
    commentaryListeners.add(listener);
    return () => {
      commentaryListeners.delete(listener);
    };
  },
};
