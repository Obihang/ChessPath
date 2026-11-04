import React from 'react';
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
}

/**
 * Helper to evaluate a player move using local heuristic commentary (`generateCommentary`)
 * and upgrade with `analyzeMoveWithAI` (with a 3.5s timeout fallback) when a smart AI key is configured.
 */
export async function evaluateAndSpeakLiveMove(params: {
  fen: string;
  prevFen: string;
  moveSan: string;
  evalAfter: number;
  evalBefore: number;
  bestMoveUci?: string;
  coachVerbosity?: CoachVerbosity;
  coachPersonality?: CoachPersonality;
  voiceEnabled?: boolean;
  ttsEngine?: 'edge' | 'browser';
  edgeVoice?: string;
}): Promise<{ text: string; classification: string; evalDrop: number; bestMoveSan?: string }> {
  const verbosity: CoachVerbosity = params.coachVerbosity || 'detailed';
  const personality: CoachPersonality = params.coachPersonality || 'strict';

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

  let finalText = commentary.text;

  if (detectApiKeyProvider().provider !== 'none') {
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
  ...rest
}) => {
  const mergedSettings: AppSettings = {
    ...settings,
    coachVerbosity: settings.coachVerbosity || progress?.coachVerbosity || 'detailed',
    coachPersonality: settings.coachPersonality || progress?.coachPersonality || 'strict',
    ttsEngine: settings.ttsEngine || progress?.ttsEngine || 'edge',
    edgeVoice: settings.edgeVoice || progress?.edgeVoice || 'en-US-AndrewNeural',
    aiApiKey: settings.aiApiKey || progress?.aiApiKey || settings.geminiApiKey || '',
  };

  return <PlayView settings={mergedSettings} {...rest} />;
};

export default PlayVsComputer;
