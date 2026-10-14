import React, { useState } from 'react';
import { QuizQuestion } from '../../types/curriculum';
import { soundService } from '../../services/audioService';
import { Trophy, CheckCircle2, XCircle, ArrowRight, RotateCcw, X } from 'lucide-react';

interface QuizModalProps {
  levelTitle: string;
  levelId: number;
  questions: QuizQuestion[];
  isOpen: boolean;
  onClose: () => void;
  onPass: (levelId: number) => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({
  levelTitle,
  levelId,
  questions,
  isOpen,
  onClose,
  onPass,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  if (!isOpen || questions.length === 0) return null;

  const currentQ = questions[currentIndex];

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);

    if (idx === currentQ.correctIndex) {
      soundService.playVictory();
      setScore((s) => s + 1);
    } else {
      soundService.playIllegal();
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
      const passed = (score + (selectedOption === currentQ.correctIndex ? 0 : 0)) >= Math.ceil(questions.length * 0.7);
      if (passed) {
        onPass(levelId);
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setIsFinished(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
              Level {levelId} Mastery Quiz
            </span>
            <h3 className="text-base font-bold text-slate-100">{levelTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isFinished ? (
          <>
            {/* Progress counter */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Question {currentIndex + 1} of {questions.length}</span>
              <span className="font-mono text-amber-300 font-semibold">Score: {score}</span>
            </div>

            {/* Question Text */}
            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <p className="text-sm font-semibold text-slate-100 leading-snug">
                {currentQ.question}
              </p>
            </div>

            {/* Options */}
            <div className="space-y-2">
              {currentQ.options.map((option, idx) => {
                let btnStyle = 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700';

                if (isAnswered) {
                  if (idx === currentQ.correctIndex) {
                    btnStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-medium';
                  } else if (idx === selectedOption) {
                    btnStyle = 'bg-red-500/20 border-red-500 text-red-300';
                  } else {
                    btnStyle = 'opacity-40 border-slate-800 text-slate-500';
                  }
                }

                return (
                  <button
                    key={idx}
                    disabled={isAnswered}
                    onClick={() => handleSelectOption(idx)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex items-center justify-between ${btnStyle}`}
                  >
                    <span>{option}</span>
                    {isAnswered && idx === currentQ.correctIndex && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    {isAnswered && idx === selectedOption && idx !== currentQ.correctIndex && (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation & Next */}
            {isAnswered && (
              <div className="space-y-3 animate-in fade-in duration-150 pt-1">
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <span className="font-semibold text-amber-400">Explanation: </span>
                  {currentQ.explanation}
                </div>

                <button
                  onClick={handleNext}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-amber-500/10"
                >
                  <span>{currentIndex + 1 < questions.length ? 'Next Question' : 'View Results'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          /* Finished Screen */
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
              <Trophy className="w-7 h-7" />
            </div>

            <div>
              <h4 className="text-lg font-bold text-slate-100">
                {score >= Math.ceil(questions.length * 0.7) ? 'Level Passed!' : 'Nice Attempt!'}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                You answered {score} out of {questions.length} questions correctly.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleRestart}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Quiz</span>
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
