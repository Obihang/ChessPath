import { useState, useRef, useCallback } from 'react';
import { AppSettings, CoachPersonality, CoachVerbosity, MoveRecord, PieceColor } from '../types/chess';
import {
  coachCommentaryService,
  MoveFacts,
  CommentaryResult,
  recordMoveTiming,
} from '../services/coachCommentaryService';
import { generateCommentary } from '../services/commentaryService';
import { analyzeMoveWithAI, detectApiKeyProvider } from '../services/coachService';
import { speechService } from '../services/speechService';

export interface MoveAnalysisRecord {
  requestId: number;
  moveSan: string;
  moveUci: string;
  previousFen: string;
  currentFen: string;
  moverColor: 'w' | 'b';
  isPlayerMove: boolean;
  facts: MoveFacts | null;
  comment: string | null;
  status: 'analyzing_engine' | 'generating_explanation' | 'complete' | 'error';
  error: string | null;
  isRateLimited?: boolean;
}

export interface UseLiveCoachOptions {
  settings: AppSettings;
  playerColor: PieceColor;
  onCommentaryGenerated?: (result: CommentaryResult) => void;
}

export function useLiveCoach({ settings, playerColor, onCommentaryGenerated }: UseLiveCoachOptions) {
  const [currentRecord, setCurrentRecord] = useState<MoveAnalysisRecord | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const requestIdRef = useRef<number>(0);
  const lastPhaseRef = useRef<'opening' | 'middlegame' | 'endgame'>('opening');

  const verbosity: CoachVerbosity =
    settings.coachVerbosity || (settings.liveCoachEnabled === false ? 'silent' : 'detailed');
  const personality: CoachPersonality = settings.coachPersonality || 'strict';

  /**
   * Trigger pre-computation of Stockfish engine facts while player is thinking
   */
  const precomputeTurn = useCallback(
    (currentFen: string) => {
      if (settings.liveCoachEnabled && verbosity !== 'silent') {
        coachCommentaryService.precomputePlayerTurn(currentFen).catch(() => {});
      }
    },
    [settings.liveCoachEnabled, verbosity]
  );

  /**
   * Process a live move executed during gameplay.
   * Uses local heuristic commentary (`generateCommentary`) and upgrades with `analyzeMoveWithAI`
   * (with a 3.5s timeout fallback) when a universal AI key is configured.
   */
  const processMove = useCallback(
    async (
      move: MoveRecord,
      previousFen: string,
      currentFen: string,
      isPlayerMove: boolean,
      _recentMovesSan: string[] = []
    ) => {
      if (!settings.liveCoachEnabled || verbosity === 'silent') {
        return;
      }

      if (!previousFen || !currentFen || previousFen === currentFen) {
        return;
      }

      const moveStartTime = Date.now();
      const currentRequestId = ++requestIdRef.current;

      // Stop previous speech smoothly when a new move occurs
      speechService.stop('New move executed');

      const initialRecord: MoveAnalysisRecord = {
        requestId: currentRequestId,
        moveSan: move.san,
        moveUci: `${move.from}${move.to}${move.promotion || ''}`.toLowerCase(),
        previousFen,
        currentFen,
        moverColor: move.color,
        isPlayerMove,
        facts: null,
        comment: null,
        status: 'analyzing_engine',
        error: null,
      };
      setCurrentRecord(initialRecord);

      try {
        // 1. Engine calculation
        const facts = await coachCommentaryService.computeMoveFacts(
          previousFen,
          currentFen,
          move,
          move.color,
          lastPhaseRef.current
        );

        const engineMs = Date.now() - moveStartTime;
        lastPhaseRef.current = facts.gamePhase;

        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        // 2. Compute local heuristic commentary with personality and verbosity
        // Convert mover-perspective evalBefore/evalAfter back to White-perspective centipawns for generateCommentary
        const whiteEvalBefore =
          facts.evalBefore !== null
            ? facts.moverColor === 'w'
              ? facts.evalBefore
              : -facts.evalBefore
            : 0;
        const whiteEvalAfter =
          facts.evalAfter !== null
            ? facts.moverColor === 'w'
              ? facts.evalAfter
              : -facts.evalAfter
            : 0;

        const localCommentary = generateCommentary(
          currentFen,
          previousFen,
          move.san,
          whiteEvalAfter,
          whiteEvalBefore,
          facts.bestMoveUci,
          verbosity,
          personality
        );

        const effectiveClassification =
          facts.classification !== 'unavailable'
            ? facts.classification
            : localCommentary.classification;

        // Check if this move warrants commentary based on verbosity & player/opponent turn
        const isCriticalOrTactical =
          effectiveClassification === 'inaccuracy' ||
          effectiveClassification === 'mistake' ||
          effectiveClassification === 'blunder' ||
          localCommentary.classification === 'brilliant' ||
          facts.isSacrifice ||
          facts.isCheck ||
          move.san.includes('+') ||
          move.san.includes('#');

        if (isPlayerMove) {
          if (verbosity === 'brief' && !isCriticalOrTactical) {
            setCurrentRecord((prev) => {
              if (!prev || prev.requestId !== currentRequestId) return prev;
              return {
                ...prev,
                facts,
                status: 'complete',
              };
            });
            return;
          }
        } else {
          // Opponent moves only comment on major swings/checks/blunders
          if (!coachCommentaryService.shouldModeComment(settings.coachMode, facts, false)) {
            setCurrentRecord((prev) => {
              if (!prev || prev.requestId !== currentRequestId) return prev;
              return {
                ...prev,
                facts,
                status: 'complete',
              };
            });
            return;
          }
        }

        setCurrentRecord((prev) => {
          if (!prev || prev.requestId !== currentRequestId) return prev;
          return {
            ...prev,
            facts,
            status: 'generating_explanation',
          };
        });

        // 3. Determine final commentary text (Smart AI with 3.5s timeout fallback to local heuristic)
        const textGenStart = Date.now();
        let finalComment = localCommentary.text;
        let usedSource: 'gemini' | 'template' = 'template';

        const detectedProvider = detectApiKeyProvider(settings.aiApiKey || settings.geminiApiKey);
        const warrantsAiCall =
          detectedProvider.provider !== 'none' &&
          isPlayerMove &&
          (verbosity === 'detailed' || verbosity === 'verbose' || isCriticalOrTactical);

        if (warrantsAiCall) {
          try {
            const aiPromise = analyzeMoveWithAI({
              fen: currentFen,
              prevFen: previousFen,
              moveSan: move.san,
              classification: effectiveClassification,
              evalDrop: localCommentary.evalDrop,
              bestMoveSan: facts.bestMoveSan || localCommentary.bestMoveSan,
              tacticalReasons: localCommentary.tacticalReasons,
              verbosity,
              personality,
            });

            const timeoutPromise = new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('AI timeout')), 3500)
            );

            const aiText = await Promise.race([aiPromise, timeoutPromise]);
            if (aiText && aiText.trim()) {
              finalComment = aiText.trim();
              usedSource = 'gemini';
            }
          } catch {
            // Seamlessly fall back to localCommentary.text
            finalComment = localCommentary.text;
          }
        }

        const textGenMs = Date.now() - textGenStart;

        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        if (finalComment) {
          const commentaryResult: CommentaryResult = {
            id: `${previousFen}_${facts.moveUci}_${currentFen}_${verbosity}_${personality}`,
            comment: finalComment,
            facts,
            mode: settings.coachMode,
            source: usedSource,
            timestamp: new Date(),
          };

          setCurrentRecord((prev) => {
            if (!prev || prev.requestId !== currentRequestId) return prev;
            return {
              ...prev,
              comment: finalComment,
              facts,
              status: 'complete',
            };
          });

          coachCommentaryService.notifyListeners(commentaryResult);
          onCommentaryGenerated?.(commentaryResult);

          // 4. Speak result via Edge Neural TTS / Browser TTS
          let firstAudioMs = 0;
          if (settings.voiceEnabled && !isMuted) {
            const speechRes = await speechService.speakWithCoach(finalComment, settings, {
              onFirstAudio: (timeToFirst) => {
                firstAudioMs = timeToFirst;
              },
            });
            if (speechRes.timeToFirstAudioMs) {
              firstAudioMs = speechRes.timeToFirstAudioMs;
            }
            if (!speechRes.success && speechRes.error) {
              setCurrentRecord((prev) => {
                if (!prev || prev.requestId !== currentRequestId) return prev;
                return { ...prev, error: `Voice failed: ${speechRes.error}` };
              });
            }
          }

          const totalMs = Date.now() - moveStartTime;
          recordMoveTiming({
            moveSan: move.san,
            mover: isPlayerMove ? 'player' : 'opponent',
            engineMs,
            textGenMs,
            timeToFirstAudioMs: firstAudioMs,
            totalMs,
            timestamp: new Date().toLocaleTimeString(),
          });
        }
      } catch (err: any) {
        console.warn('useLiveCoach processMove error:', err);
        speechService.logDiagnostic('error', `Live coach move processing error: ${err?.message || err}`);

        if (currentRequestId === requestIdRef.current) {
          setCurrentRecord((prev) => {
            if (!prev || prev.requestId !== currentRequestId) return prev;
            return {
              ...prev,
              status: 'error',
              error: 'Coach explanation temporarily unavailable',
            };
          });
        }
      }
    },
    [
      settings,
      verbosity,
      personality,
      isMuted,
      onCommentaryGenerated,
    ]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        speechService.stop('Live coach muted');
      }
      return next;
    });
  }, []);

  const dismissComment = useCallback(() => {
    requestIdRef.current++;
    setCurrentRecord(null);
  }, []);

  const repeatComment = useCallback(() => {
    if (currentRecord?.comment && settings.voiceEnabled) {
      speechService.speakWithCoach(currentRecord.comment, settings);
    }
  }, [currentRecord, settings]);

  const resetCoach = useCallback(() => {
    requestIdRef.current++;
    setCurrentRecord(null);
    speechService.stop('Coach reset');
    lastPhaseRef.current = 'opening';
  }, []);

  const setHintComment = useCallback(
    (hintText: string) => {
      requestIdRef.current++;
      setCurrentRecord({
        requestId: requestIdRef.current,
        moveSan: 'Pre-move Hint',
        moveUci: '',
        previousFen: '',
        currentFen: '',
        moverColor: playerColor,
        isPlayerMove: true,
        facts: null,
        comment: hintText,
        status: 'complete',
        error: null,
      });
    },
    [playerColor]
  );

  const latestComment = currentRecord?.comment ?? null;
  const commentFacts = currentRecord?.facts ?? null;
  const isAnalyzing =
    currentRecord?.status === 'analyzing_engine' ||
    currentRecord?.status === 'generating_explanation';
  const coachError = currentRecord?.error ?? null;

  return {
    currentRecord,
    latestComment,
    commentFacts,
    coachError,
    isMuted,
    isAnalyzing,
    precomputeTurn,
    processMove,
    toggleMute,
    dismissComment,
    repeatComment,
    resetCoach,
    setLatestComment: setHintComment,
  };
}
