import React from 'react';
import { PieceColor, PieceType } from '../../types/chess';
import { PieceIcon } from './PieceIcon';

interface CapturedPiecesProps {
  whiteCaptures: PieceType[]; // Pieces captured by White (i.e. Black pieces)
  blackCaptures: PieceType[]; // Pieces captured by Black (i.e. White pieces)
  whiteAdvantage: number; // positive if White has more material
}

const PIECE_WEIGHTS: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function sortPieces(pieces: PieceType[]): PieceType[] {
  return [...pieces].sort((a, b) => (PIECE_WEIGHTS[b] || 0) - (PIECE_WEIGHTS[a] || 0));
}

export const CapturedPieces: React.FC<CapturedPiecesProps> = ({
  whiteCaptures,
  blackCaptures,
  whiteAdvantage,
}) => {
  const sortedWhiteCaps = sortPieces(whiteCaptures);
  const sortedBlackCaps = sortPieces(blackCaptures);

  return (
    <div className="flex items-center justify-between w-full max-w-[520px] px-1 text-xs text-slate-400">
      {/* Black's captured pieces (captured by White) */}
      <div className="flex items-center gap-1 min-h-[22px] flex-wrap">
        <div className="flex items-center -space-x-1.5">
          {sortedWhiteCaps.map((pt, idx) => (
            <div key={idx} className="w-4 h-4 sm:w-5 sm:h-5">
              <PieceIcon type={pt} color="b" />
            </div>
          ))}
        </div>
        {whiteAdvantage > 0 && (
          <span className="font-semibold text-amber-400 font-mono text-[11px] ml-1">
            +{whiteAdvantage}
          </span>
        )}
      </div>

      {/* White's captured pieces (captured by Black) */}
      <div className="flex items-center gap-1 min-h-[22px] flex-wrap justify-end">
        {whiteAdvantage < 0 && (
          <span className="font-semibold text-amber-400 font-mono text-[11px] mr-1">
            +{Math.abs(whiteAdvantage)}
          </span>
        )}
        <div className="flex items-center -space-x-1.5">
          {sortedBlackCaps.map((pt, idx) => (
            <div key={idx} className="w-4 h-4 sm:w-5 sm:h-5">
              <PieceIcon type={pt} color="w" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
