import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { PuzzleItem } from '../../types/curriculum';
import { AppSettings } from '../../types/chess';
import { ChessBoard } from '../board/ChessBoard';
import { soundService } from '../../services/audioService';
import { speechService } from '../../services/speechService';
import {
  ArrowLeft,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Volume2,
  Trophy,
} from 'lucide-react';

interface PuzzlePlayerProps {
  puzzle: PuzzleItem;
  settings: AppSettings;
  userRating: number;
  onBack: () => void;
  onSolve: (puzzleId: string, ratingChange: number) => void;
  onFail: (puzzleId: string, ratingChange: number) => void;
  onNext?: () => void;
}

export const PuzzlePlayer: React.FC<PuzzlePlayerProps> = ({
  puzzle,
  settings,
  userRating,
  onBack,
  onSolve,
  onFail,
  onNext,
}) => {
  const [game, setGame] = useState<Chess>(() => new Chess(puzzle.fen));
  const [moveIndex, setMoveIndex] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [status, setStatus] = useState<'playing' | 'solved' | 'failed'>('playing');
  const [hintUsed, setHintUsed] = useState(false);
  const [showHintText, setShowHintText] = useState(false);

  useEffect(() => {
    setGame(new Chess(puzzle.fen));
    setMoveIndex(0);
    setLastMove(null);
    setStatus('playing');
    setHintUsed(false);
    setShowHintText(false);
  }, [puzzle.id]);

  const handleUserMove = (moveData: { from: string; to: string; promotion?: string; san?: string }) => {
    if (status !== 'playing') return;

    setLastMove({ from: moveData.from, to: moveData.to });

    const expectedSan = puzzle.solutionMoves[moveIndex];
    const playedSan = moveData.san || '';
    const playedUci = `${moveData.from}${moveData.to}`;

    const isCorrect = playedSan === expectedSan || playedUci === expectedSan || playedSan.startsWith(expectedSan);

    if (isCorrect) {
      const nextIndex = moveIndex + 1;
      setMoveIndex(nextIndex);

      if (nextIndex >= puzzle.solutionMoves.length) {
        // Solved!
        soundService.playVictory();
        setStatus('solved');
        const change = hintUsed ? 5 : 12;
        onSolve(puzzle.id, change);
      } else {
        soundService.playMove();
        // Opponent counter-move if multi-move puzzle
        setTimeout(() => {
          const oppMove = puzzle.solutionMoves[nextIndex];
          if (oppMove) {
            const res = game.move(oppMove);
            if (res) {
              setLastMove({ from: res.from, to: res.to });
              setMoveIndex(nextIndex + 1);
              soundService.playMove();
            }
          }
        }, 500);
      }
    } else {
      // Wrong move
      soundService.playIllegal();
      setStatus('failed');
      onFail(puzzle.id, -8);

      setTimeout(() => {
        game.undo();
        setStatus('playing');
      }, 700);
    }
  };

  const handleReset = () => {
    setGame(new Chess(puzzle.fen));
    setMoveIndex(0);
    setLastMove(null);
    setStatus('playing');
    soundService.playMove();
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      speechService.stop();
    };
  }, []);

  const handleSpeak = async () => {
    speechService.unlock();
    if (isSpeaking) {
      speechService.stop('Puzzle speech cancelled by user');
      setIsSpeaking(false);
      return;
    }

    const text = `${puzzle.title}. ${puzzle.description}. Find the best move for ${puzzle.playerColor === 'w' ? 'White' : 'Black'}.`;
    setIsSpeaking(true);
    await speechService.speakWithCoach(text, settings, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-3 py-2 space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between w-full max-w-[520px]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Tactics Hub</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-amber-400">
            Rating: {puzzle.rating}
          </span>
          <button
            onClick={handleSpeak}
            className={`p-1.5 rounded-lg border transition-colors ${
              isSpeaking
                ? 'bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={isSpeaking ? 'Stop voice' : 'Read puzzle'}
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Puzzle Card */}
      <div className="w-full max-w-[520px] bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
            Theme: {puzzle.theme}
          </span>
          <span className="text-xs font-medium text-slate-400">
            {puzzle.playerColor === 'w' ? 'White to move' : 'Black to move'}
          </span>
        </div>

        <h2 className="text-base font-bold text-slate-100 pt-1">{puzzle.title}</h2>
        <p className="text-xs text-slate-300">{puzzle.description}</p>
      </div>

      {/* Board */}
      <div className="w-full">
        <ChessBoard
          game={game}
          orientation={puzzle.playerColor}
          theme={settings.boardTheme}
          showCoordinates={settings.showCoordinates}
          disabled={status === 'solved'}
          lastMove={lastMove}
          onMove={handleUserMove}
          settings={settings}
        />
      </div>

      {/* Actions & Feedback */}
      <div className="w-full max-w-[520px] space-y-2">
        {status === 'solved' ? (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Tactics Puzzle Solved!</span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">
                +{hintUsed ? '5' : '12'} Elo
              </span>
            </div>
            {onNext && (
              <button
                onClick={onNext}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>{onNext ? 'Next Puzzle' : 'Finish'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setHintUsed(true);
                  setShowHintText(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>Hint</span>
              </button>
            </div>

            <button
              onClick={handleReset}
              className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              title="Reset Puzzle"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {showHintText && status !== 'solved' && (
          <div className="p-2.5 bg-slate-900/90 border border-amber-500/30 rounded-xl text-xs text-slate-300 animate-in fade-in duration-150">
            <span className="font-semibold text-amber-400">Hint: </span>
            {puzzle.hint}
          </div>
        )}
      </div>
    </div>
  );
};
