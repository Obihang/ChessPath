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
            openingsFailed++;
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
            gambitsFailed++;
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

import { pcmToWav, stripMarkdown, classifyMoveThresholds, testPcmProcessingPipeline, enforceLengthCaps } from './audioUtils';

export function validateAudioUtils() {
  console.log('--- Testing Audio & Chess Utilities ---');

  // Test 1: pcmToWav
  const dummyPcm = new Uint8Array(100).buffer;
  const wavBuf = pcmToWav(dummyPcm, 24000, 1);
  if (wavBuf.byteLength !== 144) {
    throw new Error(`pcmToWav test failed: expected byteLength 144, got ${wavBuf.byteLength}`);
  }
  const view = new DataView(wavBuf);
  const riffStr = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (riffStr !== 'RIFF') {
    throw new Error(`pcmToWav header test failed: expected RIFF, got ${riffStr}`);
  }
  console.log('✓ pcmToWav test passed (RIFF 44-byte header verified)');

  // Test 2: stripMarkdown
  const mdInput = '**Mistake.** *The engine* preferred `Nf3`.\n- Suggestion: play #e4';
  const cleanStr = stripMarkdown(mdInput);
  if (cleanStr.includes('*') || cleanStr.includes('`') || cleanStr.includes('#') || cleanStr.includes('-')) {
    throw new Error(`stripMarkdown test failed: markdown symbols remained in "${cleanStr}"`);
  }
  console.log(`✓ stripMarkdown test passed: "${cleanStr}"`);

  // Test 3: enforceLengthCaps
  const longSimple = 'Good move. You developed your knight to the central square and controlled e5 and d4 effectively.';
  const cappedSimple = enforceLengthCaps(longSimple, 'simple');
  if (cappedSimple.split(/\s+/).length > 12) {
    throw new Error(`enforceLengthCaps simple mode test failed: expected <= 12 words, got ${cappedSimple.split(/\s+/).length}`);
  }
  console.log(`✓ enforceLengthCaps simple test passed: "${cappedSimple}"`);

  // Test 4: classifyMoveThresholds
  if (classifyMoveThresholds(0, true) !== 'great') throw new Error('classifyMoveThresholds test failed for best move');
  if (classifyMoveThresholds(30, false) !== 'good') throw new Error('classifyMoveThresholds test failed for 30 cp loss');
  if (classifyMoveThresholds(60, false) !== 'inaccuracy') throw new Error('classifyMoveThresholds test failed for 60 cp loss');
  if (classifyMoveThresholds(150, false) !== 'mistake') throw new Error('classifyMoveThresholds test failed for 150 cp loss');
  if (classifyMoveThresholds(300, false) !== 'blunder') throw new Error('classifyMoveThresholds test failed for 300 cp loss');
  console.log('✓ classifyMoveThresholds test passed (all centipawn thresholds verified)');

  // Test 5: Synthetic PCM processing pipeline test (Requirements C.1, C.2, C.3)
  const pcmPipelineRes = testPcmProcessingPipeline();
  if (!pcmPipelineRes.success) {
    throw new Error(`PCM Processing Pipeline Test Failed: ${pcmPipelineRes.message}`);
  }
  console.log(`✓ ${pcmPipelineRes.message}`);

  console.log('----------------------------------------');
}

// If executed directly as a script
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('validateContent')) {
  validateAudioUtils();
  const summary = validateAllContent();
  const totalFailed = summary.puzzles.failed + summary.openings.failed + summary.gambits.failed;
  if (totalFailed > 0) {
    console.error(`Validation failed with ${totalFailed} errors.`);
    process.exit(1);
  } else {
    console.log('All content and utility tests validated successfully!');
    process.exit(0);
  }
}
