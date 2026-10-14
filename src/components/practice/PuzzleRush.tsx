import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { PUZZLES } from '../../data/puzzlesData';
import { AppSettings } from '../../types/chess';
import { ChessBoard } from '../board/ChessBoard';
import { soundService } from '../../services/audioService';
import {
  Zap,
  Timer,
  XCircle,
  Trophy,
  RotateCcw,
  ArrowLeft,
  Flame,
} from 'lucide-react';

interface PuzzleRushProps {
  settings: AppSettings;
  onBack: () => void;
  onFinish?: (score: number) => void;
}

export const PuzzleRush: React.FC<PuzzleRushProps> = ({
  settings,
  onBack,
  onFinish,
}) => {
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);

  // Shuffle puzzles for rush
  const [rushPuzzles] = useState(() => [...PUZZLES].sort(() => Math.random() - 0.5));
  const currentPuzzle = rushPuzzles[currentIndex] || rushPuzzles[0];

  const [game, setGame] = useState<Chess>(() => new Chess(currentPuzzle.fen));
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer loop
  useEffect(() => {
    if (isGameOver) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          endGame();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGameOver]);

  const endGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsGameOver(true);
    soundService.playVictory();
    onFinish?.(score);
  };

  // Reset board on puzzle change
  useEffect(() => {
    if (currentPuzzle) {
      setGame(new Chess(currentPuzzle.fen));
      setLastMove(null);
    }
  }, [currentIndex, currentPuzzle]);

  const handleUserMove = (moveData: { from: string; to: string; promotion?: string; san?: string }) => {
    if (isGameOver) return;

    setLastMove({ from: moveData.from, to: moveData.to });

    const expectedSan = currentPuzzle.solutionMoves[0];
    const playedSan = moveData.san || '';
    const playedUci = `${moveData.from}${moveData.to}`;

    const isCorrect = playedSan === expectedSan || playedUci === expectedSan || playedSan.startsWith(expectedSan);

    if (isCorrect) {
      soundService.playVictory();
      setScore((s) => s + 1);

      // Advance immediately to next puzzle
      if (currentIndex + 1 < rushPuzzles.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        endGame();
      }
    } else {
      soundService.playIllegal();
      const newStrikes = strikes + 1;
      setStrikes(newStrikes);

      if (newStrikes >= 3) {
        endGame();
      } else {
        // Reset current puzzle for a retry
        setTimeout(() => {
          setGame(new Chess(currentPuzzle.fen));
          setLastMove(null);
        }, 500);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-3 py-2 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-[520px]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit Rush</span>
        </button>

        {/* Timer & Strikes HUD */}
        <div className="flex items-center gap-3">
          {/* Strikes */}
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full border flex items-center justify-center text-[9px] font-bold ${
                  i < strikes ? 'bg-red-500 border-red-500 text-white' : 'border-slate-700 bg-slate-900 text-slate-600'
                }`}
              >
                ✕
              </span>
            ))}
          </div>

          {/* Clock */}
          <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs font-bold text-amber-400">
            <Timer className="w-3.5 h-3.5" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 rounded-xl font-mono text-xs font-bold text-amber-300">
            <Flame className="w-3.5 h-3.5" />
            <span>{score}</span>
          </div>
        </div>
      </div>

      {/* Board */}
      <div className="w-full">
        <ChessBoard
          game={game}
          orientation={currentPuzzle.playerColor}
          theme={settings.boardTheme}
          showCoordinates={settings.showCoordinates}
          disabled={isGameOver}
          lastMove={lastMove}
          onMove={handleUserMove}
          settings={settings}
        />
      </div>

      {/* Instructions */}
      <div className="w-full max-w-[520px] text-center text-xs text-slate-400">
        <span>Solve as many puzzles as possible in 3 minutes! 3 strikes and out.</span>
      </div>

      {/* Game Over Modal */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in zoom-in-95 duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
              <Trophy className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-100">Puzzle Rush Complete!</h3>
              <p className="text-sm font-mono text-amber-400 font-bold mt-1">
                Score: {score} Puzzles Solved
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={onBack}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
              >
                Exit
              </button>
              <button
                onClick={() => {
                  setTimeLeft(180);
                  setStrikes(0);
                  setScore(0);
                  setCurrentIndex(0);
                  setIsGameOver(false);
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
