import React, { useState } from 'react';
import { PieceColor, PieceType } from '../../types/chess';
import { getPieceSvgUrl, DEFAULT_PIECE_SET } from '../../config/pieceSets';
import { storageService } from '../../services/storageService';

interface PieceIconProps {
  type: PieceType;
  color: PieceColor;
  className?: string;
  pieceSet?: string;
  pieceShadow?: boolean;
}

export const PieceIcon: React.FC<PieceIconProps> = ({
  type,
  color,
  className = 'w-full h-full flex items-center justify-center',
  pieceSet: propPieceSet,
  pieceShadow: propPieceShadow,
}) => {
  const settings = storageService.getSettings();
  const currentSet = propPieceSet || settings.pieceSet || DEFAULT_PIECE_SET;
  const hasShadow = propPieceShadow !== undefined ? propPieceShadow : (settings.pieceShadow ?? true);

  const [activeSet, setActiveSet] = useState<string>(currentSet);
  const [hasError, setHasError] = useState<boolean>(false);

  const imgUrl = getPieceSvgUrl(activeSet, color, type);
  const fallbackUrl = getPieceSvgUrl(DEFAULT_PIECE_SET, color, type);

  const handleError = () => {
    if (activeSet !== DEFAULT_PIECE_SET && !hasError) {
      setHasError(true);
      setActiveSet(DEFAULT_PIECE_SET);
    }
  };

  const pieceName = `${color === 'w' ? 'White' : 'Black'} ${
    type === 'p' ? 'Pawn' : type === 'n' ? 'Knight' : type === 'b' ? 'Bishop' : type === 'r' ? 'Rook' : type === 'q' ? 'Queen' : 'King'
  }`;

  return (
    <div className={`relative flex items-center justify-center pointer-events-none ${className}`}>
      <img
        src={hasError ? fallbackUrl : imgUrl}
        alt={pieceName}
        draggable={false}
        onError={handleError}
        className={`w-[90%] h-[90%] object-contain select-none ${
          hasShadow ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]' : ''
        }`}
      />
    </div>
  );
};
