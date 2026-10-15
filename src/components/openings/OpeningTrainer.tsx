import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { OpeningItem } from '../../types/curriculum';
import { AppSettings, PieceColor } from '../../types/chess';
import { ChessBoard } from '../board/ChessBoard';
import { soundService } from '../../services/audioService';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface OpeningTrainerProps {
  opening: OpeningItem;
  settings: AppSettings;
  onBack: () => void;
  onCompletePractice?: (openingId: string, success: boolean) => void;
}

export const OpeningTrainer: React.FC<OpeningTrainerProps> = ({
  opening,
  settings,
  onBack,
  onCompletePractice,
}) => {
  const [activeTab, setActiveTab] = useState<'explore' | 'train'>('explore');

  // Explorer State
  const [explorerStep, setExplorerStep] = useState(0);
  const [explorerGame, setExplorerGame] = useState<Chess>(() => new Chess());
  const [explorerLastMove, setExplorerLastMove] = useState<{ from: string; to: string } | null>(null);

  // Trainer State
  const [trainGame, setTrainGame] = useState<Chess>(() => new Chess());
  const [trainStep, setTrainStep] = useState(0);
  const [trainLastMove, setTrainLastMove] = useState<{ from: string; to: string } | null>(null);
  const [trainFeedback, setTrainFeedback] = useState<'neutral' | 'success' | 'mistake'>('neutral');
  const [trainMistakeCount, setTrainMistakeCount] = useState(0);
  const [trainCompleted, setTrainCompleted] = useState(false);

  // Initialize Explorer
  useEffect(() => {
    const g = new Chess();
    let last = null;
    for (let i = 0; i < explorerStep; i++) {
      const res = g.move(opening.moves[i]);
      if (res) last = { from: res.from, to: res.to };
    }
    setExplorerGame(g);
    setExplorerLastMove(last);
  }, [explorerStep, opening.moves]);

  // Handle Explorer Stepping
  const handleStepPrev = () => {
    if (explorerStep > 0) {
      setExplorerStep((s) => s - 1);
      soundService.playMove();
    }
  };

  const handleStepNext = () => {
    if (explorerStep < opening.moves.length) {
      setExplorerStep((s) => s + 1);
      soundService.playMove();
    }
  };

  // Start / Reset Training
  const initTraining = () => {
    const g = new Chess();
    setTrainGame(g);
    setTrainStep(0);
    setTrainLastMove(null);
    setTrainFeedback('neutral');
    setTrainMistakeCount(0);
    setTrainCompleted(false);

    // If training Black side, computer plays move 1 (White)
    if (opening.side === 'b' && opening.moves.length > 0) {
      setTimeout(() => {
        const res = g.move(opening.moves[0]);
        if (res) {
          setTrainLastMove({ from: res.from, to: res.to });
          setTrainStep(1);
          soundService.playMove();
        }
      }, 400);
    }
  };

  useEffect(() => {
    if (activeTab === 'train') {
      initTraining();
    }
  }, [activeTab]);

  // Handle User Move in Trainer
  const handleTrainMove = (moveData: { from: string; to: string; promotion?: string; san?: string }) => {
    const expectedSan = opening.moves[trainStep];
    const expectedUci = `${moveData.from}${moveData.to}`;

    const isCorrect = moveData.san === expectedSan || expectedUci === expectedSan || moveData.san?.startsWith(expectedSan);

    if (isCorrect) {
      soundService.playVictory();
      setTrainFeedback('success');
      setTrainLastMove({ from: moveData.from, to: moveData.to });

      const nextStep = trainStep + 1;
      setTrainStep(nextStep);

      // Did user finish the line?
      if (nextStep >= opening.moves.length) {
        setTrainCompleted(true);
        onCompletePractice?.(opening.id, trainMistakeCount === 0);
        return;
      }

      // Computer plays next opponent move
      setTimeout(() => {
        const oppSan = opening.moves[nextStep];
        if (oppSan) {
          const res = trainGame.move(oppSan);
          if (res) {
            setTrainLastMove({ from: res.from, to: res.to });
            setTrainStep(nextStep + 1);
            soundService.playMove();

            if (nextStep + 1 >= opening.moves.length) {
              setTrainCompleted(true);
              onCompletePractice?.(opening.id, trainMistakeCount === 0);
            }
          }
        }
      }, 500);
    } else {
      soundService.playIllegal();
      setTrainFeedback('mistake');
      setTrainMistakeCount((m) => m + 1);

      // Revert user move
      setTimeout(() => {
        trainGame.undo();
        setTrainFeedback('neutral');
      }, 600);
    }
  };

  const isUserTurnInTrain =
    activeTab === 'train' &&
    !trainCompleted &&
    ((opening.side === 'w' && trainGame.turn() === 'w') || (opening.side === 'b' && trainGame.turn() === 'b'));

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-3 py-2 space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between w-full max-w-[520px]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Library</span>
        </button>

        {/* Tab Switcher */}
        <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab('explore')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'explore' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Explore Line
          </button>
          <button
            onClick={() => setActiveTab('train')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'train' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Train Line (SRS)
          </button>
        </div>
      </div>

      {/* Opening Info Card */}
      <div className="w-full max-w-[520px] bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-amber-400 font-mono">{opening.eco}</span>
              <span className="text-[10px] text-slate-400 font-medium">{opening.family}</span>
            </div>
            <h2 className="text-base font-bold text-slate-100 mt-0.5">{opening.name}</h2>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-700 bg-slate-800 text-slate-300">
            {opening.difficulty}
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">{opening.mainIdea}</p>
      </div>

      {/* Board */}
      <div className="w-full">
        <ChessBoard
          game={activeTab === 'explore' ? explorerGame : trainGame}
          orientation={opening.side}
          theme={settings.boardTheme}
          showCoordinates={settings.showCoordinates}
          disabled={activeTab === 'explore' || !isUserTurnInTrain}
          lastMove={activeTab === 'explore' ? explorerLastMove : trainLastMove}
          onMove={handleTrainMove}
        />
      </div>

      {/* Mode Controls */}
      <div className="w-full max-w-[520px]">
        {activeTab === 'explore' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <button
              onClick={handleStepPrev}
              disabled={explorerStep === 0}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors"
              title="Previous Move"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <span className="text-xs font-mono font-bold text-amber-400">
                Move {explorerStep} of {opening.moves.length}
              </span>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-[200px]">
                {opening.moves.slice(0, explorerStep).join(' ') || 'Starting Position'}
              </div>
            </div>

            <button
              onClick={handleStepNext}
              disabled={explorerStep >= opening.moves.length}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors"
              title="Next Move"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Trainer Controls */
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                Playing as {opening.side === 'w' ? 'White' : 'Black'}
              </span>
              <span className="text-slate-400 font-mono">
                Step {trainStep}/{opening.moves.length}
              </span>
            </div>

            {trainCompleted ? (
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-center space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Line Mastered from Memory!</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  {trainMistakeCount === 0
                    ? 'Flawless recall! Spaced repetition scheduled for next review.'
                    : `Completed with ${trainMistakeCount} mistake(s). Keep drilling to reinforce memory.`}
                </p>
                <button
                  onClick={initTraining}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                >
                  Drill Again
                </button>
              </div>
            ) : trainFeedback === 'mistake' ? (
              <div className="p-2 bg-red-500/15 border border-red-500/40 rounded-lg text-xs text-red-300 flex items-center gap-1.5 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Incorrect move for this line. Resetting...</span>
              </div>
            ) : (
              <div className="p-2 bg-slate-950/60 rounded-lg text-xs text-slate-400 flex items-center justify-between">
                <span>Play the next book move from memory</span>
                <button
                  onClick={initTraining}
                  className="p-1 text-slate-500 hover:text-slate-300"
                  title="Restart Line"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tactical Plans & Traps Accordion */}
      {activeTab === 'explore' && (
        <div className="w-full max-w-[520px] space-y-2 pt-1 pb-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs">
            <span className="font-bold text-amber-400 block">Key Strategic Plans</span>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              {opening.typicalPlansWhite.slice(0, 2).map((p, i) => (
                <li key={i}><span className="font-semibold text-slate-200">White:</span> {p}</li>
              ))}
              {opening.typicalPlansBlack.slice(0, 2).map((p, i) => (
                <li key={i}><span className="font-semibold text-slate-200">Black:</span> {p}</li>
              ))}
            </ul>
          </div>

          {opening.commonTraps.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
              <span className="font-bold text-red-400 block">Watch Out: Common Traps</span>
              <p className="text-slate-300">{opening.commonTraps[0]}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
