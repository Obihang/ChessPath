import { useState, useRef, useCallback } from 'react';
import { AppSettings, MoveRecord, PieceColor } from '../types/chess';
import { coachCommentaryService, MoveFacts, CommentaryResult } from '../services/coachCommentaryService';
import { speechService } from '../services/speechService';

export interface UseLiveCoachOptions {
  settings: AppSettings;
  playerColor: PieceColor;
  onCommentaryGenerated?: (result: CommentaryResult) => void;
}

export function useLiveCoach({ settings, playerColor, onCommentaryGenerated }: UseLiveCoachOptions) {
  const [latestComment, setLatestComment] = useState<string | null>(null);
  const [commentFacts, setCommentFacts] = useState<MoveFacts | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Track sequence ID to drop stale asynchronous analyses
  const analysisSeqRef = useRef<number>(0);
  const lastPhaseRef = useRef<'opening' | 'middlegame' | 'endgame'>('opening');

  /**
   * Process a live move executed during gameplay.
   * Only called for moves actively played in the game, never initial position,
   * never loaded games, and never when liveCoach is disabled.
   */
  const processMove = useCallback(
    async (
      move: MoveRecord,
      previousFen: string,
      currentFen: string,
      isPlayerMove: boolean,
      recentMovesSan: string[] = []
    ) => {
      // 1. Guard: Check if live coach is enabled
      if (!settings.liveCoachEnabled) {
        return;
      }

      // 2. Guard: Must have distinct valid positions
      if (!previousFen || !currentFen || previousFen === currentFen) {
        return;
      }

      const currentSeq = ++analysisSeqRef.current;
      setIsAnalyzing(true);

      try {
        // 3. Compute engine facts with Stockfish (eval before and after, cp loss, classification)
        const facts = await coachCommentaryService.computeMoveFacts(
          previousFen,
          currentFen,
          move,
          move.color,
          lastPhaseRef.current
        );

        lastPhaseRef.current = facts.gamePhase;

        // If another move arrived while Stockfish was analyzing, drop this stale result
        if (currentSeq !== analysisSeqRef.current) {
          return;
        }

        // 4. Check mode condition (hard limit: if false, do not call Gemini at all)
        const shouldComment = coachCommentaryService.shouldModeComment(
          settings.coachMode,
          facts,
          isPlayerMove
        );

        if (!shouldComment) {
          setIsAnalyzing(false);
          return;
        }

        // 5. Generate commentary (Gemini or fallback template)
        const commentaryResult = await coachCommentaryService.generateCommentary(
          facts,
          recentMovesSan,
          settings.coachMode,
          isPlayerMove
        );

        // If another move arrived while Gemini was generating, drop this stale result
        if (currentSeq !== analysisSeqRef.current) {
          return;
        }

        if (commentaryResult && commentaryResult.comment) {
          setLatestComment(commentaryResult.comment);
          setCommentFacts(commentaryResult.facts);
          onCommentaryGenerated?.(commentaryResult);

          // 6. Speak commentary if voice is enabled and not muted
          if (settings.voiceEnabled && !isMuted) {
            speechService.speakWithCoach(commentaryResult.comment, settings, {
              onError: (err) => {
                console.warn('Live coach speech error:', err);
              },
            });
          }
        }
      } catch (err) {
        console.warn('useLiveCoach error:', err);
      } finally {
        if (currentSeq === analysisSeqRef.current) {
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
  }, []);

  const repeatComment = useCallback(() => {
    if (latestComment && settings.voiceEnabled) {
      speechService.speakWithCoach(latestComment, settings);
    }
  }, [latestComment, settings]);

  const resetCoach = useCallback(() => {
    analysisSeqRef.current++;
    setIsAnalyzing(false);
    setLatestComment(null);
    setCommentFacts(null);
    lastPhaseRef.current = 'opening';
  }, []);

  return {
    latestComment,
    commentFacts,
    isMuted,
    isAnalyzing,
    processMove,
    toggleMute,
    dismissComment,
    repeatComment,
    resetCoach,
  };
}
