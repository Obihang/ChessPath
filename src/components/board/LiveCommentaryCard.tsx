import React from 'react';
import { Bot, Volume2, VolumeX, MessageSquare, X, RotateCw } from 'lucide-react';
import { CoachMode } from '../../types/chess';
import { MoveFacts } from '../../services/coachCommentaryService';

export interface LiveCommentaryCardProps {
  comment: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
  mode?: CoachMode;
  facts?: MoveFacts | null;
  onOpenCoach?: () => void;
  onDismiss?: () => void;
  onRepeat?: () => void;
}

export const LiveCommentaryCard: React.FC<LiveCommentaryCardProps> = ({
  comment,
  isMuted,
  onToggleMute,
  mode = 'learning',
  facts,
  onOpenCoach,
  onDismiss,
  onRepeat,
}) => {
  if (!comment) return null;

  // Derive badge style and label from engine facts
  let badgeLabel = mode === 'learning' ? 'Coach' : mode.toUpperCase();
  let badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';

  if (facts) {
    if (facts.classification === 'blunder') {
      badgeLabel = 'Blunder';
      badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    } else if (facts.classification === 'mistake') {
      badgeLabel = 'Mistake';
      badgeColor = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    } else if (facts.classification === 'inaccuracy') {
      badgeLabel = 'Inaccuracy';
      badgeColor = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    } else if (facts.classification === 'great') {
      badgeLabel = facts.isBestMove ? 'Best Move' : 'Great Move';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  }

  return (
    <div className="w-full max-w-[520px] bg-slate-900/95 border border-slate-700/70 rounded-xl p-3 shadow-xl flex items-start gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Coach Bot Icon */}
      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4" />
      </div>

      {/* Main Comment Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${badgeColor}`}>
            {badgeLabel}
          </span>
          {facts?.moveSan && (
            <span className="text-[11px] text-slate-400 font-mono">
              on {facts.moveSan}
            </span>
          )}
          {facts && (
            <span className="text-[10px] text-slate-500 font-mono ml-auto">
              {facts.evalAfter >= 0 ? `+${(facts.evalAfter / 100).toFixed(1)}` : (facts.evalAfter / 100).toFixed(1)}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-200 leading-relaxed font-medium">
          {comment}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {onRepeat && (
          <button
            type="button"
            onClick={onRepeat}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Repeat speech"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleMute}
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          title={isMuted ? 'Unmute live commentary' : 'Mute live commentary'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
        </button>

        {onOpenCoach && (
          <button
            type="button"
            onClick={onOpenCoach}
            className="p-1 rounded-md text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
            title="Chat with AI Coach"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors ml-0.5"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
