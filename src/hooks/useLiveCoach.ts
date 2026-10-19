import { useState, useRef, useCallback } from 'react';
import { AppSettings, MoveRecord, PieceColor } from '../types/chess';
import { coachCommentaryService, MoveFacts, CommentaryResult, recordMoveTiming } from '../services/coachCommentaryService';
import { speechService } from '../services/speechService';

export interface UseLiveCoachOptions {
  settings: AppSettings;
  playerColor: PieceColor;
  onCommentaryGenerated?: (result: CommentaryResult) => void;
}

export function useLiveCoach({ settings, playerColor, onCommentaryGenerated }: UseLiveCoachOptions) {
  const [latestComment, setLatestComment] = useState<string | null>(null);
  const [commentFacts, setCommentFacts] = useState<MoveFacts | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Per-move sequence tracking keyed by player moves
  const playerMoveSeqRef = useRef<number>(0);
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
   * Gives instant verdict badge & audio phrase, followed by AI explanation.
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

      // Only player moves increment the player move sequence
      let currentSeq = playerMoveSeqRef.current;
      if (isPlayerMove) {
        currentSeq = ++playerMoveSeqRef.current;
        // Stop previous speech smoothly ONLY when player makes their next move
        speechService.stop('Player executed next move');
        setCoachError(null);
      }

      setIsAnalyzing(true);

      try {
        // 1. Engine calculation (uses precomputed evaluation if present: ~0 to 250 ms)
        const facts = await coachCommentaryService.computeMoveFacts(
          previousFen,
          currentFen,
          move,
          move.color,
          lastPhaseRef.current
        );

        const engineMs = Date.now() - moveStartTime;
        lastPhaseRef.current = facts.gamePhase;

        // If player made another move while computing, drop stale result
        if (isPlayerMove && currentSeq !== playerMoveSeqRef.current) {
          return;
        }

        // 2. Instant Verdict Badge display (Best, Good, Inaccuracy, Mistake, Blunder + Better Move SAN)
        setCommentFacts(facts);

        // 3. Instant Spoken Verdict from IndexedDB cache (0 network delay)
        if (settings.voiceEnabled && !isMuted && isPlayerMove) {
          speechService.speakVerdictInstant(facts.classification, settings).catch(() => {});
        }

        // Check if this mode should generate commentary (opponent moves only)
        if (!isPlayerMove && !coachCommentaryService.shouldModeComment(
          settings.coachMode,
          facts,
          isPlayerMove
        )) {
          setIsAnalyzing(false);
          return;
        }

        // 4. Generate AI Commentary
        const textGenStart = Date.now();
        const commentaryResult = await coachCommentaryService.generateCommentary(
          facts,
          recentMovesSan,
          settings.coachMode,
          isPlayerMove
        );
        const textGenMs = Date.now() - textGenStart;

        if (isPlayerMove && currentSeq !== playerMoveSeqRef.current) {
          return;
        }

        if (commentaryResult && commentaryResult.comment) {
          setLatestComment(commentaryResult.comment);
          setCommentFacts(commentaryResult.facts);
          onCommentaryGenerated?.(commentaryResult);

          // 5. Speech Dispatch via Universal Speech Dispatcher
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
              setCoachError(`Voice failed: ${speechRes.error}`);
            } else {
              setCoachError(null);
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
        setCoachError(err?.message || 'Explanation failed');
      } finally {
        if (!isPlayerMove || currentSeq === playerMoveSeqRef.current) {
          setIsAnalyzing(false);
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
    setLatestComment(null);
    setCommentFacts(null);
    setCoachError(null);
  }, []);

  const repeatComment = useCallback(() => {
    if (latestComment && settings.voiceEnabled) {
      speechService.speakWithCoach(latestComment, settings);
    }
  }, [latestComment, settings]);

  const resetCoach = useCallback(() => {
    playerMoveSeqRef.current++;
    setIsAnalyzing(false);
    setLatestComment(null);
    setCommentFacts(null);
    setCoachError(null);
    lastPhaseRef.current = 'opening';
  }, []);

  return {
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
    setLatestComment,
    setCoachError,
  };
}
