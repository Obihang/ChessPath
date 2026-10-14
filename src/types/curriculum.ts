import { PieceColor } from './chess';

export interface LessonStep {
  instruction: string;
  fen: string;
  playerColor: PieceColor;
  expectedMoves: string[]; // e.g. ['e4', 'Nf3'] in SAN or UCI
  hint: string;
  explanation: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  fen?: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  levelId: number;
  title: string;
  subtitle: string;
  description: string;
  steps: LessonStep[];
}

export interface CurriculumLevel {
  id: number;
  title: string;
  subtitle: string;
  badge: string;
  description: string;
  lessons: Lesson[];
  quiz: QuizQuestion[];
}

export interface OpeningVariation {
  name: string;
  moves: string[]; // SAN moves
  description: string;
}

export interface OpeningItem {
  id: string;
  name: string;
  eco: string;
  firstMove: string; // e.g. "1. e4", "1. d4", "Flank"
  family: string;
  side: PieceColor;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  moves: string[]; // Main line in SAN
  mainIdea: string;
  typicalPlansWhite: string[];
  typicalPlansBlack: string[];
  commonTraps: string[];
  famousGame?: string;
  variations: OpeningVariation[];
  isGambit?: boolean;
  gambitType?: string;
}

export interface PuzzleItem {
  id: string;
  title: string;
  theme: 'fork' | 'pin' | 'skewer' | 'discovered' | 'mate-1' | 'mate-2' | 'mate-3' | 'back-rank' | 'smothered' | 'endgame';
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  rating: number;
  fen: string;
  playerColor: PieceColor;
  solutionMoves: string[]; // SAN moves
  description: string;
  hint: string;
}

export interface EndgameDrill {
  id: string;
  title: string;
  category: 'king-queen' | 'two-rooks' | 'king-rook' | 'pawn-opposition' | 'lucena' | 'philidor';
  fen: string;
  playerColor: PieceColor;
  goal: string;
  description: string;
}

export interface UserProgress {
  completedLessonIds: string[];
  passedQuizLevelIds: number[];
  puzzleRating: number;
  puzzlesSolved: number;
  puzzlesAttempted: number;
  puzzleMistakes: string[]; // puzzle IDs
  srsCards: Record<string, { interval: number; ease: number; nextDue: string; reps: number }>;
  streakDays: number;
  lastActiveDate: string;
  gamesPlayed: number;
  gamesWon: number;
}
