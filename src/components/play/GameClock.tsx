import React, { useEffect } from 'react';
import { PieceColor } from '../../types/chess';
import { Timer } from 'lucide-react';

interface GameClockProps {
  whiteTime: number; // in seconds
  blackTime: number; // in seconds
  activeColor: PieceColor | null;
  isRunning: boolean;
  onTimeout?: (color: PieceColor) => void;
  orientation?: PieceColor;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = seconds < 10 ? `.${Math.floor((seconds % 1) * 10)}` : '';
  return `${mins}:${secs.toString().padStart(2, '0')}${tenths}`;
}

export const GameClock: React.FC<GameClockProps> = ({
  whiteTime,
  blackTime,
  activeColor,
  isRunning,
  orientation = 'w',
}) => {
  const isWhiteActive = activeColor === 'w' && isRunning;
  const isBlackActive = activeColor === 'b' && isRunning;

  const whiteLow = whiteTime > 0 && whiteTime <= 30;
  const blackLow = blackTime > 0 && blackTime <= 30;

  const whiteClock = (
    <div
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all ${
        isWhiteActive
          ? 'bg-amber-500/15 border-amber-500/60 shadow-xs'
          : 'bg-slate-900/80 border-slate-800'
      }`}
    >
      <div className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-400" />
      <span className="text-xs font-medium text-slate-400">White</span>
      <span
        className={`font-mono text-base sm:text-lg font-bold tracking-tight tabular-nums ${
          whiteLow ? 'text-red-400 animate-pulse' : isWhiteActive ? 'text-amber-300' : 'text-slate-300'
        }`}
      >
        {formatTime(whiteTime)}
      </span>
    </div>
  );

  const blackClock = (
    <div
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all ${
        isBlackActive
          ? 'bg-amber-500/15 border-amber-500/60 shadow-xs'
          : 'bg-slate-900/80 border-slate-800'
      }`}
    >
      <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
      <span className="text-xs font-medium text-slate-400">Black</span>
      <span
        className={`font-mono text-base sm:text-lg font-bold tracking-tight tabular-nums ${
          blackLow ? 'text-red-400 animate-pulse' : isBlackActive ? 'text-amber-300' : 'text-slate-300'
        }`}
      >
        {formatTime(blackTime)}
      </span>
    </div>
  );

  return (
    <div className="flex items-center justify-between w-full max-w-[520px] px-1">
      {orientation === 'w' ? (
        <>
          {blackClock}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Timer className="w-3.5 h-3.5" />
            <span>Clock</span>
          </div>
          {whiteClock}
        </>
      ) : (
        <>
          {whiteClock}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Timer className="w-3.5 h-3.5" />
            <span>Clock</span>
          </div>
          {blackClock}
        </>
      )}
    </div>
  );
};
