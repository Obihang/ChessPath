import { Chess } from 'chess.js';
import { EngineDifficulty } from '../types/chess';

export const ENGINE_DIFFICULTIES: Record<string, EngineDifficulty> = {
  beginner: { elo: 1350, label: 'Beginner (Stockfish Level 0 - 1350 Elo)', depth: 1, skillLevel: 0, blunderRate: 0.35 },
  casual: { elo: 1500, label: 'Casual (Stockfish Level 2 - 1500 Elo)', depth: 2, skillLevel: 2, blunderRate: 0.20 },
  intermediate: { elo: 1800, label: 'Intermediate (Stockfish Level 7 - 1800 Elo)', depth: 4, skillLevel: 7, blunderRate: 0.05 },
  advanced: { elo: 2100, label: 'Advanced (Stockfish Level 12 - 2100 Elo)', depth: 6, skillLevel: 12, blunderRate: 0.01 },
  master: { elo: 2500, label: 'Master (Stockfish Level 20 - 2500+ Elo)', depth: 8, skillLevel: 20, blunderRate: 0.0 },
};

// Fallback minimax evaluation (used if worker fails or times out)
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

function evaluatePosition(game: Chess): number {
  let score = 0;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const val = PIECE_VALUES[piece.type] || 0;
      score += piece.color === 'w' ? val : -val;
    }
  }
  return score;
}

function minimaxMove(game: Chess, depth: number): string | null {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;
  
  const isWhite = game.turn() === 'w';
  let bestMove = moves[0];
  let bestVal = isWhite ? -Infinity : Infinity;

  for (const move of moves) {
    game.move(move);
    const val = evaluatePosition(game);
    game.undo();
    if (isWhite ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = move;
    }
  }
  return `${bestMove.from}${bestMove.to}${bestMove.promotion || ''}`;
}

export class ChessEngineService {
  private worker: Worker | null = null;
  private isReady: boolean = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined') return;
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const workerUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}engine/stockfish.js`;
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        const msg = typeof e.data === 'string' ? e.data : '';
        if (msg.includes('readyok') || msg.includes('uciok')) {
          this.isReady = true;
        }
      };

      this.worker.postMessage('uci');
      this.worker.postMessage('isready');
    } catch (e) {
      console.warn('Stockfish Worker failed to initialize, will use fallback engine:', e);
      this.worker = null;
    }
  }

  public async getBestMove(
    fen: string,
    difficulty: EngineDifficulty = ENGINE_DIFFICULTIES.intermediate
  ): Promise<{ from: string; to: string; promotion?: string; san?: string }> {
    const game = new Chess(fen);
    const legalMoves = game.moves({ verbose: true });

    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }

    // Beginner/Casual blunder check
    if (Math.random() < (difficulty.blunderRate || 0)) {
      const nonMateMoves = legalMoves.filter(m => {
        game.move(m);
        const mate = game.isCheckmate();
        game.undo();
        return !mate;
      });
      const pool = nonMateMoves.length > 0 ? nonMateMoves : legalMoves;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      return { from: chosen.from, to: chosen.to, promotion: chosen.promotion, san: chosen.san };
    }

    // Try Stockfish Worker with timeout
    if (this.worker) {
      try {
        const bestMoveUCI = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Stockfish timeout'));
          }, 3000);

          const handleMessage = (e: MessageEvent) => {
            const data = typeof e.data === 'string' ? e.data : '';
            if (data.startsWith('bestmove')) {
              clearTimeout(timeout);
              if (this.worker) {
                this.worker.removeEventListener('message', handleMessage);
              }
              const parts = data.split(' ');
              resolve(parts[1] || '');
            }
          };

          if (this.worker) {
            this.worker.addEventListener('message', handleMessage);
            const skillLevel = difficulty.skillLevel ?? 5;
            const elo = Math.max(1320, difficulty.elo ?? 1500);
            this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
            this.worker.postMessage('setoption name UCI_LimitStrength value true');
            this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
            this.worker.postMessage(`position fen ${fen}`);
            this.worker.postMessage(`go movetime ${Math.min(500, (difficulty.depth || 3) * 100)}`);
          } else {
            clearTimeout(timeout);
            reject(new Error('No worker'));
          }
        });

        if (bestMoveUCI && bestMoveUCI.length >= 4) {
          const from = bestMoveUCI.substring(0, 2);
          const to = bestMoveUCI.substring(2, 4);
          const promotion = bestMoveUCI.length > 4 ? bestMoveUCI[4] : undefined;
          
          // Verify legality with chess.js
          const match = legalMoves.find(m => m.from === from && m.to === to && (!promotion || m.promotion === promotion));
          if (match) {
            return { from: match.from, to: match.to, promotion: match.promotion, san: match.san };
          }
        }
      } catch {
        // Fallback to minimax
      }
    }

    // Fallback Minimax
    const fallbackUci = minimaxMove(game, Math.min(3, difficulty.depth || 2));
    if (fallbackUci && fallbackUci.length >= 4) {
      const from = fallbackUci.substring(0, 2);
      const to = fallbackUci.substring(2, 4);
      const promotion = fallbackUci.length > 4 ? fallbackUci[4] : undefined;
      const match = legalMoves.find(m => m.from === from && m.to === to && (!promotion || m.promotion === promotion));
      if (match) {
        return { from: match.from, to: match.to, promotion: match.promotion, san: match.san };
      }
    }

    // Ultimate fallback: first legal move
    const fallback = legalMoves[0];
    return { from: fallback.from, to: fallback.to, promotion: fallback.promotion, san: fallback.san };
  }
}

export const engineService = new ChessEngineService();
