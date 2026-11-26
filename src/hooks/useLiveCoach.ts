import { useState, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { AppSettings, CoachPersonality, CoachVerbosity, MoveRecord, PieceColor } from '../types/chess';
import {
  coachCommentaryService,
  MoveFacts,
  CommentaryResult,
  recordMoveTiming,
} from '../services/coachCommentaryService';
import {
  analyzeMoveWithAI,
  buildFallbackMoveComment,
  detectApiKeyProvider,
  generateCommentary,
} from '../services/coachService';
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
  const [isAnalyzingPlayerMove, setIsAnalyzingPlayerMove] = useState<boolean>(false);

  const requestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAnalyzingPlayerMoveRef = useRef<boolean>(false);
  const isSpeakingPlayerMoveRef = useRef<boolean>(false);
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
   * Immediately cancels stale analysis/speech via AbortController when a new move starts.
   * Routine computer moves do not interrupt player move analysis unless Checkmate / Game Over.
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

      // Check if computer move resulted in Checkmate or Game Over
      let isComputerGameOverMove = false;
      if (!isPlayerMove) {
        try {
          const afterGame = new Chess(currentFen);
          isComputerGameOverMove = afterGame.isCheckmate() || afterGame.isGameOver();
        } catch {
          isComputerGameOverMove = move.san.includes('#');
        }

        if (!isComputerGameOverMove) {
          if (
            verbosity === 'verbose' &&
            !isAnalyzingPlayerMoveRef.current &&
            !isSpeakingPlayerMoveRef.current &&
            !speechService.isSpeaking()
          ) {
            setCurrentRecord((prev) => {
              if (!prev || !prev.comment) return prev;
              const replyNote = ` (Computer replied ${move.san}.)`;
              if (prev.comment.includes(replyNote)) return prev;
              return {
                ...prev,
                comment: `${prev.comment}${replyNote}`,
              };
            });
          }
          return;
        }
      }

      const moveStartTime = Date.now();
      const currentRequestId = ++requestIdRef.current;

      // Cancel any in-flight commentary/TTS request and stop stale queued audio immediately
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (isPlayerMove) {
        isAnalyzingPlayerMoveRef.current = true;
        setIsAnalyzingPlayerMove(true);
      }

      speechService.stop(isPlayerMove ? 'New player move executed' : 'Game over move executed');
      isSpeakingPlayerMoveRef.current = false;

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
        // 1. Engine calculation (fast 180ms capped Stockfish evals)
        const facts = await coachCommentaryService.computeMoveFacts(
          previousFen,
          currentFen,
          move,
          move.color,
          lastPhaseRef.current,
          controller.signal
        );

        const engineMs = Date.now() - moveStartTime;
        lastPhaseRef.current = facts.gamePhase;

        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) {
          return;
        }

        // 2. Compute local heuristic commentary with personality and verbosity
        const whiteEvalBeforeCp =
          facts.evalBefore !== null
            ? facts.moverColor === 'w'
              ? facts.evalBefore
              : -facts.evalBefore
            : 0;
        const whiteEvalAfterCp =
          facts.evalAfter !== null
            ? facts.moverColor === 'w'
              ? facts.evalAfter
              : -facts.evalAfter
            : 0;

        const whiteEvalBeforePawns = Number((whiteEvalBeforeCp / 100).toFixed(2));
        const whiteEvalAfterPawns = Number((whiteEvalAfterCp / 100).toFixed(2));
        const dropCp =
          facts.cpLoss !== null
            ? facts.cpLoss
            : Math.max(0, (facts.evalBefore ?? 0) - (facts.evalAfter ?? 0));
        const evalDropPawns = Number((Math.max(0, dropCp) / 100).toFixed(2));

        const localCommentary = generateCommentary(
          currentFen,
          previousFen,
          move.san,
          whiteEvalAfterPawns,
          whiteEvalBeforePawns,
          facts.bestMoveUci,
          verbosity,
          personality
        );

        const effectiveClassification =
          facts.classification !== 'unavailable'
            ? facts.classification
            : localCommentary.classification;

        const fallbackComment =
          buildFallbackMoveComment(
            {
              moveSan: move.san,
              classification: effectiveClassification,
              evalDrop: evalDropPawns,
              bestMoveSan: facts.bestMoveSan || localCommentary.bestMoveSan,
              tacticalReasons: localCommentary.tacticalReasons,
            },
            verbosity,
            personality
          ) || localCommentary.text;

        const isCriticalOrTactical =
          effectiveClassification === 'inaccuracy' ||
          effectiveClassification === 'mistake' ||
          effectiveClassification === 'blunder' ||
          localCommentary.classification === 'brilliant' ||
          facts.isSacrifice ||
          facts.isCheck ||
          move.san.includes('+') ||
          move.san.includes('#');

        if (isPlayerMove && verbosity === 'brief' && !isCriticalOrTactical) {
          isAnalyzingPlayerMoveRef.current = false;
          setIsAnalyzingPlayerMove(false);
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

        setCurrentRecord((prev) => {
          if (!prev || prev.requestId !== currentRequestId) return prev;
          return {
            ...prev,
            facts,
            status: 'generating_explanation',
          };
        });

        // 3. Determine final commentary text (fast 2.2s abortable AI call with instant local fallback)
        const textGenStart = Date.now();
        let finalComment = isComputerGameOverMove
          ? move.san.includes('#')
            ? `Checkmate with ${move.san}! Review the critical turning points to see how the attack developed.`
            : `Game over after ${move.san}.`
          : fallbackComment;
        let usedSource: 'gemini' | 'template' = 'template';

        const detectedProvider = detectApiKeyProvider(settings.aiApiKey || settings.geminiApiKey);
        const commentaryEngine = settings.commentaryEngine || 'ai';
        const warrantsAiCall =
          commentaryEngine === 'ai' &&
          detectedProvider.provider !== 'none' &&
          isPlayerMove &&
          (verbosity === 'detailed' || verbosity === 'verbose' || isCriticalOrTactical);

        if (warrantsAiCall) {
          const aiTimeoutController = new AbortController();
          const onParentAbort = () => aiTimeoutController.abort();
          controller.signal.addEventListener('abort', onParentAbort, { once: true });
          const timer = setTimeout(() => aiTimeoutController.abort(), 2200);

          try {
            const aiText = await analyzeMoveWithAI({
              fen: currentFen,
              prevFen: previousFen,
              moveSan: move.san,
              classification: effectiveClassification,
              evalDrop: evalDropPawns,
              bestMoveSan: facts.bestMoveSan || localCommentary.bestMoveSan,
              tacticalReasons: localCommentary.tacticalReasons,
              verbosity,
              personality,
              signal: aiTimeoutController.signal,
            });
            if (!controller.signal.aborted && aiText && aiText.trim()) {
              finalComment = aiText.trim();
              usedSource = 'gemini';
            }
          } catch {
            if (!controller.signal.aborted) {
              finalComment = fallbackComment;
            }
          } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', onParentAbort);
          }
        }

        const textGenMs = Date.now() - textGenStart;

        if (isPlayerMove && currentRequestId === requestIdRef.current) {
          isAnalyzingPlayerMoveRef.current = false;
          setIsAnalyzingPlayerMove(false);
        }

        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) {
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

          // 4. Speak result via MS Edge Neural TTS (fails silently if offline/unavailable)
          if (settings.voiceEnabled && !isMuted && !controller.signal.aborted) {
            if (isPlayerMove) {
              isSpeakingPlayerMoveRef.current = true;
            }
            let firstAudioMs = 0;
            void speechService
              .speakWithCoach(finalComment, settings, {
                signal: controller.signal,
                onFirstAudio: (timeToFirst) => {
                  firstAudioMs = timeToFirst;
                },
                onEnd: () => {
                  if (currentRequestId === requestIdRef.current) {
                    isSpeakingPlayerMoveRef.current = false;
                  }
                },
                onError: () => {
                  if (currentRequestId === requestIdRef.current) {
                    isSpeakingPlayerMoveRef.current = false;
                  }
                },
              })
              .then((speechRes) => {
                if (controller.signal.aborted || currentRequestId !== requestIdRef.current) {
                  return;
                }
                isSpeakingPlayerMoveRef.current = false;
                if (speechRes.timeToFirstAudioMs) {
                  firstAudioMs = speechRes.timeToFirstAudioMs;
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
              });
          } else {
            const totalMs = Date.now() - moveStartTime;
            recordMoveTiming({
              moveSan: move.san,
              mover: isPlayerMove ? 'player' : 'opponent',
              engineMs,
              textGenMs,
              timeToFirstAudioMs: 0,
              totalMs,
              timestamp: new Date().toLocaleTimeString(),
            });
          }
        }
      } catch (err: any) {
        if (controller.signal.aborted) {
          return;
        }
        if (isPlayerMove && currentRequestId === requestIdRef.current) {
          isAnalyzingPlayerMoveRef.current = false;
          setIsAnalyzingPlayerMove(false);
        }
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
    [settings, verbosity, personality, isMuted, onCommentaryGenerated]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        abortControllerRef.current?.abort();
        speechService.stop('Live coach muted');
        isSpeakingPlayerMoveRef.current = false;
      }
      return next;
    });
  }, []);

  const dismissComment = useCallback(() => {
    requestIdRef.current++;
    abortControllerRef.current?.abort();
    speechService.stop('Coach dismissed');
    isAnalyzingPlayerMoveRef.current = false;
    isSpeakingPlayerMoveRef.current = false;
    setIsAnalyzingPlayerMove(false);
    setCurrentRecord(null);
  }, []);

  const repeatComment = useCallback(() => {
    if (currentRecord?.comment && settings.voiceEnabled) {
      speechService.speakWithCoach(currentRecord.comment, settings);
    }
  }, [currentRecord, settings]);

  const resetCoach = useCallback(() => {
    requestIdRef.current++;
    abortControllerRef.current?.abort();
    isAnalyzingPlayerMoveRef.current = false;
    isSpeakingPlayerMoveRef.current = false;
    setIsAnalyzingPlayerMove(false);
    setCurrentRecord(null);
    speechService.stop('Coach reset');
    lastPhaseRef.current = 'opening';
  }, []);

  const setHintComment = useCallback(
    (hintText: string) => {
      requestIdRef.current++;
      abortControllerRef.current?.abort();
      setCurrentRecord({
        requestId: requestIdRef.current,
        moveSan: 'Coach Hint',
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
    isAnalyzingPlayerMove,
    isAnalyzingPlayerMoveRef,
    precomputeTurn,
    processMove,
    toggleMute,
    dismissComment,
    repeatComment,
    resetCoach,
    setLatestComment: setHintComment,
  };
}
