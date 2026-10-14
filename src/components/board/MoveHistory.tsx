import React, { useRef, useEffect } from 'react';
import { MoveRecord } from '../../types/chess';

interface MoveHistoryProps {
  moves: MoveRecord[];
  currentMoveIndex?: number;
  onSelectMove?: (index: number) => void;
}

export const MoveHistory: React.FC<MoveHistoryProps> = ({
  moves,
  currentMoveIndex,
  onSelectMove,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to end on new moves
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [moves.length]);

  // Group moves into pairs (White & Black)
  const movePairs: { num: number; white: MoveRecord; black?: MoveRecord; wIdx: number; bIdx?: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
      wIdx: i,
      bIdx: i + 1 < moves.length ? i + 1 : undefined,
    });
  }

  return (
    <div
      ref={containerRef}
      className="w-full max-h-28 overflow-y-auto bg-slate-900/60 border border-slate-800 rounded-xl p-2 font-mono text-xs text-slate-300"
    >
      {moves.length === 0 ? (
        <div className="text-center py-3 text-slate-500 font-sans text-xs">
          Game moves will appear here
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
          {movePairs.map((pair) => (
            <div key={pair.num} className="flex items-center gap-1.5 py-0.5">
              <span className="text-slate-500 w-5 text-right font-medium">{pair.num}.</span>
              <button
                onClick={() => onSelectMove?.(pair.wIdx)}
                className={`px-1.5 py-0.5 rounded transition-colors text-left hover:bg-slate-800 ${
                  currentMoveIndex === pair.wIdx ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-slate-200'
                }`}
              >
                {pair.white.san}
              </button>
              {pair.black && (
                <button
                  onClick={() => onSelectMove?.(pair.bIdx!)}
                  className={`px-1.5 py-0.5 rounded transition-colors text-left hover:bg-slate-800 ${
                    currentMoveIndex === pair.bIdx ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-slate-200'
                  }`}
                >
                  {pair.black.san}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
