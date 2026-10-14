export interface PieceSetConfig {
  id: string;
  name: string;
  author: string;
  license: string;
  description: string;
  licenseText?: string;
}

export const PIECE_SETS: PieceSetConfig[] = [
  {
    id: 'cburnett',
    name: 'Cburnett (Classic)',
    author: 'Colin M.L. Burnett',
    license: 'GPLv2+',
    description: 'The beloved standard on Lichess & Wikimedia Commons with crisp vector contours.',
  },
  {
    id: 'merida',
    name: 'Mérida',
    author: 'Armando Hernandez Marroquin',
    license: 'GPLv2+',
    description: 'Traditional print-inspired design with elegant crossbars and distinct profiles.',
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    author: 'Maurizio Monge',
    license: 'MIT',
    description: 'Exaggerated, whimsical piece shapes inspired by high-fantasy themes.',
  },
  {
    id: 'spatial',
    name: 'Spatial',
    author: 'Maurizio Monge',
    license: 'MIT',
    description: 'Modern, minimalist geometric design focusing on clean silhouettes.',
  },
];

export const MIT_LICENSE_TEXT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

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
