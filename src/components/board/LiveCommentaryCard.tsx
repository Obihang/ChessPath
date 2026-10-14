import React from 'react';
import { Bot, Volume2, VolumeX } from 'lucide-react';

interface LiveCommentaryCardProps {
  comment: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const LiveCommentaryCard: React.FC<LiveCommentaryCardProps> = ({ comment, isMuted, onToggleMute }) => {
  if (!comment) return null;

  return (
    <div className="absolute top-2 left-2 right-2 z-10 bg-slate-900/90 border border-slate-700/50 rounded-xl p-3 shadow-lg flex items-start gap-3 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
        <Bot className="w-5 h-5" />
      </div>
      <div className="flex-1 text-xs text-slate-200 leading-relaxed font-medium">
        {comment}
      </div>
      <button
        onClick={onToggleMute}
        className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        title={isMuted ? 'Unmute coach' : 'Mute coach'}
      >
        {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
      </button>
    </div>
  );
};
