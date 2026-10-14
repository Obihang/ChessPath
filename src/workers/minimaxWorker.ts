import { Chess } from 'chess.js';

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

function minimax(game: Chess, depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluatePosition(game);
  }

  const moves = game.moves({ verbose: true });
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const evalVal = minimax(game, depth - 1, alpha, beta, false);
      game.undo();
      maxEval = Math.max(maxEval, evalVal);
      alpha = Math.max(alpha, evalVal);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move(move);
      const evalVal = minimax(game, depth - 1, alpha, beta, true);
      game.undo();
      minEval = Math.min(minEval, evalVal);
      beta = Math.min(beta, evalVal);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

self.onmessage = (e: MessageEvent) => {
  const { id, fen, depth = 2 } = e.data || {};
  try {
    const game = new Chess(fen);
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) {
      self.postMessage({ id, bestMove: null });
      return;
    }

    const isWhite = game.turn() === 'w';
    let bestMove = moves[0];
    let bestVal = isWhite ? -Infinity : Infinity;

    for (const move of moves) {
      game.move(move);
      const evalVal = minimax(game, depth - 1, -Infinity, Infinity, !isWhite);
      game.undo();
      if (isWhite ? evalVal > bestVal : evalVal < bestVal) {
        bestVal = evalVal;
        bestMove = move;
      }
    }

    self.postMessage({
      id,
      bestMove: {
        from: bestMove.from,
        to: bestMove.to,
        promotion: bestMove.promotion,
        san: bestMove.san,
      },
    });
  } catch (err: any) {
    self.postMessage({ id, error: err?.message || 'Minimax worker error' });
  }
};
