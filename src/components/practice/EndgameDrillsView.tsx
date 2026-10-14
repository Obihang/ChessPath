import React, { useState } from 'react';
import { Chess } from 'chess.js';
import { ENDGAME_DRILLS } from '../../data/puzzlesData';
import { EndgameDrill } from '../../types/curriculum';
import { AppSettings } from '../../types/chess';
import { ChessBoard } from '../board/ChessBoard';
import { engineService, ENGINE_DIFFICULTIES } from '../../services/engineService';
import { soundService } from '../../services/audioService';
import {
  ArrowLeft,
  Crown,
  Trophy,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';

interface EndgameDrillsViewProps {
  settings: AppSettings;
  onBack: () => void;
}

export const EndgameDrillsView: React.FC<EndgameDrillsViewProps> = ({
  settings,
  onBack,
}) => {
  const [selectedDrill, setSelectedDrill] = useState<EndgameDrill | null>(null);
  const [game, setGame] = useState<Chess>(() => new Chess());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const startDrill = (drill: EndgameDrill) => {
    setSelectedDrill(drill);
    const g = new Chess(drill.fen);
    setGame(g);
    setLastMove(null);
    setIsCompleted(false);
    setIsBotThinking(false);
  };

  const handleUserMove = async (moveData: { from: string; to: string; promotion?: string; san?: string }) => {
    setLastMove({ from: moveData.from, to: moveData.to });

    // Check if won
    if (game.isCheckmate()) {
      soundService.playVictory();
      setIsCompleted(true);
      return;
    }

    if (game.isDraw()) {
      soundService.playDraw();
      return;
    }

    // Bot responds
    setIsBotThinking(true);
    try {
      const best = await engineService.getBestMove(game.fen(), ENGINE_DIFFICULTIES.intermediate);
      const res = game.move({ from: best.from, to: best.to, promotion: best.promotion || 'q' });
      if (res) {
        setLastMove({ from: res.from, to: res.to });
        if (res.captured) soundService.playCapture();
        else soundService.playMove();

        if (game.isCheckmate()) {
          soundService.playVictory();
          setIsCompleted(true);
        } else if (game.isDraw()) {
          soundService.playDraw();
        }
      }
    } catch {
      // Ignored
    } finally {
      setIsBotThinking(false);
    }
  };

  if (!selectedDrill) {
    return (
      <div className="w-full max-w-xl mx-auto px-3 py-3 space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Practice Hub</span>
          </button>
          <span className="text-xs font-bold text-amber-400">Endgame Academy</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-1">
          <h2 className="text-base font-bold text-slate-100">Essential Endgame Drills</h2>
          <p className="text-xs text-slate-400">
            Play against the engine to convert guaranteed winning positions into checkmates.
          </p>
        </div>

        <div className="space-y-2">
          {ENDGAME_DRILLS.map((drill) => (
            <button
              key={drill.id}
              onClick={() => startDrill(drill)}
              className="w-full text-left bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all shadow-md group flex items-center justify-between"
            >
              <div className="space-y-1 pr-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase">
                    {drill.category}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                  {drill.title}
                </h3>
                <p className="text-xs text-slate-400">{drill.goal}</p>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-amber-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-3 py-2 space-y-3">
      <div className="flex items-center justify-between w-full max-w-[520px]">
        <button
          onClick={() => setSelectedDrill(null)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Drills</span>
        </button>

        <button
          onClick={() => startDrill(selectedDrill)}
          className="p-1 text-slate-400 hover:text-slate-200"
          title="Restart Drill"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="w-full max-w-[520px] bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-xl space-y-1">
        <h3 className="text-sm font-bold text-slate-100">{selectedDrill.title}</h3>
        <p className="text-xs text-slate-300">{selectedDrill.goal}</p>
      </div>

      <div className="w-full">
        <ChessBoard
          game={game}
          orientation={selectedDrill.playerColor}
          theme={settings.boardTheme}
          showCoordinates={settings.showCoordinates}
          disabled={isCompleted || isBotThinking}
          lastMove={lastMove}
          onMove={handleUserMove}
          settings={settings}
        />
      </div>

      {isCompleted && (
        <div className="w-full max-w-[520px] p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-center space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Drill Completed! Checkmate Delivered.</span>
          </div>
          <button
            onClick={() => setSelectedDrill(null)}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-lg transition-colors"
          >
            Back to Drills
          </button>
        </div>
      )}
    </div>
  );
};
