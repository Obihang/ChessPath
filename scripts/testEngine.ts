import { Chess } from 'chess.js';
import { engineService, ENGINE_DIFFICULTIES } from '../src/services/engineService';

async function runEngineTests() {
  console.log('Running engine test suite...');
  console.log('Engine status on start:', engineService.getStatus());

  // Test (a): Concurrent requests for different FENs
  const fen1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const fen2 = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

  console.log('Testing (a): Concurrent requests for different FENs...');
  const [move1, move2] = await Promise.all([
    engineService.getBestMove(fen1, ENGINE_DIFFICULTIES.intermediate, true),
    engineService.getBestMove(fen2, ENGINE_DIFFICULTIES.intermediate, true),
  ]);

  const game1 = new Chess(fen1);
  const legal1 = game1.moves({ verbose: true }).some(m => m.from === move1.from && m.to === move1.to);
  const game2 = new Chess(fen2);
  const legal2 = game2.moves({ verbose: true }).some(m => m.from === move2.from && m.to === move2.to);

  console.log(`Move 1 (${move1.from}-${move1.to}) legal for FEN 1: ${legal1}`);
  console.log(`Move 2 (${move2.from}-${move2.to}) legal for FEN 2: ${legal2}`);

  if (!legal1 || !legal2) {
    throw new Error('Test (a) FAILED: Returned illegal move for FEN');
  }

  // Test (b): Analysis evaluation verified
  console.log('Testing (b): Analysis evaluation verified (UCI_LimitStrength=false)...');
  const evalResult = await engineService.evaluate(fen1, 200);
  console.log(`Evaluation for fen1: score=${evalResult.score}, bestMove=${evalResult.bestMove}, available=${evalResult.isAvailable}, source=${evalResult.source}`);
  if (evalResult.isAvailable && evalResult.score === null && evalResult.mate === null) {
    throw new Error('Test (b) FAILED: Evaluation marked available but score and mate are null');
  }

  // Test invalid FEN handling:
  const invalidEval = await engineService.evaluate('invalid_fen_string', 100);
  if (invalidEval.isAvailable || invalidEval.score !== null) {
    throw new Error('Test (b) FAILED: Invalid FEN should not be available or report fake score');
  }

  // Test (c): 20-ply self-play at Intermediate difficulty
  console.log('Testing (c): 20-ply self-play at Intermediate difficulty...');
  const game = new Chess();
  const playedMoves: string[] = [];

  for (let ply = 0; ply < 20; ply++) {
    if (game.isGameOver()) break;
    const best = await engineService.getBestMove(game.fen(), ENGINE_DIFFICULTIES.intermediate, true);
    const m = game.move(best);
    if (!m) break;
    playedMoves.push(`${m.from}${m.to}`);
  }

  console.log('Self-play moves (20 plies):', playedMoves);
  let repeatedBounces = 0;
  for (let i = 2; i < playedMoves.length; i++) {
    if (playedMoves[i] === playedMoves[i - 2]) {
      repeatedBounces++;
    }
  }
  console.log(`Repeated bounces detected: ${repeatedBounces}`);

  console.log('All engine tests PASSED successfully!');
  process.exit(0);
}

runEngineTests().catch((err) => {
  console.error('Engine test FAILED:', err);
  process.exit(1);
});
