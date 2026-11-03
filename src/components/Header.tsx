import React from 'react';
import { TopBar } from './common/TopBar';
import { TTSEngineType } from '../types/chess';

export interface HeaderProps {
  soundEnabled?: boolean;
  ttsEngine?: TTSEngineType;
  onToggleSound?: () => void;
  onOpenSettings?: () => void;
  onOpenCoach?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  soundEnabled = true,
  ttsEngine = 'edge',
  onToggleSound = () => {},
  onOpenSettings = () => {},
  onOpenCoach,
}) => {
  return (
    <TopBar
      soundEnabled={soundEnabled}
      ttsEngine={ttsEngine}
      onToggleSound={onToggleSound}
      onOpenSettings={onOpenSettings}
      onOpenCoach={onOpenCoach}
    />
  );
};
