import React from 'react';
import { PieceColor, PieceType } from '../../types/chess';

interface PieceIconProps {
  type: PieceType;
  color: PieceColor;
  className?: string;
}

/**
 * Standard Cburnett vector chess pieces (CC-BY-SA 3.0 / Wikipedia / Lichess standard).
 * Attribution included in project documentation.
 */
export const PieceIcon: React.FC<PieceIconProps> = ({ type, color, className = 'w-full h-full' }) => {
  const isWhite = color === 'w';

  // White pieces: crisp cream-white with clean slate contours
  // Black pieces: rich deep charcoal with subtle reflective contours
  const fill = isWhite ? '#ffffff' : '#1e293b';
  const stroke = isWhite ? '#334155' : '#0f172a';
  const highlight = isWhite ? '#f8fafc' : '#475569';

  switch (type) {
    case 'p': // PAWN
      return (
        <svg viewBox="0 0 45 45" className={className} aria-label={`${isWhite ? 'White' : 'Black'} Pawn`}>
          <path
            d="m 22.5,9 c -2.21,0 -4,1.79 -4,4 0,0.89 0.29,1.71 0.78,2.38 C 17.33,16.5 16,18.59 16,21 c 0,2.03 0.94,3.84 2.41,5.03 C 15.41,27.09 11,31.58 11,39.5 l 23,0 c 0,-7.92 -4.41,-12.41 -7.41,-13.47 C 28.06,24.84 29,23.03 29,21 29,18.59 27.67,16.5 25.72,15.38 26.21,14.71 26.5,13.89 26.5,13 c 0,-2.21 -1.79,-4 -4,-4 z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {isWhite && (
            <path
              d="M 22.5,10 C 21.12,10 20,11.12 20,12.5 c 0,0.5 0.15,0.96 0.41,1.35 C 19.3,14.6 18,16.3 18,18.5"
              fill="none"
              stroke={highlight}
              strokeWidth="1"
            />
          )}
        </svg>
      );

    case 'n': // KNIGHT
      return (
        <svg viewBox="0 0 45 45" className={className} aria-label={`${isWhite ? 'White' : 'Black'} Knight`}>
          <path
            d="m 22,10 c -4,1 -7,5 -7,8 0,1.2 0.4,2.3 1.1,3.2 C 14.5,22 13,24 13,26.5 c 0,1.5 0.6,2.8 1.6,3.8 -0.8,0.7 -1.6,1.7 -1.6,3.2 0,2.8 2.5,5 6,5.5 l 0,0.5 13,0 0,-1 c 0,-2.5 -1.5,-4.5 -3.5,-5.5 1.5,-1 2.5,-2.8 2.5,-5 0,-1.5 -0.5,-3 -1.5,-4.2 1,-1 1.5,-2.3 1.5,-3.8 0,-4 -4,-9 -10.5,-9.5 z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="18" cy="16" r="1.5" fill={isWhite ? '#334155' : '#f8fafc'} />
          <path
            d="M 24 18 C 22 18 20 22 20 26"
            fill="none"
            stroke={isWhite ? '#cbd5e1' : '#334155'}
            strokeWidth="1.2"
          />
        </svg>
      );

    case 'b': // BISHOP
      return (
        <svg viewBox="0 0 45 45" className={className} aria-label={`${isWhite ? 'White' : 'Black'} Bishop`}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.14,39.99 35,40 C 25,40 20,40 10,40 C 7.86,39.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z" />
            <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,22 30,22 C 30,22 25.5,10.5 22.5,8 C 19.5,10.5 15,22 15,22 C 15,22 14.5,30.5 15,32 z" />
            <circle cx="22.5" cy="5.5" r="2.5" />
          </g>
          <path d="m 17.5,16 10,0 M 22.5,11 l 0,10" stroke={stroke} strokeWidth="1.5" />
          <path d="m 14.5,24 16,0" stroke={stroke} strokeWidth="1.5" />
        </svg>
      );

    case 'r': // ROOK
      return (
        <svg viewBox="0 0 45 45" className={className} aria-label={`${isWhite ? 'White' : 'Black'} Rook`}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
            <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
            <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z" />
            <path d="M 34,14 L 31,17 L 14,17 L 11,14 z" />
            <path d="M 14,17 L 15,32 L 30,32 L 31,17 z" />
            <path d="M 14,29 L 31,29" />
            <path d="M 14,25 L 31,25" />
          </g>
        </svg>
      );

    case 'q': // QUEEN
      return (
        <svg viewBox="0 0 45 45" className={className} aria-label={`${isWhite ? 'White' : 'Black'} Queen`}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 8 12 A 2 2 0 1 1 8 11.99 A 2 2 0 0 1 8 12 z" />
            <path d="M 15 9 A 2 2 0 1 1 15 8.99 A 2 2 0 0 1 15 9 z" />
            <path d="M 22.5 8 A 2 2 0 1 1 22.5 7.99 A 2 2 0 0 1 22.5 8 z" />
            <path d="M 30 9 A 2 2 0 1 1 30 8.99 A 2 2 0 0 1 30 9 z" />
            <path d="M 37 12 A 2 2 0 1 1 37 11.99 A 2 2 0 0 1 37 12 z" />
            <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38,14 L 31,25 L 22.5,10 L 14,25 L 7,14 z" />
            <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 10.5,36 10,38 L 35,38 C 34.5,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z" />
            <path d="M 11.5,30 C 15,29 30,29 33.5,30" />
            <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" />
          </g>
        </svg>
      );

    case 'k': // KING
      return (
        <svg viewBox="0 0 45 45" className={className} aria-label={`${isWhite ? 'White' : 'Black'} King`}>
          <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {/* Cross */}
            <path d="M 22.5,11.5 L 22.5,6" />
            <path d="M 20,8 L 25,8" />
            {/* Crown */}
            <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 22.5,14 22.5,14 C 22.5,14 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
            <path d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 33.5,34 32.5,33.5 30.5,32.5 C 28.5,31.5 28,30 29.5,28.5 C 31,27 33,26 33,24 C 33,20 28.5,19 28.5,19 C 28.5,19 25.5,21.5 22.5,21.5 C 19.5,21.5 16.5,19 16.5,19 C 16.5,19 12,20 12,24 C 12,26 14,27 15.5,28.5 C 17,30 16.5,31.5 14.5,32.5 C 12.5,33.5 11.5,34 11.5,37 z" />
            <path d="M 11.5,30 C 17,27 28,27 33.5,30" />
            <path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5" />
            <path d="M 11.5,37 C 17,34 28,34 33.5,37" />
          </g>
        </svg>
      );

    default:
      return null;
  }
};
