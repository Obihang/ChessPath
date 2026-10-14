import { Chess } from 'chess.js';
import { EngineDifficulty } from '../types/chess';

export const ENGINE_DIFFICULTIES: Record<string, EngineDifficulty> = {
  beginner: { elo: 800, label: 'Beginner (800 Elo)', depth: 1, skillLevel: 0, blunderRate: 0.4 },
  casual: { elo: 1100, label: 'Casual (1100 Elo)', depth: 2, skillLevel: 1, blunderRate: 0.25 },
  intermediate: { elo: 1400, label: 'Intermediate (1400 Elo)', depth: 3, skillLevel: 4, blunderRate: 0.1 },
  advanced: { elo: 1700, label: 'Advanced (1700 Elo)', depth: 4, skillLevel: 8, blunderRate: 0.02 },
  master: { elo: 2000, label: 'Master (2000+ Elo)', depth: 5, skillLevel: 14, blunderRate: 0.0 },
};

// Piece values in centipawns
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Simplified Piece-Square Tables (White perspective, flipped for Black)
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
  0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_TABLE_MID = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];

function squareToIndex(sq: string): number {
  const file = sq.charCodeAt(0) - 97; // a=0, h=7
  const rank = 8 - parseInt(sq[1], 10); // 8=0, 1=7
  return rank * 8 + file;
}

function evaluatePosition(game: Chess): number {
  let score = 0;
  const board = game.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const idx = r * 8 + c;
      const flippedIdx = (7 - r) * 8 + c;
      const tableIdx = piece.color === 'w' ? idx : flippedIdx;

      let pieceVal = PIECE_VALUES[piece.type] || 0;
      let posBonus = 0;

      switch (piece.type) {
        case 'p': posBonus = PAWN_TABLE[tableIdx]; break;
        case 'n': posBonus = KNIGHT_TABLE[tableIdx]; break;
        case 'b': posBonus = BISHOP_TABLE[tableIdx]; break;
        case 'r': posBonus = ROOK_TABLE[tableIdx]; break;
        case 'q': posBonus = QUEEN_TABLE[tableIdx]; break;
        case 'k': posBonus = KING_TABLE_MID[tableIdx]; break;
      }

      const total = pieceVal + posBonus;
      score += piece.color === 'w' ? total : -total;
    }
  }

  return score;
}

function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean
): number {
  if (depth === 0 || game.isGameOver()) {
    if (game.isCheckmate()) {
      return isMaximizing ? -99999 + (5 - depth) : 99999 - (5 - depth);
    }
    if (game.isDraw()) return 0;
    return evaluatePosition(game);
  }

  const moves = game.moves({ verbose: true });
  // Simple move ordering: captures first
  moves.sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0));

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const ev = minimax(game, depth - 1, alpha, beta, false);
      game.undo();
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move(move);
      const ev = minimax(game, depth - 1, alpha, beta, true);
      game.undo();
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export class ChessEngineService {
  private worker: Worker | null = null;
  private isWorkerReady: boolean = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined') return;
    try {
      // Try to load bundled worker if present
      this.worker = new Worker('/engine/stockfish.js');
      this.worker.onmessage = (e) => {
        const text = typeof e.data === 'string' ? e.data : '';
        if (text.includes('uciok') || text.includes('readyok')) {
          this.isWorkerReady = true;
        }
      };
      this.worker.postMessage('uci');
      this.worker.postMessage('isready');
    } catch {
      // Web Worker fallback is smoothly handled by our internal minimax
      this.isWorkerReady = false;
    }
  }

  /**
   * Calculates the best move for the current FEN.
   * Calibrated for beginner play when Elo < 1300.
   */
  public async getBestMove(
    fen: string,
    difficulty: EngineDifficulty = ENGINE_DIFFICULTIES.intermediate
  ): Promise<{ from: string; to: string; promotion?: string; san?: string }> {
    const game = new Chess(fen);
    const moves = game.moves({ verbose: true });

    if (moves.length === 0) {
      throw new Error('No legal moves available');
    }

    // Beginner calibration: deliberate blunder / suboptimal choice
    const isBlunder = Math.random() < difficulty.blunderRate;
    if (isBlunder && moves.length > 1) {
      // Pick a random legal move or second tier move
      const nonCheckmates = moves.filter((m) => {
        game.move(m);
        const givesMate = game.isCheckmate();
        game.undo();
        return !givesMate;
      });
      const pool = nonCheckmates.length > 0 ? nonCheckmates : moves;
      const randomMove = pool[Math.floor(Math.random() * pool.length)];
      return {
        from: randomMove.from,
        to: randomMove.to,
        promotion: randomMove.promotion,
        san: randomMove.san,
      };
    }

    // Minimax Search
    const isWhite = game.turn() === 'w';
    let bestMove = moves[0];
    let bestValue = isWhite ? -Infinity : Infinity;

    // Small delay to simulate realistic "thinking"
    await new Promise((resolve) => setTimeout(resolve, Math.max(300, Math.min(800, difficulty.depth * 150))));

    for (const move of moves) {
      game.move(move);
      const val = minimax(
        game,
        difficulty.depth - 1,
        -Infinity,
        Infinity,
        !isWhite
      );
      game.undo();

      if (isWhite) {
        if (val > bestValue) {
          bestValue = val;
          bestMove = move;
        }
      } else {
        if (val < bestValue) {
          bestValue = val;
          bestMove = move;
        }
      }
    }

    return {
      from: bestMove.from,
      to: bestMove.to,
      promotion: bestMove.promotion,
      san: bestMove.san,
    };
  }
}

export const engineService = new ChessEngineService();
