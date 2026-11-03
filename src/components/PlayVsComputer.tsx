import React from 'react';
import { PlayView } from './play/PlayView';
import { AppSettings } from '../types/chess';

export interface PlayVsComputerProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onOpenCoach: () => void;
  onPositionChange?: (fen: string, history: string[]) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
}

/**
 * PlayVsComputer wrapper component using move.before and move.after FENs
 * for accurate post-move engine evaluation without React state lag.
 */
export const PlayVsComputer: React.FC<PlayVsComputerProps> = (props) => {
  return <PlayView {...props} />;
};

export default PlayVsComputer;
