import React from 'react';
import { Volume2, VolumeX, GraduationCap, Sparkles } from 'lucide-react';
import { TopBar } from './common/TopBar';
import { TTSEngineType } from '../types/chess';

export interface HeaderProps {
  soundEnabled?: boolean;
  voiceEnabled?: boolean;
  ttsEngine?: TTSEngineType;
  onToggleSound?: () => void;
  onToggleVoice?: () => void;
  onOpenSettings?: () => void;
  onOpenCoach?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  soundEnabled = true,
  voiceEnabled = true,
  ttsEngine = 'edge',
  onToggleSound = () => {},
  onToggleVoice,
  onOpenSettings = () => {},
  onOpenCoach,
}) => {
  return (
    <TopBar
      soundEnabled={soundEnabled}
      voiceEnabled={voiceEnabled}
      ttsEngine={ttsEngine}
      onToggleSound={onToggleSound}
      onToggleVoice={onToggleVoice}
      onOpenSettings={onOpenSettings}
      onOpenCoach={onOpenCoach}
    />
  );
};

export { Volume2, VolumeX, GraduationCap, Sparkles };
