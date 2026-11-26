import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Chess, Move, Square as ChessSquare } from 'chess.js';
import { BoardThemeId, PieceColor, PieceType } from '../../types/chess';
import { PieceIcon } from './PieceIcon';
import { soundService } from '../../services/audioService';
import { storageService } from '../../services/storageService';

export interface ChessBoardProps {
  game: Chess;
  orientation?: PieceColor;
  theme?: BoardThemeId;
  showCoordinates?: boolean;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | null;
  customArrow?: { from: string; to: string; color?: string } | null;
  onMove?: (move: {
    from: string;
    to: string;
    promotion?: string;
    san?: string;
    before?: string;
    after?: string;
  }) => void;
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
  blue: {
    light: '#dee3e6',
    dark: '#8ca2ad',
    selected: 'rgba(56, 189, 248, 0.45)',
    lastMove: 'rgba(56, 189, 248, 0.25)',
    check: 'rgba(239, 68, 68, 0.65)',
  },
  iceland: {
    light: '#e2e8f0',
    dark: '#64748b',
    selected: 'rgba(56, 189, 248, 0.45)',
    lastMove: 'rgba(56, 189, 248, 0.25)',
    check: 'rgba(239, 68, 68, 0.65)',
  },
  glass: {
    light: '#cbd5e1',
    dark: '#475569',
    selected: 'rgba(245, 158, 11, 0.45)',
    lastMove: 'rgba(217, 119, 6, 0.28)',
    check: 'rgba(239, 68, 68, 0.65)',
  },
  dark: {
    light: '#94a3b8',
    dark: '#334155',
    selected: 'rgba(245, 158, 11, 0.45)',
    lastMove: 'rgba(217, 119, 6, 0.28)',
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
  customArrow = null,
  onMove,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);

  // Unified pointer drag state (supports both desktop mouse & mobile touch)
  const [dragInfo, setDragInfo] = useState<{
    fromSq: string;
    piece: { type: PieceType; color: PieceColor };
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const appSettings = storageService.getSettings();
  const pieceSet = appSettings.pieceSet;
  const pieceShadow = appSettings.pieceShadow;

  const colors = BOARD_THEMES[theme] || BOARD_THEMES.walnut;
  const isFlipped = orientation === 'b';
  const displayFiles = isFlipped ? [...FILES].reverse() : FILES;
  const displayRanks = isFlipped ? [...RANKS].reverse() : RANKS;

  // Clear selection if turn changed or board disabled
  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
    setDragInfo(null);
    setHoveredSquare(null);
  }, [game.fen(), disabled]);

  const getSquareFromPoint = useCallback(
    (clientX: number, clientY: number): string | null => {
      const el = boardRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return null;
      }
      const col = Math.min(7, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * 8)));
      const row = Math.min(7, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * 8)));
      return `${displayFiles[col]}${displayRanks[row]}`;
    },
    [displayFiles, displayRanks]
  );

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
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
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
        onMove?.({
          from,
          to,
          promotion,
          san: move.san,
          before: move.before,
          after: move.after,
        });
      }
    } catch {
      soundService.playIllegal();
    }
  };

  const handlePromotionSelect = (pieceType: PieceType) => {
    if (!pendingPromotion) return;
    executeMove(pendingPromotion.from, pendingPromotion.to, pieceType);
  };

  const handlePointerDown = (e: React.PointerEvent, sq: string) => {
    if (disabled || pendingPromotion || e.button > 0) return;
    const piece = game.get(sq as ChessSquare);
    if (!piece || piece.color !== game.turn()) return;

    setDragInfo({
      fromSq: sq,
      piece: { type: piece.type, color: piece.color },
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging: false,
    });
  };

  useEffect(() => {
    if (!dragInfo) return;

    const handlePointerMove = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - dragInfo.startX, e.clientY - dragInfo.startY);
      const nowDragging = dragInfo.isDragging || dist > 5;

      if (nowDragging && !dragInfo.isDragging) {
        // Transitioned into active drag: highlight origin square & show legal moves
        setSelectedSquare(dragInfo.fromSq);
        const moves = game.moves({ square: dragInfo.fromSq as ChessSquare, verbose: true });
        setLegalMoves(moves);
      }

      if (nowDragging) {
        setHoveredSquare(getSquareFromPoint(e.clientX, e.clientY));
      }

      setDragInfo((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              isDragging: nowDragging,
            }
          : null
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (dragInfo.isDragging) {
        suppressNextClickRef.current = true;
        setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 60);

        const targetSq = getSquareFromPoint(e.clientX, e.clientY);
        if (targetSq && targetSq !== dragInfo.fromSq) {
          const moves = game.moves({ square: dragInfo.fromSq as ChessSquare, verbose: true });
          const matchingMove = moves.find((m) => m.to === targetSq);
          if (matchingMove) {
            const movingPiece = game.get(dragInfo.fromSq as ChessSquare);
            const isPromotion =
              movingPiece &&
              movingPiece.type === 'p' &&
              ((movingPiece.color === 'w' && targetSq.endsWith('8')) ||
                (movingPiece.color === 'b' && targetSq.endsWith('1')));

            if (isPromotion) {
              setPendingPromotion({ from: dragInfo.fromSq, to: targetSq });
            } else {
              executeMove(dragInfo.fromSq, targetSq);
            }
          }
        }
      }

      setDragInfo(null);
      setHoveredSquare(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragInfo, game, getSquareFromPoint]);

  return (
    <div className="relative w-full max-w-[min(92vw,calc(100dvh-250px),480px)] aspect-square mx-auto select-none touch-manipulation">
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
              const isDragOrigin = !!(dragInfo?.isDragging && dragInfo.fromSq === squareName);
              const isDragHover = !!(dragInfo?.isDragging && hoveredSquare === squareName && legalMove);

              const squareBg = isDark ? colors.dark : colors.light;

              return (
                <div
                  key={squareName}
                  onClick={() => handleSquareClick(squareName)}
                  onPointerDown={(e) => handlePointerDown(e, squareName)}
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

                  {/* Drag Target Hover Ring */}
                  {isDragHover && (
                    <div className="absolute inset-0 pointer-events-none ring-[3px] ring-inset ring-white/80 z-20" />
                  )}

                  {/* Radial King Check Glow */}
                  {isCheckKing && (
                    <div
                      className="absolute inset-0 pointer-events-none animate-pulse"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.55) 45%, transparent 78%)',
                      }}
                    />
                  )}

                  {/* Piece Graphic */}
                  {piece && (
                    <div
                      className={`relative z-10 w-full h-full p-1 sm:p-1.5 flex items-center justify-center transition-transform duration-100 ${
                        isDragOrigin ? 'opacity-25 scale-95' : isSelected ? 'scale-105' : 'hover:scale-[1.02]'
                      } ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
                    >
                      <PieceIcon
                        type={piece.type}
                        color={piece.color}
                        pieceSet={pieceSet}
                        pieceShadow={pieceShadow}
                      />
                    </div>
                  )}

                  {/* Legal Move Indicators */}
                  {legalMove && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                      {isCapture ? (
                        <div className="w-[84%] h-[84%] rounded-full border-4 sm:border-[5px] border-black/25 dark:border-white/35" />
                      ) : (
                        <div className="w-3 sm:w-3.5 h-3 sm:h-3.5 rounded-full bg-black/22 dark:bg-white/30 shadow-xs" />
                      )}
                    </div>
                  )}

                  {/* Coordinate Labels (Theme-Matched Contrast) */}
                  {showCoordinates && (
                    <>
                      {fIdx === 0 && (
                        <span
                          className="absolute top-0.5 left-1 text-[10px] sm:text-xs font-bold leading-none pointer-events-none opacity-80"
                          style={{ color: isDark ? colors.light : colors.dark }}
                        >
                          {rank}
                        </span>
                      )}
                      {rIdx === 7 && (
                        <span
                          className="absolute bottom-0.5 right-1 text-[10px] sm:text-xs font-bold leading-none pointer-events-none opacity-80"
                          style={{ color: isDark ? colors.light : colors.dark }}
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
          {/* Custom Arrow Overlay */}
          {customArrow && customArrow.from && customArrow.to && (() => {
            const fCol = FILES.indexOf(customArrow.from[0]);
            const fRow = 8 - parseInt(customArrow.from[1], 10);
            const tCol = FILES.indexOf(customArrow.to[0]);
            const tRow = 8 - parseInt(customArrow.to[1], 10);

            if (fCol < 0 || fRow < 0 || tCol < 0 || tRow < 0) return null;

            const x1 = (isFlipped ? 7 - fCol + 0.5 : fCol + 0.5) * 12.5;
            const y1 = (isFlipped ? 7 - fRow + 0.5 : fRow + 0.5) * 12.5;
            const x2 = (isFlipped ? 7 - tCol + 0.5 : tCol + 0.5) * 12.5;
            const y2 = (isFlipped ? 7 - tRow + 0.5 : tRow + 0.5) * 12.5;

            const arrowColor = customArrow.color || '#f59e0b';

            return (
              <svg className="absolute inset-0 z-30 w-full h-full pointer-events-none" viewBox="0 0 100 100">
                <defs>
                  <marker
                    id="arrowhead-coach"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill={arrowColor} />
                  </marker>
                </defs>
                <line
                  x1={`${x1}%`}
                  y1={`${y1}%`}
                  x2={`${x2}%`}
                  y2={`${y2}%`}
                  stroke={arrowColor}
                  strokeWidth="3.2"
                  strokeOpacity="0.88"
                  strokeLinecap="round"
                  markerEnd="url(#arrowhead-coach)"
                />
              </svg>
            );
          })()}
        </div>
      </div>

      {/* Floating Dragged Piece Ghost */}
      {dragInfo?.isDragging && boardRef.current && (() => {
        const squareSize = boardRef.current.getBoundingClientRect().width / 8;
        return (
          <div
            className="fixed z-50 pointer-events-none select-none flex items-center justify-center scale-115 drop-shadow-[0_12px_18px_rgba(0,0,0,0.55)]"
            style={{
              width: squareSize,
              height: squareSize,
              left: dragInfo.currentX - squareSize / 2,
              top: dragInfo.currentY - squareSize / 2,
            }}
          >
            <PieceIcon
              type={dragInfo.piece.type}
              color={dragInfo.piece.color}
              pieceSet={pieceSet}
              pieceShadow={false}
            />
          </div>
        );
      })()}

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
                    <PieceIcon
                      type={pType}
                      color={game.turn()}
                      pieceSet={pieceSet}
                      pieceShadow={pieceShadow}
                    />
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
