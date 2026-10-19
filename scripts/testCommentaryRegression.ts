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
  console.log('--- Running Phase 2 Comprehensive Coach Commentary & Move Classification Test Suite ---');

  // =========================================================================
  // Test 1: Sentence & word limit helpers for all modes (Phase 2 targets)
  // =========================================================================
  console.log('Test 1: Sentence & word limit helpers for Phase 2 targets...');
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

  if (getMaxSentencesForMode('learning') !== 4 || getMaxWordsForMode('learning') !== 65) {
    throw new Error('Test 1 Failed: Learning mode caps must be 4 sentences and 65 words');
  }
  if (getMaxSentencesForMode('criticizing') !== 3 || getMaxWordsForMode('criticizing') !== 50) {
    throw new Error('Test 1 Failed: Criticizing mode caps must be 3 sentences and 50 words');
  }
  if (getMaxSentencesForMode('simple') !== 2 || getMaxWordsForMode('simple') !== 20) {
    throw new Error('Test 1 Failed: Simple mode caps must be 2 sentences and 20 words');
  }
  if (getMaxSentencesForMode('competitive') !== 3 || getMaxWordsForMode('competitive') !== 40) {
    throw new Error('Test 1 Failed: Competitive mode caps must be 3 sentences and 40 words');
  }
  console.log('✓ Test 1 passed: All Phase 2 mode limits verified and consistent.');

  // =========================================================================
  // Test 2: Valid zero centipawn evaluation vs unavailable evaluation
  // =========================================================================
  console.log('Test 2: Valid 0 cp loss vs unavailable evaluation...');
  const validGood = classifyMove(0, false, false, true);
  if (validGood !== 'good') {
    throw new Error(`Test 2 Failed: Genuine 0 cp loss should be 'good', got ${validGood}`);
  }

  const unavailNull = classifyMove(null, false, false, false);
  if (unavailNull !== 'unavailable') {
    throw new Error(`Test 2 Failed: Missing evaluation must produce 'unavailable', got ${unavailNull}`);
  }

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
  // Test 4: computeMoveFacts with engine evaluation unavailable (before, after, both, sacrifice)
  // =========================================================================
  console.log('Test 4: MoveFacts with simulated missing engine evaluations...');
  const origEvaluate = engineService.evaluate;

  try {
    const fenBefore = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fenAfter = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const moveRec = { from: 'e2', to: 'e4', san: 'e4', color: 'w' as const, piece: 'p' as const };

    // 4a. Engine fails before move
    engineService.evaluate = async (fen: string) => {
      if (fen === fenBefore) {
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

    coachCommentaryService.clearCache();
    const factsMissingBefore = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, moveRec, 'w');

    if (factsMissingBefore.evalBefore !== null || factsMissingBefore.cpLoss !== null) {
      throw new Error('Test 4a Failed: evalBefore and cpLoss must be null when engine fails');
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

    if (factsMissingAfter.evalAfter !== null || factsMissingAfter.cpLoss !== null) {
      throw new Error('Test 4b Failed: evalAfter and cpLoss must be null');
    }
    if (factsMissingAfter.classification !== 'unavailable') {
      throw new Error(`Test 4b Failed: classification must be 'unavailable', got ${factsMissingAfter.classification}`);
    }

    // 4c. Both evaluations fail
    engineService.evaluate = async () => ({
      score: null,
      mate: null,
      bestMove: '',
      source: 'stockfish' as const,
      isAvailable: false,
      status: 'unavailable' as const,
      error: 'Engine offline',
    });

    coachCommentaryService.clearCache();
    const factsBothMissing = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, moveRec, 'w');
    if (factsBothMissing.evalBefore !== null || factsBothMissing.evalAfter !== null || factsBothMissing.cpLoss !== null) {
      throw new Error('Test 4c Failed: Both evals and cpLoss must be null');
    }
    if (factsBothMissing.classification !== 'unavailable') {
      throw new Error(`Test 4c Failed: Classification must be 'unavailable', got ${factsBothMissing.classification}`);
    }

    // 4d. Sacrifice detection without valid evaluations MUST be false
    const knightMove = { from: 'g1', to: 'f3', san: 'Nf3', color: 'w' as const, piece: 'n' as const };
    const sacFactsMissingEval = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, knightMove, 'w');
    if (sacFactsMissingEval.isSacrifice !== false) {
      throw new Error('Test 4d Failed: isSacrifice must be false when engine evaluation is unavailable');
    }

    console.log('✓ Test 4 passed: Unavailable engine evaluations produce explicit nulls, unavailable classification, and false sacrifice flag.');

    // =========================================================================
    // Test 5: Mate-score handling in computeMoveFacts
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
        mate: -1, // Opponent is mated in 1
        bestMove: 'e7e5',
        source: 'stockfish' as const,
        isAvailable: true,
        status: 'available' as const,
      };
    };

    coachCommentaryService.clearCache();
    const mateFacts = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, moveRec, 'w');
    if (mateFacts.mateBefore !== 2 || mateFacts.mateAfter !== 1) {
      throw new Error(`Test 5 Failed: Mover perspective mates mismatch: before=${mateFacts.mateBefore}, after=${mateFacts.mateAfter}`);
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
  console.log('Test 6: All 4 coaching modes with successful Gemini responses and Phase 2 limits...');
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
            return 'Great move. You developed your knight toward the center, pressuring Black’s pawn on e5. This controls d4 and e5 while preparing kingside castling.';
          case 'criticizing':
            return 'Nf3 develops actively and attacks e5. Watch out for Black developing Nc6 to protect it.';
          case 'simple':
            return 'Good move developing your knight to control the center.';
          case 'competitive':
            return 'White maintains +0.3 evaluation with active knight development pressuring e5.';
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
    // Test 8: Context-based Cache Key Separation (previousFen + moveUci + fen + mode)
    // =========================================================================
    console.log('Test 8: Commentary cache separation for different moves reaching same position...');
    coachCommentaryService.resetRateLimit();
    geminiService.generateLiveCommentary = async (_prompt) => 'Custom explanation for move A';

    const factsMoveA: MoveFacts = { ...mockMoveFacts, previousFen: 'fen_A', moveUci: 'e2e4' };
    const factsMoveB: MoveFacts = { ...mockMoveFacts, previousFen: 'fen_B', moveUci: 'd2d4' };

    coachCommentaryService.clearCache();
    const resA = await coachCommentaryService.generateCommentary(factsMoveA, [], 'learning', true);

    geminiService.generateLiveCommentary = async (_prompt) => 'Custom explanation for move B';
    const resB = await coachCommentaryService.generateCommentary(factsMoveB, [], 'learning', true);

    if (resA?.comment === resB?.comment) {
      throw new Error('Test 8 Failed: Different moves reaching same position must NOT share cached commentary');
    }
    console.log('✓ Test 8 passed: Cache keys correctly separate by full move context.');

    // =========================================================================
    // Test 9: Listener notification and deduplication
    // =========================================================================
    console.log('Test 9: Automatic commentary listener notification and event ID...');
    let notifiedResult: CommentaryResult | null = null;
    const unsubscribe = coachCommentaryService.subscribeToCommentary((r) => {
      notifiedResult = r;
    });

    coachCommentaryService.clearCache();
    await coachCommentaryService.generateCommentary(mockMoveFacts, ['e4', 'e5', 'Nf3'], 'simple', true);

    unsubscribe();
    if (!notifiedResult || !(notifiedResult as CommentaryResult).id) {
      throw new Error('Test 9 Failed: Registered subscriber did not receive commentary result with unique event ID');
    }
    console.log('✓ Test 9 passed: Subscriber received live commentary notification with event ID.');

    // =========================================================================
    // Test 10: Legal Move Validation with chess.js
    // =========================================================================
    console.log('Test 10: Validated candidate moves using chess.js...');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

    engineService.evaluate = async () => ({
      score: 20,
      mate: null,
      bestMove: 'e2e4',
      source: 'stockfish' as const,
      isAvailable: true,
      status: 'available' as const,
    });

    coachCommentaryService.clearCache();
    const validatedFacts = await coachCommentaryService.computeMoveFacts(
      startFen,
      afterE4,
      { from: 'e2', to: 'e4', san: 'e4', piece: 'p' as const },
      'w'
    );

    if (validatedFacts.bestMoveSan !== 'e4') {
      throw new Error(`Test 10 Failed: Expected bestMoveSan 'e4', got ${validatedFacts.bestMoveSan}`);
    }

    // Verify illegal UCI move is safely rejected by chess.js validation
    const game = new Chess(startFen);
    let illegalMoveFailed = false;
    try {
      game.move({ from: 'e2', to: 'e8' }); // Illegal pawn jump
    } catch {
      illegalMoveFailed = true;
    }
    if (!illegalMoveFailed) {
      throw new Error('Test 10 Failed: chess.js should reject illegal move e2e8');
    }
    console.log('✓ Test 10 passed: Candidate moves validated with chess.js against position.');
  } finally {
    geminiService.generateLiveCommentary = origGenerateLive;
    geminiService.hasKey = origHasKey;
    engineService.evaluate = origEvaluate;
    coachCommentaryService.resetRateLimit();
  }

  console.log('\n======================================================');
  console.log('ALL PHASE 2 REGRESSION TESTS PASSED (10/10)');
  console.log('======================================================');
  process.exit(0);
}

runRegressionTests().catch((err) => {
  console.error('\n❌ Regression Test FAILED:', err);
  process.exit(1);
});
