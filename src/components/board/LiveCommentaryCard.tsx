import React from 'react';
import { Bot, Volume2, VolumeX, MessageSquare, X, RotateCw, Navigation } from 'lucide-react';
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
  onShowBetterMove?: (from: string, to: string) => void;
  isRateLimited?: boolean;
  error?: string | null;
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
  onShowBetterMove,
  isRateLimited = false,
  error = null,
}) => {
  if (!comment) return null;

  // Derive badge style and label from engine facts
  let badgeLabel = mode === 'learning' ? 'Coach' : mode.toUpperCase();
  let badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';

  if (facts) {
    if (facts.classification === 'unavailable') {
      badgeLabel = facts.isBestMove ? 'Best Move (Unverified)' : 'Move Analysis Unavailable';
      badgeColor = 'bg-slate-700/40 text-slate-300 border-slate-600/50';
    } else if (facts.classification === 'blunder') {
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
    } else {
      badgeLabel = 'Good Move';
      badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  }

  const showBetterMoveBtn =
    facts &&
    facts.cpLoss !== null &&
    facts.cpLoss >= 50 &&
    facts.bestMoveSan &&
    facts.bestMoveUci &&
    facts.bestMoveUci.length >= 4 &&
    onShowBetterMove;

  return (
    <div className="w-full max-w-[520px] bg-slate-900/95 border border-slate-700/70 rounded-xl p-3 shadow-xl flex items-start gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Coach Bot Icon */}
      <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4" />
      </div>

      {/* Main Comment Text & Badge */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${badgeColor}`}>
            {badgeLabel}
          </span>
          {facts?.moveSan && (
            <span className="text-[11px] text-slate-400 font-mono">
              on {facts.moveSan}
            </span>
          )}
          {facts && facts.evalAfter !== null && (
            <span className="text-[10px] text-slate-500 font-mono ml-auto">
              {facts.evalAfter >= 0 ? `+${(facts.evalAfter / 100).toFixed(1)}` : (facts.evalAfter / 100).toFixed(1)}
            </span>
          )}
          {facts && facts.evalAfter === null && facts.mateAfter !== null && facts.mateAfter !== undefined && (
            <span className="text-[10px] text-purple-400 font-mono ml-auto">
              {facts.mateAfter > 0 ? `+M${facts.mateAfter}` : `-M${Math.abs(facts.mateAfter)}`}
            </span>
          )}
        </div>

        <p className="text-xs text-slate-200 leading-relaxed font-medium">
          {comment}
        </p>

        {/* Visible failure feedback */}
        {error && (
          <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-md font-medium pt-0.5 flex items-center gap-1.5">
            <span className="shrink-0 text-rose-400">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Rate limit warning if active */}
        {isRateLimited && (
          <div className="text-[10px] text-amber-400 font-medium pt-0.5">
            ⚠️ Gemini API quota paused. Showing engine facts analysis.
          </div>
        )}

        {/* Show Better Move Button */}
        {showBetterMoveBtn && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                const from = facts!.bestMoveUci!.slice(0, 2);
                const to = facts!.bestMoveUci!.slice(2, 4);
                onShowBetterMove(from, to);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
            >
              <Navigation className="w-3 h-3 text-amber-400" />
              <span>Show better move ({facts.bestMoveSan}) on board</span>
            </button>
          </div>
        )}
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
