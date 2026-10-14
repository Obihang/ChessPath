import { Chess } from 'chess.js';
import { RAW_PUZZLES } from '../data/puzzlesData';
import { RAW_OPENINGS } from '../data/openingsData';
import { RAW_GAMBITS } from '../data/gambitsData';

export function validateAllContent() {
  let puzzlesPassed = 0;
  let puzzlesFailed = 0;
  let openingsPassed = 0;
  let openingsFailed = 0;
  let gambitsPassed = 0;
  let gambitsFailed = 0;

  // Validate Puzzles
  for (const puz of RAW_PUZZLES) {
    try {
      const chess = new Chess(puz.fen);
      let valid = true;
      for (const m of puz.solutionMoves) {
        const res = chess.move(m);
        if (!res) {
          valid = false;
          break;
        }
      }
      if (valid) {
        puzzlesPassed++;
      } else {
        puzzlesFailed++;
        console.warn(`[ContentValidator] Invalid puzzle solution: ${puz.id} (${puz.title})`);
      }
    } catch (e) {
      puzzlesFailed++;
      console.error(`[ContentValidator] Exception in puzzle ${puz.id}:`, e);
    }
  }

  // Validate Openings
  for (const op of RAW_OPENINGS) {
    try {
      const chess = new Chess();
      let valid = true;
      for (const m of op.moves) {
        const res = chess.move(m);
        if (!res) {
          valid = false;
          break;
        }
      }
      if (valid) {
        openingsPassed++;
      } else {
        openingsFailed++;
        console.warn(`[ContentValidator] Invalid opening move line: ${op.id} (${op.name})`);
      }

      // Validate variations
      if (op.variations) {
        for (const v of op.variations) {
          const vChess = new Chess();
          let vValid = true;
          for (const m of v.moves) {
            const res = vChess.move(m);
            if (!res) {
              vValid = false;
              break;
            }
          }
          if (!vValid) {
            console.warn(`[ContentValidator] Invalid opening variation move line: ${op.id} - ${v.name}`);
          }
        }
      }
    } catch (e) {
      openingsFailed++;
      console.error(`[ContentValidator] Exception in opening ${op.id}:`, e);
    }
  }

  // Validate Gambits
  for (const g of RAW_GAMBITS) {
    try {
      const chess = new Chess();
      let valid = true;
      for (const m of g.moves) {
        const res = chess.move(m);
        if (!res) {
          valid = false;
          break;
        }
      }
      if (valid) {
        gambitsPassed++;
      } else {
        gambitsFailed++;
        console.warn(`[ContentValidator] Invalid gambit move line: ${g.id} (${g.name})`);
      }

      // Validate variations
      if (g.variations) {
        for (const v of g.variations) {
          const vChess = new Chess();
          let vValid = true;
          for (const m of v.moves) {
            const res = vChess.move(m);
            if (!res) {
              vValid = false;
              break;
            }
          }
          if (!vValid) {
            console.warn(`[ContentValidator] Invalid gambit variation move line: ${g.id} - ${v.name}`);
          }
        }
      }
    } catch (e) {
      gambitsFailed++;
      console.error(`[ContentValidator] Exception in gambit ${g.id}:`, e);
    }
  }

  const summary = {
    puzzles: { passed: puzzlesPassed, failed: puzzlesFailed },
    openings: { passed: openingsPassed, failed: openingsFailed },
    gambits: { passed: gambitsPassed, failed: gambitsFailed },
  };

  console.log('=== CHESSPATH CONTENT VALIDATION SUMMARY ===');
  console.log(`Puzzles: ${puzzlesPassed} passed, ${puzzlesFailed} failed`);
  console.log(`Openings: ${openingsPassed} passed, ${openingsFailed} failed`);
  console.log(`Gambits: ${gambitsPassed} passed, ${gambitsFailed} failed`);
  console.log('============================================');

  return summary;
}
