import { useState, useRef, useCallback } from 'react';
import { AppSettings, MoveRecord, PieceColor } from '../types/chess';
import { coachCommentaryService, MoveFacts, CommentaryResult, recordMoveTiming } from '../services/coachCommentaryService';
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

  // Monotonically increasing request ID for all move requests (player and opponent)
  const requestIdRef = useRef<number>(0);
  const lastPhaseRef = useRef<'opening' | 'middlegame' | 'endgame'>('opening');

  /**
   * Trigger pre-computation of Stockfish engine facts while player is thinking
   */
  const precomputeTurn = useCallback((currentFen: string) => {
    if (settings.liveCoachEnabled) {
      coachCommentaryService.precomputePlayerTurn(currentFen).catch(() => {});
    }
  }, [settings.liveCoachEnabled]);

  /**
   * Process a live move executed during gameplay.
   * Atomically tracks move state and invalidates any stale asynchronous results.
   */
  const processMove = useCallback(
    async (
      move: MoveRecord,
      previousFen: string,
      currentFen: string,
      isPlayerMove: boolean,
      recentMovesSan: string[] = []
    ) => {
      if (!settings.liveCoachEnabled) {
        return;
      }

      if (!previousFen || !currentFen || previousFen === currentFen) {
        return;
      }

      const moveStartTime = Date.now();
      const currentRequestId = ++requestIdRef.current;

      // Stop previous speech smoothly when a new move occurs
      speechService.stop('New move executed');

      // 1. Immediately clear previous move's commentary and mark new request as analyzing
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
        // 2. Engine calculation (uses precomputed evaluation if present: ~0 to 250 ms)
        const facts = await coachCommentaryService.computeMoveFacts(
          previousFen,
          currentFen,
          move,
          move.color,
          lastPhaseRef.current
        );

        const engineMs = Date.now() - moveStartTime;
        lastPhaseRef.current = facts.gamePhase;

        // Reject stale results if a newer move occurred during engine calculation
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        // 3. Update record with engine facts and transition to generating explanation
        setCurrentRecord((prev) => {
          if (!prev || prev.requestId !== currentRequestId) return prev;
          return {
            ...prev,
            facts,
            status: 'generating_explanation',
          };
        });

        // 4. Instant Spoken Verdict from IndexedDB cache (0 network delay)
        if (settings.voiceEnabled && !isMuted && isPlayerMove && facts.classification !== 'unavailable') {
          speechService.speakVerdictInstant(facts.classification, settings).catch(() => {});
        }

        // Check if this mode should generate commentary (opponent moves silence check)
        if (!isPlayerMove && !coachCommentaryService.shouldModeComment(
          settings.coachMode,
          facts,
          isPlayerMove
        )) {
          setCurrentRecord((prev) => {
            if (!prev || prev.requestId !== currentRequestId) return prev;
            return {
              ...prev,
              status: 'complete',
            };
          });
          return;
        }

        // 5. Generate AI Teaching Commentary
        const textGenStart = Date.now();
        const commentaryResult = await coachCommentaryService.generateCommentary(
          facts,
          recentMovesSan,
          settings.coachMode,
          isPlayerMove
        );
        const textGenMs = Date.now() - textGenStart;

        // Reject stale result if a newer move occurred during text generation
        if (currentRequestId !== requestIdRef.current) {
          return;
        }

        if (commentaryResult && commentaryResult.comment) {
          setCurrentRecord((prev) => {
            if (!prev || prev.requestId !== currentRequestId) return prev;
            return {
              ...prev,
              comment: commentaryResult.comment,
              facts: commentaryResult.facts,
              status: 'complete',
              isRateLimited: commentaryResult.isRateLimited,
            };
          });

          onCommentaryGenerated?.(commentaryResult);

          // 6. Universal Speech Dispatcher
          let firstAudioMs = 0;
          if (settings.voiceEnabled && !isMuted) {
            const speechRes = await speechService.speakWithCoach(commentaryResult.comment, settings, {
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
    [settings.liveCoachEnabled, settings.coachMode, settings.voiceEnabled, settings, isMuted, onCommentaryGenerated]
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

  const setHintComment = useCallback((hintText: string) => {
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
  }, [playerColor]);

  // Backwards compatible derived properties
  const latestComment = currentRecord?.comment ?? null;
  const commentFacts = currentRecord?.facts ?? null;
  const isAnalyzing = currentRecord?.status === 'analyzing_engine' || currentRecord?.status === 'generating_explanation';
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
