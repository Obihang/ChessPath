import React from 'react';
import { Volume2, VolumeX, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { soundService } from '../../services/audioService';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenSettings: () => void;
  onOpenCoach?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  soundEnabled,
  onToggleSound,
  onOpenSettings,
  onOpenCoach,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand Lockup */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shadow-amber-500/20">
            ♟
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-100">
              ChessPath
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* AI Coach Button */}
          {onOpenCoach && (
            <button
              onClick={onOpenCoach}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 text-xs font-semibold transition-colors"
              title="Open AI Coach"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Coach</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => {
              onToggleSound();
              if (!soundEnabled) soundService.playMove();
            }}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
            title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-colors"
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
