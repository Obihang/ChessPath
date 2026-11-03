import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { AppSettings, MoveRecord, PieceColor } from '../types/chess';
import { ChessBoard } from './board/ChessBoard';
import { engineService } from '../services/engineService';
import { generateGameSummary } from '../services/coachService';
import { speak, stopSpeech } from '../utils/voice';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Volume2,
  X,
  Navigation,
  Loader2,
} from 'lucide-react';

export interface ReviewedMove extends MoveRecord {
  evalCp?: number | null;
  bestMoveUci?: string;
  classification?: 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
}

export interface PostGameReviewProps {
  moves: ReviewedMove[];
  playerColor?: PieceColor;
  resultText?: string;
  settings: AppSettings;
  onClose: () => void;
}

export const PostGameReview: React.FC<PostGameReviewProps> = ({
  moves,
  playerColor = 'w',
  resultText = 'Game Completed',
  settings,
  onClose,
}) => {
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(moves.length > 0 ? 0 : -1);
  const [reviewedMoves, setReviewedMoves] = useState<ReviewedMove[]>(moves);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  // Evaluate moves with Stockfish in the background if bestMoveUci is not yet populated
  useEffect(() => {
    let cancelled = false;

    async function evaluateMoveHistory() {
      if (moves.length === 0) return;
      setIsEvaluating(true);
      const updated: ReviewedMove[] = [...moves];

      let prevEval = 20;
      for (let i = 0; i < updated.length; i++) {
        if (cancelled) return;
        if (updated[i].bestMoveUci) continue;

        const prevFen = i > 0 ? updated[i - 1].fen : new Chess().fen();
        try {
          const preRes = await engineService.evaluate(prevFen, 150);
          const postRes = await engineService.evaluate(updated[i].fen, 150);
          if (cancelled) return;

          const bestMoveUci = preRes.bestMove || '';
          const currentEval = postRes.score !== null ? -postRes.score : prevEval;
          const playedUci = `${updated[i].from}${updated[i].to}${updated[i].promotion || ''}`;
          const cpLoss = Math.max(0, prevEval - currentEval);

          let classification: ReviewedMove['classification'] = 'good';
          if (bestMoveUci && playedUci === bestMoveUci) {
            classification = 'best';
          } else if (cpLoss > 250) {
            classification = 'blunder';
          } else if (cpLoss > 100) {
            classification = 'mistake';
          } else if (cpLoss > 50) {
            classification = 'inaccuracy';
          }

          updated[i] = {
            ...updated[i],
            bestMoveUci,
            evalCp: currentEval,
            classification,
          };
          prevEval = -currentEval;
          setReviewedMoves([...updated]);
        } catch {
          // Continue if engine evaluation times out on a move
        }
      }
      if (!cancelled) {
        setIsEvaluating(false);
      }
    }

    evaluateMoveHistory();
    return () => {
      cancelled = true;
    };
  }, [moves]);

  const currentMove = currentMoveIndex >= 0 && currentMoveIndex < reviewedMoves.length
    ? reviewedMoves[currentMoveIndex]
    : null;

  const displayFen = currentMove ? currentMove.fen : new Chess().fen();
  const displayGame = new Chess(displayFen);

  // Compute Best Move SAN and Green Arrow from the position BEFORE currentMove was played
  let bestMoveSan: string | null = null;
  let bestMoveArrow: { from: string; to: string; color?: string } | null = null;

  if (currentMove && currentMove.bestMoveUci && currentMove.bestMoveUci.length >= 4) {
    const bestMoveUci = currentMove.bestMoveUci;
    const prevFen = currentMoveIndex > 0 ? reviewedMoves[currentMoveIndex - 1].fen : new Chess().fen();
    try {
      const tempGame = new Chess(prevFen);
      const fromSq = bestMoveUci.substring(0, 2);
      const toSq = bestMoveUci.substring(2, 4);
      const promo = bestMoveUci.length > 4 ? bestMoveUci.substring(4, 5) : 'q';
      const moveObj = tempGame.move({
        from: fromSq,
        to: toSq,
        promotion: promo,
      });
      if (moveObj) {
        bestMoveSan = moveObj.san;
        bestMoveArrow = {
          from: fromSq,
          to: toSq,
          color: '#10b981', // Green arrow for Stockfish best move
        };
      }
    } catch {
      // Ignore invalid UCI
    }
  }

  const handleRequestAiSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      const sanList = reviewedMoves.map((m) => m.san);
      const blunders = reviewedMoves.filter((m) => m.classification === 'blunder').length;
      const mistakes = reviewedMoves.filter((m) => m.classification === 'mistake').length;
      const inaccuracies = reviewedMoves.filter((m) => m.classification === 'inaccuracy').length;
      const summary = await generateGameSummary(sanList, resultText, blunders, mistakes, inaccuracies);
      setAiSummary(summary);
      if (settings.voiceEnabled) {
        speak(summary, false, {
          ttsEngine: settings.ttsEngine,
          edgeVoice: settings.edgeVoice,
          rate: settings.voiceRate,
          volume: settings.voiceVolume,
        });
      }
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-emerald-400" />
              <span>Post-Game Engine Review</span>
            </h3>
            <p className="text-xs text-slate-400">
              {isEvaluating ? 'Analyzing moves with Stockfish...' : resultText}
            </p>
          </div>
          <button
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Board with Green Best Move Arrow */}
        <div className="w-full">
          <ChessBoard
            game={displayGame}
            orientation={playerColor}
            theme={settings.boardTheme}
            showCoordinates={settings.showCoordinates}
            disabled={true}
            lastMove={currentMove ? { from: currentMove.from, to: currentMove.to } : null}
            customArrow={bestMoveArrow}
          />
        </div>

        {/* Move Info & Best Move Pill */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
          <div>
            {currentMove ? (
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-200">
                  Move {Math.floor(currentMoveIndex / 2) + 1}
                  {currentMove.color === 'w' ? '.' : '...'}{' '}
                  <span className="text-amber-400">{currentMove.san}</span>
                </span>
                {currentMove.classification && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      currentMove.classification === 'best'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : currentMove.classification === 'blunder'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : currentMove.classification === 'mistake'
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                        : currentMove.classification === 'inaccuracy'
                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    }`}
                  >
                    {currentMove.classification}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400">Starting Position</span>
            )}
          </div>

          {bestMoveSan && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Best: {bestMoveSan}</span>
            </div>
          )}
        </div>

        {/* Step Controls */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentMoveIndex(-1)}
            disabled={currentMoveIndex <= -1}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="Start"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentMoveIndex((i) => Math.max(-1, i - 1))}
            disabled={currentMoveIndex <= -1}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="Previous Move"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-400 px-3">
            {currentMoveIndex + 1} / {reviewedMoves.length}
          </span>
          <button
            onClick={() => setCurrentMoveIndex((i) => Math.min(reviewedMoves.length - 1, i + 1))}
            disabled={currentMoveIndex >= reviewedMoves.length - 1}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="Next Move"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentMoveIndex(reviewedMoves.length - 1)}
            disabled={currentMoveIndex >= reviewedMoves.length - 1}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            title="End"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>

        {/* AI Coach Summary */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          {!aiSummary ? (
            <button
              onClick={handleRequestAiSummary}
              disabled={isGeneratingSummary}
              className="w-full py-2 px-3 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              {isGeneratingSummary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating Coach Summary...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate AI Coach Game Summary</span>
                </>
              )}
            </button>
          ) : (
            <div className="p-3 bg-slate-950/80 border border-amber-500/30 rounded-xl text-xs text-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Coach Post-Game Summary</span>
                </span>
                <button
                  onClick={() =>
                    speak(aiSummary, true, {
                      ttsEngine: settings.ttsEngine,
                      edgeVoice: settings.edgeVoice,
                      rate: settings.voiceRate,
                      volume: settings.voiceVolume,
                    })
                  }
                  className="p-1 text-slate-400 hover:text-amber-300"
                  title="Read aloud"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="leading-relaxed">{aiSummary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostGameReview;
