export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export type Square =
  | 'a8' | 'b8' | 'c8' | 'd8' | 'e8' | 'f8' | 'g8' | 'h8'
  | 'a7' | 'b7' | 'c7' | 'd7' | 'e7' | 'f7' | 'g7' | 'h7'
  | 'a6' | 'b6' | 'c6' | 'd6' | 'e6' | 'f6' | 'g6' | 'h6'
  | 'a5' | 'b5' | 'c5' | 'd5' | 'e5' | 'f5' | 'g5' | 'h5'
  | 'a4' | 'b4' | 'c4' | 'd4' | 'e4' | 'f4' | 'g4' | 'h4'
  | 'a3' | 'b3' | 'c3' | 'd3' | 'e3' | 'f3' | 'g3' | 'h3'
  | 'a2' | 'b2' | 'c2' | 'd2' | 'e2' | 'f2' | 'g2' | 'h2'
  | 'a1' | 'b1' | 'c1' | 'd1' | 'e1' | 'f1' | 'g1' | 'h1';

export type BoardThemeId = 'walnut' | 'green' | 'slate';

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  lightSquare: string;
  darkSquare: string;
  selectedSquare: string;
  lastMoveSquare: string;
  moveDot: string;
}

export type PlayMode = 'ai' | 'pass-and-play';
export type UserColorChoice = 'white' | 'black' | 'random';

export interface TimeControl {
  name: string;
  initialMinutes: number;
  incrementSeconds: number;
}

export interface EngineDifficulty {
  elo: number;
  label: string;
  depth: number;
  skillLevel: number;
  blunderRate: number; // probability of suboptimal move for beginners
}

export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  color: PieceColor;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  fen: string;
}

export type GameTermination =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'fifty-moves'
  | 'insufficient'
  | 'timeout'
  | 'resignation'
  | 'draw-agreed';

export interface GameResult {
  winner: PieceColor | 'draw' | null;
  reason: GameTermination;
}

export type AIProviderId = 'gemini' | 'groq' | 'openrouter' | 'openai' | 'bytez' | 'custom';

export interface AppSettings {
  boardTheme: BoardThemeId;
  soundEnabled: boolean;
  showCoordinates: boolean;
  autoFlipBoard: boolean;
  allowUndo: boolean;
  geminiApiKey: string;
  aiProvider: AIProviderId;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModelName: string;
  voiceEnabled: boolean;
  voiceRate: number;
  voiceVolume: number;
  geminiVoice: string;
  useNaturalVoice: boolean;
  pieceSet: string;
  pieceShadow: boolean;
  liveCoachEnabled: boolean;
  coachMode: CoachMode;
  revealBetterMoveNames: boolean;
  autoSendTranscribed: boolean;
  streamingVoice: boolean;
}

export type CoachMode = 'learning' | 'criticizing' | 'simple' | 'competitive';

export type ActiveTab = 'learn' | 'practice' | 'play' | 'openings' | 'progress';
