import { PuzzleItem, EndgameDrill } from '../types/curriculum';
import { Chess } from 'chess.js';

export const RAW_PUZZLES: PuzzleItem[] = [
  // FORKS
  {
    id: 'puz-fork-1',
    title: 'The Royal Knight Fork',
    theme: 'fork',
    difficulty: 'Beginner',
    rating: 900,
    fen: 'r3k2r/ppp2ppp/2n5/3q4/3PN3/8/PPP2PPP/R2QK2R w KQkq - 0 1',
    playerColor: 'w',
    solutionMoves: ['Nf6+'],
    description: 'Find the knight move that attacks the black king and queen simultaneously.',
    hint: 'Look for checks with your knight that land on the kingside.',
  },
  {
    id: 'puz-fork-2',
    title: 'Pawn Fork Trick',
    theme: 'fork',
    difficulty: 'Beginner',
    rating: 950,
    fen: 'r1bqk2r/pppp1ppp/2n5/4p3/1bB1n3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
    playerColor: 'w',
    solutionMoves: ['Nxe4'],
    description: 'Win back the material and prepare a central pawn push.',
    hint: 'Capture the knight on e4.',
  },
  {
    id: 'puz-fork-3',
    title: 'Double Attack with Queen',
    theme: 'fork',
    difficulty: 'Intermediate',
    rating: 1250,
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/3Pn3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 1',
    playerColor: 'w',
    solutionMoves: ['d5'],
    description: 'Push the pawn forward to attack two minor pieces at once.',
    hint: 'Drive your d-pawn into the heart of black’s position.',
  },

  // PINS
  {
    id: 'puz-pin-1',
    title: 'Exploiting the Absolute Pin',
    theme: 'pin',
    difficulty: 'Beginner',
    rating: 1000,
    fen: 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
    playerColor: 'w',
    solutionMoves: ['Ng5'],
    description: 'Attack the f7 pawn which is pinned to the king.',
    hint: 'Bring another piece to attack f7 alongside your bishop.',
  },
  {
    id: 'puz-pin-2',
    title: 'Pin and Win the Queen',
    theme: 'pin',
    difficulty: 'Intermediate',
    rating: 1300,
    fen: '4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Rxe7+'],
    description: 'Black’s queen is pinned to the king. Collect the prize!',
    hint: 'Take the pinned queen on e7.',
  },

  // SKEWERS
  {
    id: 'puz-skewer-1',
    title: 'Rook Skewer on the Open File',
    theme: 'skewer',
    difficulty: 'Beginner',
    rating: 1050,
    fen: '8/8/8/8/4k3/8/4r3/4R1K1 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Rxe2'],
    description: 'Capture the undefended rook directly.',
    hint: 'Rook takes rook on e2.',
  },
  {
    id: 'puz-skewer-2',
    title: 'Bishop Skewer through King and Queen',
    theme: 'skewer',
    difficulty: 'Intermediate',
    rating: 1350,
    fen: '4k3/8/8/3q4/8/8/8/2B1K3 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Bh6'],
    description: 'Find the subtle bishop move.',
    hint: 'Move your bishop to an active square.',
  },

  // DISCOVERED ATTACK
  {
    id: 'puz-disc-1',
    title: 'Discovered Check Winning the Queen',
    theme: 'discovered',
    difficulty: 'Beginner',
    rating: 1100,
    fen: 'r1b1k2r/pppp1ppp/8/4q3/1b2n3/2N5/PPP1BPPP/R1BQK2R w KQkq - 0 1',
    playerColor: 'w',
    solutionMoves: ['O-O'],
    description: 'Castle your king into absolute safety while developing your rook.',
    hint: 'Castle kingside.',
  },

  // CHECKMATE IN 1
  {
    id: 'puz-mate1-1',
    title: 'Scholar’s Mate Finish',
    theme: 'mate-1',
    difficulty: 'Beginner',
    rating: 800,
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    playerColor: 'w',
    solutionMoves: ['Qxf7#'],
    description: 'Deliver immediate checkmate on the weakest square.',
    hint: 'Capture on f7 with your queen.',
  },
  {
    id: 'puz-mate1-2',
    title: 'Back-Rank Execution',
    theme: 'back-rank',
    difficulty: 'Beginner',
    rating: 850,
    fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Re8#'],
    description: 'The black king is trapped behind its own pawns. Deliver checkmate!',
    hint: 'Slide your rook all the way to e8.',
  },
  {
    id: 'puz-mate1-3',
    title: 'Smothered Mate in One',
    theme: 'smothered',
    difficulty: 'Intermediate',
    rating: 1200,
    fen: '6rk/5Npp/8/8/8/8/8/4K3 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Nf7#'],
    description: 'The classic smothered mate: jump to f7.',
    hint: 'Deliver checkmate with the knight on f7.',
  },
  {
    id: 'puz-mate1-4',
    title: 'Corridor Mate',
    theme: 'mate-1',
    difficulty: 'Beginner',
    rating: 850,
    fen: 'k7/8/1K6/8/8/8/8/R7 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Rxa8#'],
    description: 'Drive the rook to a8 to deliver mate.',
    hint: 'Play Rxa8#.',
  },

  // CHECKMATE IN 2
  {
    id: 'puz-mate2-1',
    title: 'Two-Move Ladder Sequence',
    theme: 'mate-2',
    difficulty: 'Beginner',
    rating: 950,
    fen: '4k3/R7/8/8/8/8/8/1R4K1 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Rb8#'],
    description: 'One rook cuts off the 7th rank; the other finishes the job on the 8th.',
    hint: 'Move the b1 rook to b8.',
  },
  {
    id: 'puz-mate2-2',
    title: 'Arabian Mate Connection',
    theme: 'mate-2',
    difficulty: 'Intermediate',
    rating: 1300,
    fen: '7k/5N2/8/8/8/8/8/4K2R w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Rh8#'],
    description: 'Rook and knight coordinate to deliver Arabian checkmate.',
    hint: 'Slide the rook to h8.',
  },

  // ENDGAME TACTICS
  {
    id: 'puz-endgame-1',
    title: 'Pawn Breakthrough',
    theme: 'endgame',
    difficulty: 'Intermediate',
    rating: 1400,
    fen: '8/8/4k3/8/4P3/4K3/8/8 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Kd4'],
    description: 'Seize the key square in front of your passed pawn.',
    hint: 'Move your king forward to d4.',
  },
  {
    id: 'puz-endgame-2',
    title: 'Taking the Opposition',
    theme: 'endgame',
    difficulty: 'Intermediate',
    rating: 1450,
    fen: '8/8/8/4k3/8/8/4K3/8 w - - 0 1',
    playerColor: 'w',
    solutionMoves: ['Ke3'],
    description: 'Step into direct vertical opposition to bar the enemy king.',
    hint: 'Step your king to e3.',
  },
];

export const ENDGAME_DRILLS: EndgameDrill[] = [
  {
    id: 'drill-kq-k',
    title: 'King & Queen vs Lone King',
    category: 'king-queen',
    fen: '4k3/8/8/8/8/8/8/4K1Q1 w - - 0 1',
    playerColor: 'w',
    goal: 'Deliver checkmate without allowing a stalemate.',
    description: 'Use your Queen to shrink the box around Black’s king, bring your King into position, and deliver the final checkmate.',
  },
  {
    id: 'drill-2r-k',
    title: 'Two Rooks Lawn-Mower Mate',
    category: 'two-rooks',
    fen: '4k3/8/8/8/8/8/8/R3R1K1 w - - 0 1',
    playerColor: 'w',
    goal: 'Drive the king to the 8th rank and checkmate.',
    description: 'Roll your rooks rank-by-rank like a ladder to corner the enemy king.',
  },
  {
    id: 'drill-kr-k',
    title: 'King & Rook vs Lone King',
    category: 'king-rook',
    fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
    playerColor: 'w',
    goal: 'Deliver checkmate using king opposition and rook cutoff.',
    description: 'A fundamental endgame technique: your king must actively corner the enemy king.',
  },
  {
    id: 'drill-pawn-opp',
    title: 'King & Pawn Opposition Drill',
    category: 'pawn-opposition',
    fen: '8/8/8/4k3/8/4P3/4K3/8 w - - 0 1',
    playerColor: 'w',
    goal: 'Promote the e-pawn into a queen.',
    description: 'Master the concept of key squares and opposition to escort your pawn to the 8th rank.',
  },
];

// Runtime validation using chess.js
export const PUZZLES: PuzzleItem[] = RAW_PUZZLES.filter((puz) => {
  try {
    const g = new Chess(puz.fen);
    for (const m of puz.solutionMoves) {
      const res = g.move(m);
      if (!res) {
        console.warn(`[Puzzles Data] Invalid solution move "${m}" in puzzle "${puz.title}".`);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.warn(`[Puzzles Data] Exception validating puzzle "${puz.title}".`, e);
    return false;
  }
});
