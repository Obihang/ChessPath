import { Chess } from 'chess.js';
import { CoachMode } from '../types/chess';
import { geminiService } from './geminiService';
import { speechService } from './speechService';
import { engineService } from './engineService';
import { storageService } from './storageService';

export type MoveClassification = 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface MoveFacts {
  fen: string;
  previousFen: string;
  moveSan: string;
  moveUci: string;
  moverColor: 'w' | 'b';
  evalBefore: number; // mover's perspective (cp)
  evalAfter: number;  // mover's perspective (cp)
  cpLoss: number;
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
  evalSwing: number;
}

export interface CommentaryResult {
  comment: string;
  facts: MoveFacts;
  mode: CoachMode;
  source: 'gemini' | 'template' | 'cache';
  isRateLimited?: boolean;
  timestamp?: Date;
}

// In-memory cache by FEN + mode
const commentaryCache = new Map<string, string>();

// 429 cooldown state
let rateLimitedUntil = 0;

// Listeners for live commentary events
type CommentaryListener = (result: CommentaryResult) => void;
const commentaryListeners = new Set<CommentaryListener>();

export const coachCommentaryService = {
  /**
   * Classify move based on engine centipawn loss and flags
   */
  classifyMove(cpLoss: number, isBestMove: boolean, isSacrifice: boolean = false): MoveClassification {
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
  },

  /**
   * Determine if the selected mode should comment on this move.
   * If false, no API call is made.
   */
  shouldModeComment(mode: CoachMode, facts: MoveFacts, isPlayerMove: boolean): boolean {
    switch (mode) {
      case 'learning':
        // Full Learning: comment after each player move, plus significant opponent moves (check, blunder, or large swing)
        return isPlayerMove || facts.isCheck || facts.classification === 'blunder' || facts.evalSwing > 150;

      case 'criticizing':
        // Criticizing: only on inaccuracy, mistake, blunder, plus one short compliment for great
        if (facts.classification === 'great') return true;
        if (facts.classification === 'inaccuracy' || facts.classification === 'mistake' || facts.classification === 'blunder') {
          return true;
        }
        return false;

      case 'simple':
        // Simple: only on captures, checks, mistakes/blunders, mate threats
        if (facts.isCapture || facts.isCheck) return true;
        if (facts.classification === 'mistake' || facts.classification === 'blunder') return true;
        if (Math.abs(facts.evalAfter) > 7000) return true; // mate threat
        return false;

      case 'competitive':
        // Competitive: only when eval swings > 150 cp or game phase changes
        return facts.evalSwing > 150 || !!facts.isPhaseChange;

      default:
        return true;
    }
  },

  /**
   * Sentence limit rule per mode
   */
  getMaxSentencesForMode(mode: CoachMode): number {
    switch (mode) {
      case 'learning':
        return 3;
      case 'criticizing':
        return 2;
      case 'simple':
        return 1;
      case 'competitive':
        return 2;
      default:
        return 2;
    }
  },

  /**
   * Strip markdown formatting and truncate to the mode's sentence limit
   */
  cleanAndTruncateComment(rawText: string, maxSentences: number): string {
    if (!rawText) return '';

    // Strip markdown formatting: bold, italic, code blocks, headers, bullet points
    let clean = rawText
      .replace(/[*_#`~]/g, '')
      .replace(/^[\s-•*+>]+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    // Match sentences ending in punctuation
    const sentenceRegex = /[^.!?]+[.!?]+(\s|$)/g;
    const matches = clean.match(sentenceRegex);

    if (matches && matches.length > 0) {
      clean = matches.slice(0, maxSentences).join('').trim();
    } else {
      // Fallback if no terminating punctuation found
      const parts = clean.split(/[.!?]/).filter(Boolean);
      clean = parts.slice(0, maxSentences).join('. ').trim();
      if (clean && !clean.endsWith('.')) {
        clean += '.';
      }
    }

    return clean;
  },

  /**
   * Short template comment built from engine facts without Gemini
   */
  getFallbackComment(facts: MoveFacts, mode: CoachMode): string {
    const better = facts.bestMoveSan ? ` The engine preferred ${facts.bestMoveSan}.` : '';

    if (facts.classification === 'blunder') {
      return `Blunder.${better}`;
    }
    if (facts.classification === 'mistake') {
      return `Mistake.${better}`;
    }
    if (facts.classification === 'inaccuracy') {
      return `Inaccuracy.${better}`;
    }
    if (facts.classification === 'great') {
      return facts.isBestMove ? 'Great move! Exactly what the engine recommended.' : 'Brilliant tactical resource!';
    }
    if (facts.isCheck) {
      return 'Check on the king!';
    }
    if (facts.isCapture) {
      return 'Solid capture.';
    }
    if (mode === 'simple') {
      return 'Good move.';
    }
    return 'Solid position. Keep developing and maintain piece coordination.';
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
   * Generate live commentary for a move based on engine facts
   */
  async generateCommentary(
    facts: MoveFacts,
    recentMoves: string[],
    mode: CoachMode,
    isPlayerMove: boolean
  ): Promise<CommentaryResult | null> {
    // 1. Check mode silence rule
    if (!this.shouldModeComment(mode, facts, isPlayerMove)) {
      return null;
    }

    // 2. Check cache
    const cacheKey = `${facts.fen}_${mode}`;
    if (commentaryCache.has(cacheKey)) {
      return {
        comment: commentaryCache.get(cacheKey)!,
        facts,
        mode,
        source: 'cache',
      };
    }

    // 3. Check rate limiting
    const rateLimit = this.isRateLimited();
    if (rateLimit.active) {
      const templateComment = this.getFallbackComment(facts, mode);
      return {
        comment: templateComment,
        facts,
        mode,
        source: 'template',
        isRateLimited: true,
      };
    }

    // 4. Check if API key exists
    if (!geminiService.hasKey()) {
      const templateComment = this.getFallbackComment(facts, mode);
      const result: CommentaryResult = {
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
    const maxSentences = this.getMaxSentencesForMode(mode);
    const mover = facts.moverColor === 'w' ? 'White' : 'Black';
    const recentNotation = recentMoves.slice(-8).join(' ') || facts.moveSan;

    const moveNamingInstruction = revealMoveNames
      ? `If a better move existed, name the move notation explicitly (${facts.bestMoveSan || 'engine move'}).`
      : `Do NOT state exact move notation or coordinate names (like ${facts.bestMoveSan || 'Nf3'}). Instead, describe the strategic idea/motif in plain words (e.g., 'controlling the open central file').`;

    let modeGuidance = '';
    switch (mode) {
      case 'learning':
        modeGuidance = `1) State how good ${facts.moveSan} was (${facts.classification}). 2) If not best move, explain why ${revealMoveNames ? facts.bestMoveSan : 'the alternative idea'} was stronger. 3) Suggest what to focus on next (${facts.bestNextMoveSan ? `e.g. ${facts.bestNextMoveSan}` : 'key plan'}). Max ${maxSentences} short sentences.`;
        break;
      case 'criticizing':
        modeGuidance = `1) State quality of ${facts.moveSan} directly. 2) State what was missed (${revealMoveNames ? facts.bestMoveSan : 'the key tactical idea'}). 3) Give a 1-phrase next action plan. Max ${maxSentences} sentences, direct tone.`;
        break;
      case 'simple':
        modeGuidance = `Use 1 plain sentence summarizing the move quality and next idea. No jargon.`;
        break;
      case 'competitive':
        modeGuidance = `2 terse sentences stating move quality, eval shift, and key threat or next response.`;
        break;
    }

    const systemInstruction = `You are a live chess coach providing post-move commentary.
Mode: ${mode}.
Rules:
1. Output PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks, NO bolding, NO bullet points.
2. Max ${maxSentences} short sentences.
3. ${moveNamingInstruction}
4. Base your comment strictly on the provided Stockfish engine facts. Do not invent facts.`;

    const userPrompt = `Engine Facts:
- Move played: ${facts.moveSan} by ${mover}
- Classification: ${facts.classification}
- Centipawn loss: ${facts.cpLoss} cp
- Eval before: ${facts.evalBefore > 0 ? '+' : ''}${facts.evalBefore} cp
- Eval after: ${facts.evalAfter > 0 ? '+' : ''}${facts.evalAfter} cp
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

      const cleaned = this.cleanAndTruncateComment(rawResponse, maxSentences);
      const finalComment = cleaned || this.getFallbackComment(facts, mode);

      // Cache successful response
      commentaryCache.set(cacheKey, finalComment);

      const result: CommentaryResult = {
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
        rateLimitedUntil = Date.now() + 60000; // 60-second pause
        speechService.logDiagnostic('warn', 'Gemini 429 received. Pausing live coach API calls for 60 seconds.');
      }

      const fallback = this.getFallbackComment(facts, mode);
      const result: CommentaryResult = {
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
  },

  /**
   * Determine game phase from FEN string
   */
  getGamePhase(fen: string): 'opening' | 'middlegame' | 'endgame' {
    const parts = fen.split(' ');
    const boardStr = parts[0] || '';
    const moveCount = parseInt(parts[5] || '1', 10);
    const queens = (boardStr.match(/[qQ]/g) || []).length;
    const pieces = (boardStr.match(/[rnbqRNBQ]/g) || []).length;
    if (moveCount <= 8 && pieces >= 14) return 'opening';
    if (queens === 0 || pieces <= 6) return 'endgame';
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

    // 1. Evaluate position before the move
    let evalBefore = 0;
    let bestMoveUci = '';
    try {
      const beforeRes = await engineService.evaluate(previousFen, 250);
      evalBefore = beforeRes.score;
      bestMoveUci = beforeRes.bestMove || '';
    } catch (e) {
      console.warn('Evaluation before move failed:', e);
    }

    // 2. Evaluate position after the move & get opponent's best reply
    let evalAfter = 0;
    let opponentReplyUci = '';
    try {
      const afterRes = await engineService.evaluate(currentFen, 250);
      // In currentFen, it is the opponent's turn. Negate score to keep mover's perspective.
      evalAfter = -afterRes.score;
      opponentReplyUci = afterRes.bestMove || '';
    } catch (e) {
      console.warn('Evaluation after move failed:', e);
      evalAfter = evalBefore;
    }

    // 3. Centipawn loss and eval swing
    const cpLoss = Math.max(0, evalBefore - evalAfter);
    const evalSwing = Math.abs(evalAfter - evalBefore);

    // 4. Was it the engine's best move?
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
      !!(move.piece && ['q', 'r', 'b', 'n'].includes(move.piece) && cpLoss <= 30 && evalAfter > evalBefore - 50);

    // 7. Classification: great/best, good, inaccuracy (>50 cp loss), mistake (>100), blunder (>250)
    const classification = this.classifyMove(cpLoss, isBestMove, isSacrifice);

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
      cpLoss,
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
