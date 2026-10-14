import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Chess, Move, Square as ChessSquare } from 'chess.js';
import { BoardThemeId, PieceColor, PieceType, AppSettings } from '../../types/chess';
import { PieceIcon } from './PieceIcon';
import { soundService } from '../../services/audioService';
import { LiveCommentaryCard } from './LiveCommentaryCard';
import { geminiService } from '../../services/geminiService';
import { engineService } from '../../services/engineService';

export interface ChessBoardProps {
  game: Chess;
  orientation?: PieceColor;
  theme?: BoardThemeId;
  showCoordinates?: boolean;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | null;
  onMove?: (move: { from: string; to: string; promotion?: string; san?: string }) => void;
  settings: AppSettings;
}

const BOARD_THEMES: Record<
  BoardThemeId,
  {
    light: string;
    dark: string;
    selected: string;
    lastMove: string;
    check: string;
  }
> = {
  walnut: {
    light: '#f0d9b5',
    dark: '#b58863',
    selected: 'rgba(245, 158, 11, 0.45)',
    lastMove: 'rgba(217, 119, 6, 0.28)',
    check: 'rgba(239, 68, 68, 0.65)',
  },
  green: {
    light: '#eeeed2',
    dark: '#769656',
    selected: 'rgba(186, 202, 68, 0.55)',
    lastMove: 'rgba(186, 202, 68, 0.35)',
    check: 'rgba(239, 68, 68, 0.65)',
  },
  slate: {
    light: '#c3cdd7',
    dark: '#4a6886',
    selected: 'rgba(56, 189, 248, 0.45)',
    lastMove: 'rgba(56, 189, 248, 0.25)',
    check: 'rgba(239, 68, 68, 0.65)',
  },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export const ChessBoard: React.FC<ChessBoardProps> = ({
  game,
  orientation = 'w',
  theme = 'walnut',
  showCoordinates = true,
  disabled = false,
  lastMove = null,
  onMove,
  settings,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [isCommentaryMuted, setIsCommentaryMuted] = useState(false);
  const lastFenRef = useRef(game.fen());

  // Drag state
  const [draggingSquare, setDraggingSquare] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const colors = BOARD_THEMES[theme] || BOARD_THEMES.walnut;
  const isFlipped = orientation === 'b';
  const displayFiles = isFlipped ? [...FILES].reverse() : FILES;
  const displayRanks = isFlipped ? [...RANKS].reverse() : RANKS;

  // Clear selection if turn changed or board disabled
  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
  }, [game.fen(), disabled]);

  // Commentary Logic
  useEffect(() => {
    const handleMove = async () => {
      const fen = game.fen();
      if (fen === lastFenRef.current) return;
      lastFenRef.current = fen;

      if (!settings.pieceSet) return; // Commentary enabled if pieceSet is chosen (hack for toggle)

      const { score, bestMove } = await engineService.evaluate(fen);
      
      try {
        const comment = await geminiService.chat(
            [{role: 'user', parts: [{text: `FEN: ${fen}, Eval: ${score}`}]}],
            'Act as a chess coach commentary mode.'
        );
        setCommentary(comment);
      } catch (e) {
        setCommentary(`Engine best move: ${bestMove}. Eval: ${score}`);
      }
    };
    handleMove();
  }, [game.fen(), settings.pieceSet]);

  const inCheck = game.inCheck();
  let checkSquare: string | null = null;
  if (inCheck) {
    const turn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === turn) {
          checkSquare = `${FILES[c]}${8 - r}`;
          break;
        }
      }
    }
  }

  const handleSquareClick = useCallback(
    (sq: string) => {
      if (disabled || pendingPromotion) return;

      const piece = game.get(sq as ChessSquare);

      if (selectedSquare) {
        if (selectedSquare === sq) {
          setSelectedSquare(null);
          setLegalMoves([]);
          return;
        }

        const matchingMove = legalMoves.find((m) => m.to === sq);
        if (matchingMove) {
          const movingPiece = game.get(selectedSquare as ChessSquare);
          const isPromotion =
            movingPiece &&
            movingPiece.type === 'p' &&
            ((movingPiece.color === 'w' && sq.endsWith('8')) || (movingPiece.color === 'b' && sq.endsWith('1')));

          if (isPromotion) {
            setPendingPromotion({ from: selectedSquare, to: sq });
            return;
          }

          executeMove(selectedSquare, sq);
          return;
        }

        if (piece && piece.color === game.turn()) {
          setSelectedSquare(sq);
          const moves = game.moves({ square: sq as ChessSquare, verbose: true });
          setLegalMoves(moves);
          return;
        }

        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      if (piece && piece.color === game.turn()) {
        setSelectedSquare(sq);
        const moves = game.moves({ square: sq as ChessSquare, verbose: true });
        setLegalMoves(moves);
      }
    },
    [disabled, pendingPromotion, selectedSquare, legalMoves, game]
  );

  const executeMove = (from: string, to: string, promotion: string = 'q') => {
    try {
      const move = game.move({ from, to, promotion });
      if (move) {
        if (move.captured) {
          soundService.playCapture();
        } else {
          soundService.playMove();
        }

        if (game.inCheck()) {
          soundService.playCheck();
        }

        setSelectedSquare(null);
        setLegalMoves([]);
        setPendingPromotion(null);
        onMove?.({ from, to, promotion, san: move.san });
      }
    } catch {
      soundService.playIllegal();
    }
  };

  const handlePromotionSelect = (pieceType: PieceType) => {
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.from, pendingPromotion.to, pieceType);
  };

  const handleDragStart = (e: React.DragEvent, sq: string) => {
    if (disabled) return;
    const piece = game.get(sq as ChessSquare);
    if (!piece || piece.color !== game.turn()) {
      e.preventDefault();
      return;
    }
    setDraggingSquare(sq);
    setSelectedSquare(sq);
    const moves = game.moves({ square: sq as ChessSquare, verbose: true });
    setLegalMoves(moves);
    e.dataTransfer.setData('text/plain', sq);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSq: string) => {
    e.preventDefault();
    const fromSq = draggingSquare || e.dataTransfer.getData('text/plain');
    setDraggingSquare(null);

    if (!fromSq || fromSq === targetSq) return;

    const matchingMove = legalMoves.find((m) => m.to === targetSq);
    if (matchingMove) {
      const movingPiece = game.get(fromSq as ChessSquare);
      const isPromotion =
        movingPiece &&
        movingPiece.type === 'p' &&
        ((movingPiece.color === 'w' && targetSq.endsWith('8')) ||
          (movingPiece.color === 'b' && targetSq.endsWith('1')));

      if (isPromotion) {
        setPendingPromotion({ from: fromSq, to: targetSq });
      } else {
        executeMove(fromSq, targetSq);
      }
    }
  };

  return (
    <div className="relative w-full max-w-[520px] aspect-square mx-auto select-none touch-manipulation">
      <LiveCommentaryCard comment={commentary} isMuted={isCommentaryMuted} onToggleMute={() => setIsCommentaryMuted(!isCommentaryMuted)} />
      {/* Outer wooden border / bezel */}
      <div className="w-full h-full p-2.5 sm:p-3.5 bg-slate-900 border-2 border-slate-800 rounded-2xl shadow-2xl flex flex-col justify-center">
        {/* The 8x8 Grid */}
        <div
          ref={boardRef}
          className="relative grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden shadow-inner border border-black/30"
          style={{ touchAction: 'none' }}
        >
          {displayRanks.map((rank, rIdx) =>
            displayFiles.map((file, fIdx) => {
              const squareName = `${file}${rank}`;
              const isDark = (fIdx + rIdx) % 2 === 1;
              const piece = game.get(squareName as ChessSquare);

              const isSelected = selectedSquare === squareName;
              const isLastMoveSquare =
                lastMove && (lastMove.from === squareName || lastMove.to === squareName);
              const isCheckKing = checkSquare === squareName;
              const legalMove = legalMoves.find((m) => m.to === squareName);
              const isCapture = !!(legalMove && (piece || legalMove.flags.includes('e')));

              let squareBg = isDark ? colors.dark : colors.light;

              return (
                <div
                  key={squareName}
                  onClick={() => handleSquareClick(squareName)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, squareName)}
                  className="relative flex items-center justify-center cursor-pointer transition-colors"
                  style={{ backgroundColor: squareBg }}
                >
                  {/* Last Move Overlay */}
                  {isLastMoveSquare && (
                    <div
                      className="absolute inset-0 pointer-events-none transition-opacity"
                      style={{ backgroundColor: colors.lastMove }}
                    />
                  )}

                  {/* Selected Square Overlay */}
                  {isSelected && (
                    <div
                      className="absolute inset-0 pointer-events-none ring-2 ring-inset ring-amber-400/90"
                      style={{ backgroundColor: colors.selected }}
                    />
                  )}

                  {/* King Check Red Glow */}
                  {isCheckKing && (
                    <div
                      className="absolute inset-0 pointer-events-none animate-pulse"
                      style={{ backgroundColor: colors.check }}
                    />
                  )}

                  {/* Piece Graphic */}
                  {piece && (
                    <div
                      draggable={!disabled && piece.color === game.turn()}
                      onDragStart={(e) => handleDragStart(e, squareName)}
                      className={`relative z-10 w-full h-full p-1 sm:p-1.5 flex items-center justify-center transition-transform duration-100 ${
                        isSelected ? 'scale-105' : 'hover:scale-[1.02]'
                      } ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                    >
                      <PieceIcon type={piece.type} color={piece.color} />
                    </div>
                  )}

                  {/* Legal Move Indicators */}
                  {legalMove && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                      {isCapture ? (
                        <div className="w-[82%] h-[82%] rounded-full border-4 sm:border-[5px] border-black/25 dark:border-white/35 animate-in fade-in duration-150" />
                      ) : (
                        <div className="w-3 sm:w-4 h-3 sm:h-4 rounded-full bg-black/20 dark:bg-white/30 shadow-xs" />
                      )}
                    </div>
                  )}

                  {/* Coordinate Labels */}
                  {showCoordinates && (
                    <>
                      {fIdx === 0 && (
                        <span
                          className={`absolute top-0.5 left-1 text-[10px] sm:text-xs font-semibold leading-none pointer-events-none ${
                            isDark ? 'text-amber-100/70' : 'text-amber-900/60'
                          }`}
                        >
                          {rank}
                        </span>
                      )}
                      {rIdx === 7 && (
                        <span
                          className={`absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-semibold leading-none pointer-events-none ${
                            isDark ? 'text-amber-100/70' : 'text-amber-900/60'
                          }`}
                        >
                          {file}
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pawn Promotion Modal */}
      {pendingPromotion && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center rounded-2xl p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 shadow-2xl text-center max-w-xs w-full animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Choose Promotion</h3>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map((pType) => (
                <button
                  key={pType}
                  onClick={() => handlePromotionSelect(pType)}
                  className="p-3 bg-slate-800 hover:bg-amber-600/30 active:bg-amber-600/50 border border-slate-700 rounded-lg flex flex-col items-center justify-center transition-all group"
                  title={pType.toUpperCase()}
                >
                  <div className="w-10 h-10 group-hover:scale-110 transition-transform">
                    <PieceIcon type={pType} color={game.turn()} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-400 group-hover:text-amber-300 mt-1 uppercase">
                    {pType === 'q' ? 'Queen' : pType === 'r' ? 'Rook' : pType === 'b' ? 'Bishop' : 'Knight'}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingPromotion(null)}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
