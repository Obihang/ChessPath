import { Chess } from 'chess.js';
import {
  coachCommentaryService,
  getMaxSentencesForMode,
  getMaxWordsForMode,
  classifyMove,
  MoveFacts,
  CommentaryResult,
} from '../src/services/coachCommentaryService';
import { geminiService } from '../src/services/geminiService';
import { engineService } from '../src/services/engineService';
import { speechService } from '../src/services/speechService';
import { DEFAULT_SETTINGS } from '../src/services/storageService';

async function runRegressionTests() {
  console.log('--- Running Coach Commentary & Move Classification Regression Suite ---');

  // =========================================================================
  // Test 1: Pure helper functions and no runtime error from sentence limit helper
  // =========================================================================
  console.log('Test 1: Sentence & word limit helpers for all modes...');
  const modes = ['learning', 'criticizing', 'simple', 'competitive'] as const;

  for (const mode of modes) {
    const s1 = getMaxSentencesForMode(mode);
    const s2 = coachCommentaryService.getMaxSentencesForMode(mode);
    if (s1 !== s2) {
      throw new Error(`Test 1 Failed: Pure helper (${s1}) and service method (${s2}) mismatch for mode ${mode}`);
    }

    const w1 = getMaxWordsForMode(mode);
    const w2 = coachCommentaryService.getMaxWordsForMode(mode);
    if (w1 !== w2) {
      throw new Error(`Test 1 Failed: Pure word helper (${w1}) and service method (${w2}) mismatch for mode ${mode}`);
    }
  }

  if (getMaxSentencesForMode('simple') !== 1 || getMaxWordsForMode('simple') !== 12) {
    throw new Error('Test 1 Failed: Simple mode caps must be 1 sentence and 12 words');
  }
  if (getMaxSentencesForMode('criticizing') !== 2 || getMaxWordsForMode('criticizing') !== 25) {
    throw new Error('Test 1 Failed: Criticizing mode caps must be 2 sentences and 25 words');
  }
  if (getMaxSentencesForMode('competitive') !== 2 || getMaxWordsForMode('competitive') !== 15) {
    throw new Error('Test 1 Failed: Competitive mode caps must be 2 sentences and 15 words');
  }
  if (getMaxSentencesForMode('learning') !== 2 || getMaxWordsForMode('learning') !== 30) {
    throw new Error('Test 1 Failed: Learning mode caps must be 2 sentences and 30 words');
  }
  console.log('✓ Test 1 passed: All mode limits verified and consistent.');

  // =========================================================================
  // Test 2: Valid zero centipawn evaluation vs unavailable evaluation
  // =========================================================================
  console.log('Test 2: Valid 0 cp loss vs unavailable evaluation...');
  // A genuine 0 cp loss when evaluation evidence is available is 'good'
  const validGood = classifyMove(0, false, false, true);
  if (validGood !== 'good') {
    throw new Error(`Test 2 Failed: Genuine 0 cp loss should be 'good', got ${validGood}`);
  }

  // An unavailable evaluation (cpLoss = null, isEvaluationAvailable = false) MUST be 'unavailable'
  const unavailNull = classifyMove(null, false, false, false);
  if (unavailNull !== 'unavailable') {
    throw new Error(`Test 2 Failed: Missing evaluation must produce 'unavailable', got ${unavailNull}`);
  }

  // Even with isBestMove false and cpLoss null, must never produce 'good'
  const unavailNullWithTrue = classifyMove(null, false, false, true);
  if (unavailNullWithTrue !== 'unavailable') {
    throw new Error(`Test 2 Failed: cpLoss=null must produce 'unavailable', got ${unavailNullWithTrue}`);
  }
  console.log('✓ Test 2 passed: Missing evaluation never produces false Good Move verdict.');

  // =========================================================================
  // Test 3: Instant speech verdict skips 'unavailable'
  // =========================================================================
  console.log('Test 3: Instant speech verdict guard against unavailable classifications...');
  const spokenUnavailable = await speechService.speakVerdictInstant('unavailable', DEFAULT_SETTINGS);
  if (spokenUnavailable !== false) {
    throw new Error('Test 3 Failed: speakVerdictInstant must return false and not speak on unavailable classification');
  }
  console.log('✓ Test 3 passed: Speech verdict correctly guards against unanalyzed moves.');

  // =========================================================================
  // Test 4: computeMoveFacts with engine evaluation unavailable before/after move
  // =========================================================================
  console.log('Test 4: MoveFacts with simulated missing engine evaluations...');
  const origEvaluate = engineService.evaluate;

  try {
    // 4a. Engine fails before move
    engineService.evaluate = async (fen: string) => {
      if (fen.includes('startpos') || fen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        return {
          score: null,
          mate: null,
          bestMove: '',
          source: 'stockfish' as const,
          isAvailable: false,
          status: 'unavailable' as const,
          error: 'Engine timed out before move',
        };
      }
      return {
        score: 15,
        mate: null,
        bestMove: 'c7c5',
        source: 'stockfish' as const,
        isAvailable: true,
        status: 'available' as const,
      };
    };

    const fenBefore = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fenAfter = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const moveRec = { from: 'e2', to: 'e4', san: 'e4', color: 'w' as const, piece: 'p' as const };

    coachCommentaryService.clearCache();
    const factsMissingBefore = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, moveRec, 'w');

    if (factsMissingBefore.evalBefore !== null) {
      throw new Error(`Test 4a Failed: evalBefore should be null when engine failed, got ${factsMissingBefore.evalBefore}`);
    }
    if (factsMissingBefore.cpLoss !== null) {
      throw new Error(`Test 4a Failed: cpLoss should be null when evalBefore is unavailable, got ${factsMissingBefore.cpLoss}`);
    }
    if (factsMissingBefore.isEvaluationAvailable !== false) {
      throw new Error('Test 4a Failed: isEvaluationAvailable should be false');
    }
    if (factsMissingBefore.classification !== 'unavailable') {
      throw new Error(`Test 4a Failed: classification must be 'unavailable', got ${factsMissingBefore.classification}`);
    }

    // 4b. Engine fails after move
    engineService.evaluate = async (fen: string) => {
      if (fen === fenAfter) {
        return {
          score: null,
          mate: null,
          bestMove: '',
          source: 'stockfish' as const,
          isAvailable: false,
          status: 'unavailable' as const,
          error: 'Engine timed out after move',
        };
      }
      return {
        score: 25,
        mate: null,
        bestMove: 'e2e4',
        bestMoveSan: 'e4',
        source: 'stockfish' as const,
        isAvailable: true,
        status: 'available' as const,
      };
    };

    coachCommentaryService.clearCache();
    const factsMissingAfter = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, moveRec, 'w');

    if (factsMissingAfter.evalAfter !== null) {
      throw new Error(`Test 4b Failed: evalAfter should be null when engine failed, got ${factsMissingAfter.evalAfter}`);
    }
    if (factsMissingAfter.cpLoss !== null) {
      throw new Error(`Test 4b Failed: cpLoss should be null when evalAfter is unavailable, got ${factsMissingAfter.cpLoss}`);
    }
    if (factsMissingAfter.classification !== 'unavailable') {
      throw new Error(`Test 4b Failed: classification must be 'unavailable', got ${factsMissingAfter.classification}`);
    }
    // Note: Best move match can be true if candidate matched, but classification remains unverified
    if (!factsMissingAfter.isBestMove) {
      throw new Error('Test 4b Failed: isBestMove should reflect engine candidate match');
    }
    console.log('✓ Test 4 passed: Unavailable engine evaluations produce explicit nulls and unavailable classification.');

    // =========================================================================
    // Test 5: Mate-score handling
    // =========================================================================
    console.log('Test 5: Mate-score handling in computeMoveFacts...');
    engineService.evaluate = async (fen: string) => {
      if (fen === fenBefore) {
        return {
          score: null,
          mate: 2, // Mover has mate in 2
          bestMove: 'e2e4',
          bestMoveSan: 'e4',
          source: 'stockfish' as const,
          isAvailable: true,
          status: 'available' as const,
        };
      }
      return {
        score: null,
        mate: -1, // Opponent is mated in 1 (mover has mate in 1)
        bestMove: 'e7e5',
        source: 'stockfish' as const,
        isAvailable: true,
        status: 'available' as const,
      };
    };

    coachCommentaryService.clearCache();
    const mateFacts = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, moveRec, 'w');
    if (mateFacts.mateBefore !== 2) {
      throw new Error(`Test 5 Failed: mateBefore should be 2, got ${mateFacts.mateBefore}`);
    }
    if (mateFacts.mateAfter !== 1) {
      throw new Error(`Test 5 Failed: mateAfter from mover perspective should be +1, got ${mateFacts.mateAfter}`);
    }
    if (mateFacts.cpLoss === null || mateFacts.cpLoss > 50) {
      throw new Error(`Test 5 Failed: Maintaining forced mate should have 0 cp loss, got ${mateFacts.cpLoss}`);
    }
    console.log('✓ Test 5 passed: Forced mate transitions mapped accurately to mover perspective.');
  } finally {
    engineService.evaluate = origEvaluate;
  }

  // =========================================================================
  // Test 6: All four coaching modes with mocked successful Gemini responses
  // =========================================================================
  console.log('Test 6: All 4 coaching modes with successful Gemini responses...');
  const origGenerateLive = geminiService.generateLiveCommentary;
  const origHasKey = geminiService.hasKey;

  const mockMoveFacts: MoveFacts = {
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    previousFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
    moveSan: 'Nf3',
    moveUci: 'g1f3',
    moverColor: 'w',
    evalBefore: 30,
    evalAfter: 35,
    cpLoss: 0,
    isEvaluationAvailable: true,
    isBestMove: true,
    bestMoveSan: 'Nf3',
    isCapture: false,
    isCheck: false,
    isCastling: false,
    isPromotion: false,
    isSacrifice: false,
    classification: 'great',
    gamePhase: 'opening',
    evalSwing: 5,
  };

  try {
    geminiService.hasKey = () => true;

    for (const mode of modes) {
      geminiService.generateLiveCommentary = async () => {
        switch (mode) {
          case 'learning':
            return 'Great move. You developed your knight toward the center, pressuring Black’s pawn on e5.';
          case 'criticizing':
            return 'Good development with Nf3. Keep an eye on center control.';
          case 'simple':
            return 'Good move developing your knight.';
          case 'competitive':
            return 'White maintains a slight +0.3 initiative with active knight development.';
        }
      };

      coachCommentaryService.clearCache();
      const res = await coachCommentaryService.generateCommentary(
        mockMoveFacts,
        ['e4', 'e5', 'Nf3'],
        mode,
        true
      );

      if (!res || !res.comment) {
        throw new Error(`Test 6 Failed: Mode ${mode} returned empty commentary result`);
      }
      if (res.source !== 'gemini') {
        throw new Error(`Test 6 Failed: Expected source 'gemini', got ${res.source}`);
      }

      // Verify length limits
      const wordCount = res.comment.split(/\s+/).length;
      const maxWords = getMaxWordsForMode(mode);
      if (wordCount > maxWords) {
        throw new Error(`Test 6 Failed: Mode ${mode} exceeded word limit (${wordCount} > ${maxWords}): "${res.comment}"`);
      }
      console.log(`  Mode [${mode}] result (${wordCount} words): "${res.comment}"`);
    }
    console.log('✓ Test 6 passed: All 4 coaching modes successfully processed Gemini commentary.');

    // =========================================================================
    // Test 7: Gemini failure and local fallback behavior
    // =========================================================================
    console.log('Test 7: Gemini failure and local fallback behavior...');
    geminiService.generateLiveCommentary = async () => {
      throw new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded');
    };

    coachCommentaryService.clearCache();
    coachCommentaryService.resetRateLimit();

    const fallbackRes = await coachCommentaryService.generateCommentary(
      mockMoveFacts,
      ['e4', 'e5', 'Nf3'],
      'learning',
      true
    );

    if (!fallbackRes || !fallbackRes.comment) {
      throw new Error('Test 7 Failed: Failed Gemini call should return safe local fallback commentary');
    }
    if (fallbackRes.source !== 'template') {
      throw new Error(`Test 7 Failed: Expected fallback source 'template', got ${fallbackRes.source}`);
    }
    if (!fallbackRes.isRateLimited) {
      throw new Error('Test 7 Failed: 429 error should set isRateLimited flag');
    }
    console.log(`✓ Test 7 passed: Fallback commentary cleanly returned: "${fallbackRes.comment}"`);

    // =========================================================================
    // Test 8: Listener notification on commentary generation
    // =========================================================================
    console.log('Test 8: Automatic commentary listener notification...');
    let notifiedResult: CommentaryResult | null = null;
    const unsubscribe = coachCommentaryService.subscribeToCommentary((r) => {
      notifiedResult = r;
    });

    coachCommentaryService.clearCache();
    await coachCommentaryService.generateCommentary(mockMoveFacts, ['e4', 'e5', 'Nf3'], 'simple', true);

    unsubscribe();
    if (!notifiedResult) {
      throw new Error('Test 8 Failed: Registered subscriber did not receive commentary result');
    }
    console.log('✓ Test 8 passed: Subscriber received live commentary notification.');
  } finally {
    geminiService.generateLiveCommentary = origGenerateLive;
    geminiService.hasKey = origHasKey;
    coachCommentaryService.resetRateLimit();
  }

  console.log('\n======================================================');
  console.log('ALL REGRESSION TESTS PASSED (8/8)');
  console.log('======================================================');
  process.exit(0);
}

runRegressionTests().catch((err) => {
  console.error('\n❌ Regression Test FAILED:', err);
  process.exit(1);
});
