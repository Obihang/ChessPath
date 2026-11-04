import React, { useRef } from 'react';
import { Chess } from 'chess.js';
import { PlayView } from './play/PlayView';
import { AppSettings, CoachPersonality, CoachVerbosity } from '../types/chess';
import { UserProgress } from '../types/curriculum';
import { generateCommentary } from '../services/commentaryService';
import { analyzeMoveWithAI, detectApiKeyProvider } from '../services/coachService';
import { speak } from '../utils/voice';

export interface PlayVsComputerProps {
  settings: AppSettings;
  progress?: UserProgress;
  onOpenSettings: () => void;
  onOpenCoach: () => void;
  onPositionChange?: (fen: string, history: string[]) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
  onVerbosityChange?: (verbosity: CoachVerbosity) => void;
  onPersonalityChange?: (personality: CoachPersonality) => void;
}

let isAnalyzingPlayerMoveFlag = false;

export function getIsAnalyzingPlayerMove(): boolean {
  return isAnalyzingPlayerMoveFlag;
}

/**
 * Helper to evaluate a move using local heuristic commentary (`generateCommentary`)
 * and upgrade with `analyzeMoveWithAI` (with a 3.5s timeout fallback) when a smart AI key is configured.
 * Routine computer moves (`isPlayerMove === false`) never interrupt or overwrite player move analysis/speech.
 */
export async function evaluateAndSpeakLiveMove(params: {
  fen: string;
  prevFen: string;
  moveSan: string;
  evalAfter: number;
  evalBefore: number;
  bestMoveUci?: string;
  isPlayerMove?: boolean;
  previousCommentary?: string;
  coachVerbosity?: CoachVerbosity;
  coachPersonality?: CoachPersonality;
  voiceEnabled?: boolean;
  ttsEngine?: 'edge' | 'browser';
  edgeVoice?: string;
}): Promise<{ text: string; classification: string; evalDrop: number; bestMoveSan?: string }> {
  const verbosity: CoachVerbosity = params.coachVerbosity || 'detailed';
  const personality: CoachPersonality = params.coachPersonality || 'strict';
  const isPlayerMove = params.isPlayerMove !== false;

  const commentary = generateCommentary(
    params.fen,
    params.prevFen,
    params.moveSan,
    params.evalAfter,
    params.evalBefore,
    params.bestMoveUci,
    verbosity,
    personality
  );

  if (verbosity === 'silent') {
    return { ...commentary, text: '' };
  }

  // When the computer makes its move:
  // Do NOT overwrite commentary or call speak() for routine computer moves if the Coach is analyzing/speaking!
  // Only trigger commentary/speech on the computer's move if it results in Checkmate or Game Over.
  if (!isPlayerMove) {
    let isGameOver = false;
    try {
      const gameAfter = new Chess(params.fen);
      isGameOver = gameAfter.isCheckmate() || gameAfter.isGameOver();
    } catch {
      isGameOver = params.moveSan.includes('#');
    }

    if (!isGameOver) {
      if (verbosity === 'verbose' && !isAnalyzingPlayerMoveFlag && params.previousCommentary) {
        const replyNote = ` (Computer replied ${params.moveSan}.)`;
        const combined = params.previousCommentary.includes(replyNote)
          ? params.previousCommentary
          : `${params.previousCommentary}${replyNote}`;
        return {
          ...commentary,
          text: combined,
        };
      }
      return {
        ...commentary,
        text: params.previousCommentary || '',
      };
    }
  }

  const isCritical =
    commentary.classification === 'inaccuracy' ||
    commentary.classification === 'mistake' ||
    commentary.classification === 'blunder' ||
    commentary.classification === 'brilliant' ||
    params.moveSan.includes('+') ||
    params.moveSan.includes('#');

  if (verbosity === 'brief' && !isCritical) {
    return { ...commentary, text: '' };
  }

  if (isPlayerMove) {
    isAnalyzingPlayerMoveFlag = true;
  }

  let finalText = commentary.text;

  try {
    if (isPlayerMove && detectApiKeyProvider().provider !== 'none') {
      try {
        const aiPromise = analyzeMoveWithAI({
          fen: params.fen,
          prevFen: params.prevFen,
          moveSan: params.moveSan,
          classification: commentary.classification,
          evalDrop: commentary.evalDrop,
          bestMoveSan: commentary.bestMoveSan,
          tacticalReasons: commentary.tacticalReasons,
          verbosity,
          personality,
        });

        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('AI timeout')), 3500)
        );

        const aiText = await Promise.race([aiPromise, timeoutPromise]);
        if (aiText && aiText.trim()) {
          finalText = aiText.trim();
        }
      } catch {
        finalText = commentary.text;
      }
    }
  } finally {
    // Clear isAnalyzingPlayerMoveFlag BEFORE speak() finishes so the computer doesn't freeze waiting for audio
    if (isPlayerMove) {
      isAnalyzingPlayerMoveFlag = false;
    }
  }

  if (finalText && params.voiceEnabled !== false) {
    speak(finalText, true, {
      ttsEngine: params.ttsEngine || 'edge',
      edgeVoice: params.edgeVoice || 'en-US-AndrewNeural',
    }).catch(() => {});
  }

  return {
    ...commentary,
    text: finalText,
  };
}

export const PlayVsComputer: React.FC<PlayVsComputerProps> = ({
  settings,
  progress,
  onVerbosityChange,
  onPersonalityChange,
  ...rest
}) => {
  const isAnalyzingPlayerMoveRef = useRef<boolean>(false);

  const mergedSettings: AppSettings = {
    ...settings,
    coachVerbosity: settings.coachVerbosity || progress?.coachVerbosity || 'detailed',
    coachPersonality: settings.coachPersonality || progress?.coachPersonality || 'strict',
    ttsEngine: settings.ttsEngine || progress?.ttsEngine || 'edge',
    edgeVoice: settings.edgeVoice || progress?.edgeVoice || 'en-US-AndrewNeural',
    aiApiKey: settings.aiApiKey || progress?.aiApiKey || settings.geminiApiKey || '',
  };

  return (
    <PlayView
      settings={mergedSettings}
      onVerbosityChange={onVerbosityChange}
      onPersonalityChange={onPersonalityChange}
      isAnalyzingPlayerMoveExternalRef={isAnalyzingPlayerMoveRef}
      {...rest}
    />
  );
};

export default PlayVsComputer;
