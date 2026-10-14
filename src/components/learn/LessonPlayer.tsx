import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Lesson, LessonStep } from '../../types/curriculum';
import { AppSettings } from '../../types/chess';
import { ChessBoard } from '../board/ChessBoard';
import { soundService } from '../../services/audioService';
import { speechService } from '../../services/speechService';
import {
  ArrowLeft,
  Volume2,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  Eye,
  RotateCcw,
} from 'lucide-react';

interface LessonPlayerProps {
  lesson: Lesson;
  settings: AppSettings;
  onBack: () => void;
  onComplete: (lessonId: string) => void;
}

export const LessonPlayer: React.FC<LessonPlayerProps> = ({
  lesson,
  settings,
  onBack,
  onComplete,
}) => {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const step: LessonStep = lesson.steps[currentStepIdx] || lesson.steps[0];

  const [game, setGame] = useState<Chess>(() => new Chess(step.fen));
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2>(0); // 0=none, 1=hint, 2=solution
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Reset board on step change
  useEffect(() => {
    speechService.stop();
    setGame(new Chess(step.fen));
    setLastMove(null);
    setIsSuccess(false);
    setHintLevel(0);
  }, [step.fen]);

  const handleSpeak = async () => {
    speechService.unlock();
    if (isSpeaking) {
      speechService.stop('Lesson speech cancelled by user');
      setIsSpeaking(false);
      return;
    }

    const textToRead = `${lesson.title}. ${step.instruction}. ${step.explanation}`;
    setIsSpeaking(true);
    await speechService.speakWithCoach(textToRead, settings, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  const handleMove = (moveData: { from: string; to: string; promotion?: string; san?: string }) => {
    // Stop speech if speaking
    speechService.stop();
    setIsSpeaking(false);

    setLastMove({ from: moveData.from, to: moveData.to });

    // Check if move matches expectedMoves
    const playedSan = moveData.san || '';
    const playedUci = `${moveData.from}${moveData.to}`;

    const isMatch = step.expectedMoves.some(
      (m) => m === playedSan || m === playedUci || playedSan.startsWith(m)
    );

    if (isMatch) {
      soundService.playVictory();
      setIsSuccess(true);
    } else {
      soundService.playIllegal();
      // Reset board after slight delay
      setTimeout(() => {
        setGame(new Chess(step.fen));
        setLastMove(null);
      }, 700);
    }
  };

  const handleNextStep = () => {
    if (currentStepIdx + 1 < lesson.steps.length) {
      setCurrentStepIdx((idx) => idx + 1);
    } else {
      onComplete(lesson.id);
    }
  };

  const handleShowSolution = () => {
    const sol = step.expectedMoves[0];
    if (!sol) return;

    try {
      const g = new Chess(step.fen);
      const res = g.move(sol);
      if (res) {
        setGame(g);
        setLastMove({ from: res.from, to: res.to });
        setIsSuccess(true);
        soundService.playMove();
      }
    } catch {
      // Ignored
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-3 py-2 space-y-3">
      {/* Top Navigation */}
      <div className="flex items-center justify-between w-full max-w-[520px]">
        <button
          onClick={() => {
            speechService.stop();
            onBack();
          }}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Curriculum</span>
        </button>

        <span className="text-xs text-slate-400 font-medium">
          Step {currentStepIdx + 1} of {lesson.steps.length}
        </span>
      </div>

      {/* Lesson Header Card */}
      <div className="w-full max-w-[520px] bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-100">{lesson.title}</h2>
            <p className="text-xs text-amber-400/90 font-medium mt-0.5">{lesson.subtitle}</p>
          </div>
          <button
            onClick={handleSpeak}
            className={`p-2 rounded-xl border transition-colors ${
              isSpeaking
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Read with Voice Coach"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed pt-1">{step.instruction}</p>
      </div>

      {/* Interactive Chess Board */}
      <div className="w-full">
        <ChessBoard
          game={game}
          orientation={step.playerColor}
          theme={settings.boardTheme}
          showCoordinates={settings.showCoordinates}
          disabled={isSuccess}
          lastMove={lastMove}
          onMove={handleMove}
        />
      </div>

      {/* Feedback & Actions Strip */}
      <div className="w-full max-w-[520px] space-y-2">
        {isSuccess ? (
          <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl space-y-2.5 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Correct Move!</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">{step.explanation}</p>
            <button
              onClick={handleNextStep}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>{currentStepIdx + 1 < lesson.steps.length ? 'Next Step' : 'Finish Lesson'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHintLevel((h) => (h === 0 ? 1 : 2))}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>{hintLevel === 0 ? 'Hint' : hintLevel === 1 ? 'Show Solution' : 'Hint'}</span>
              </button>

              {hintLevel >= 2 && (
                <button
                  onClick={handleShowSolution}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-300 rounded-xl text-xs font-medium border border-amber-500/40 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Play Move</span>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setGame(new Chess(step.fen));
                setLastMove(null);
                soundService.playMove();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              title="Reset Position"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {hintLevel >= 1 && !isSuccess && (
          <div className="p-2.5 bg-slate-900/80 border border-amber-500/30 rounded-xl text-xs text-slate-300 animate-in fade-in duration-150">
            <span className="font-semibold text-amber-400">Hint: </span>
            {step.hint}
          </div>
        )}
      </div>
    </div>
  );
};
