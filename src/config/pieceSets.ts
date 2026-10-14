export interface PieceSetConfig {
  id: string;
  name: string;
  author: string;
  license: string;
  description: string;
}

export const PIECE_SETS: PieceSetConfig[] = [
  {
    id: 'cburnett',
    name: 'Cburnett (Classic)',
    author: 'Colin M.L. Burnett',
    license: 'CC BY-SA 3.0',
    description: 'The beloved standard on Lichess & Wikimedia Commons with crisp vector contours.',
  },
  {
    id: 'merida',
    name: 'Mérida',
    author: 'Armando H. Marroquín',
    license: 'Free Art License / GPL',
    description: 'Traditional print-inspired design with elegant crossbars and distinct profiles.',
  },
  {
    id: 'staunty',
    name: 'Staunty',
    author: 'Jean-Luc Schulz & Lichess',
    license: 'CC BY-SA 3.0',
    description: 'Modernized Staunton wood-cut style with clean geometric proportions.',
  },
  {
    id: 'california',
    name: 'California',
    author: 'Wilfried Kaup',
    license: 'CC BY-SA 3.0',
    description: 'Bold, rounded American tournament style with high board contrast.',
  },
];

export const DEFAULT_PIECE_SET = 'cburnett';

export function getPieceSvgUrl(setName: string, color: 'w' | 'b', type: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/';
  const typeUpper = type.toUpperCase();
  const safeSet = setName || DEFAULT_PIECE_SET;
  return `${base}pieces/${safeSet}/${color}${typeUpper}.svg`;
}

export function preloadPieceSet(setName: string): void {
  if (typeof window === 'undefined') return;
  const pieces = ['P', 'N', 'B', 'R', 'Q', 'K'];
  const colors: ('w' | 'b')[] = ['w', 'b'];
  colors.forEach((color) => {
    pieces.forEach((type) => {
      const img = new Image();
      img.src = getPieceSvgUrl(setName, color, type);
    });
  });
}
