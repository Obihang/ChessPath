import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import {
  AppSettings,
  CoachMode,
  GameResult,
  MoveRecord,
  PieceColor,
  PieceType,
  PlayMode,
  TimeControl,
  UserColorChoice,
} from '../../types/chess';
import { ChessBoard } from '../board/ChessBoard';
import { LiveCommentaryCard } from '../board/LiveCommentaryCard';
import { LiveChatIndicator } from '../coach/LiveChatIndicator';
import { GameClock } from './GameClock';
import { CapturedPieces } from '../board/CapturedPieces';
import { MoveHistory } from '../board/MoveHistory';
import { engineService, ENGINE_DIFFICULTIES } from '../../services/engineService';
import { soundService } from '../../services/audioService';
import { speechService } from '../../services/speechService';
import { storageService } from '../../services/storageService';
import { useLiveCoach } from '../../hooks/useLiveCoach';
import { geminiService } from '../../services/geminiService';
import {
  RotateCcw,
  Undo2,
  Flag,
  Share2,
  Bot,
  Users,
  Play,
  RotateCw,
  Trophy,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  Loader2,
  Lightbulb,
  Mic,
  MicOff,
} from 'lucide-react';

interface PlayViewProps {
  settings: AppSettings;
  onOpenSettings: () => void;
  onOpenCoach: () => void;
  onPositionChange?: (fen: string, history: string[]) => void;
  onUpdateSettings?: (settings: AppSettings) => void;
}

const TIME_CONTROLS: TimeControl[] = [
  { name: 'Casual (No Clock)', initialMinutes: 0, incrementSeconds: 0 },
  { name: 'Blitz (3+2)', initialMinutes: 3, incrementSeconds: 2 },
  { name: 'Blitz (5+3)', initialMinutes: 5, incrementSeconds: 3 },
  { name: 'Rapid (10+0)', initialMinutes: 10, incrementSeconds: 0 },
];

export const PlayView: React.FC<PlayViewProps> = ({
  settings,
  onOpenSettings,
  onOpenCoach,
  onPositionChange,
  onUpdateSettings,
}) => {
  // Game Configuration
  const [mode, setMode] = useState<PlayMode>('ai');
  const [aiColorChoice, setAiColorChoice] = useState<UserColorChoice>('white');
  const [playerColor, setPlayerColor] = useState<PieceColor>('w');
  const [selectedDifficultyKey, setSelectedDifficultyKey] = useState<string>('intermediate');
  const [selectedTimeControl, setSelectedTimeControl] = useState<TimeControl>(TIME_CONTROLS[0]);

  // Live AI Coach Hook (handles move analysis, Stockfish facts, Gemini commentary, speech)
  const {
    latestComment,
    commentFacts,
    coachError,
    isMuted: isCoachMuted,
    isAnalyzing: isCoachAnalyzing,
    precomputeTurn,
    processMove: processCoachMove,
    toggleMute: toggleCoachMute,
    dismissComment: dismissCoachComment,
    repeatComment: repeatCoachComment,
    resetCoach: resetLiveCoach,
    setLatestComment,
  } = useLiveCoach({
    settings,
    playerColor,
  });

  const handleToggleLiveCoach = () => {
    const updated = storageService.updateSetting('liveCoachEnabled', !settings.liveCoachEnabled);
    onUpdateSettings?.(updated);
  };

  const handleCoachModeChange = (newMode: CoachMode) => {
    const updated = storageService.updateSetting('coachMode', newMode);
    onUpdateSettings?.(updated);
  };

  // Active Game State
  const [game, setGame] = useState<Chess>(() => new Chess());
  const [boardOrientation, setBoardOrientation] = useState<PieceColor>('w');
  const [moves, setMoves] = useState<MoveRecord[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [copiedPgn, setCopiedPgn] = useState<boolean>(false);
  const [activeEngine, setActiveEngine] = useState<'stockfish' | 'minimax'>('stockfish');
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [customArrow, setCustomArrow] = useState<{ from: string; to: string; color?: string } | null>(null);
  const [isPlayRecording, setIsPlayRecording] = useState(false);
  const [isPlayTranscribing, setIsPlayTranscribing] = useState(false);

  // Pre-generate verdict audio clips & precompute player turns
  useEffect(() => {
    speechService.pregenerateVerdictPhrases(settings).catch(() => {});
  }, [settings.geminiVoice, settings.voiceEnabled]);

  useEffect(() => {
    if (game && !gameResult && game.turn() === playerColor) {
      precomputeTurn(game.fen());
    }
  }, [game, gameResult, playerColor, precomputeTurn]);

  // Clocks
  const [whiteTime, setWhiteTime] = useState<number>(0);
  const [blackTime, setBlackTime] = useState<number>(0);
  const [isClockRunning, setIsClockRunning] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Setup Drawer / Panel Toggle
  const [showSetup, setShowSetup] = useState<boolean>(false);

  // Sync active position with global AI Coach
  const lastFenRef = useRef<string>('');
  useEffect(() => {
    if (onPositionChange) {
      const currentFen = game.fen();
      const historyArr = moves.map((m) => m.san);
      const historyKey = historyArr.join(',');
      const combined = `${currentFen}|${historyKey}`;
      if (lastFenRef.current !== combined) {
        lastFenRef.current = combined;
        onPositionChange(currentFen, historyArr);
      }
    }
  }, [game, moves, onPositionChange]);

  // Material Calculations
  const [whiteCaptures, setWhiteCaptures] = useState<PieceType[]>([]);
  const [blackCaptures, setBlackCaptures] = useState<PieceType[]>([]);
  const [whiteAdvantage, setWhiteAdvantage] = useState<number>(0);

  const calculateCapturedAndAdvantage = useCallback((currGame: Chess) => {
    const board = currGame.board();
    const initialCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };

    const currentCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };

    let wMaterial = 0;
    let bMaterial = 0;
    const values: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p) {
          currentCounts[p.color][p.type]++;
          if (p.color === 'w') wMaterial += values[p.type];
          else bMaterial += values[p.type];
        }
      }
    }

    // Pieces captured by White (missing Black pieces)
    const wCaps: PieceType[] = [];
    (['q', 'r', 'b', 'n', 'p'] as PieceType[]).forEach((type) => {
      const missing = initialCounts.b[type] - currentCounts.b[type];
      for (let i = 0; i < missing; i++) wCaps.push(type);
    });

    // Pieces captured by Black (missing White pieces)
    const bCaps: PieceType[] = [];
    (['q', 'r', 'b', 'n', 'p'] as PieceType[]).forEach((type) => {
      const missing = initialCounts.w[type] - currentCounts.w[type];
      for (let i = 0; i < missing; i++) bCaps.push(type);
    });

    setWhiteCaptures(wCaps);
    setBlackCaptures(bCaps);
    setWhiteAdvantage(wMaterial - bMaterial);
  }, []);

  // Initialize a New Game
  const startNewGame = useCallback(() => {
    setCustomArrow(null);
    resetLiveCoach();
    const newGame = new Chess();
    setGame(newGame);
    setMoves([]);
    setLastMove(null);
    setGameResult(null);
    setIsAiThinking(false);
    setShowSetup(false);

    let assignedPlayerColor: PieceColor = 'w';
    if (mode === 'ai') {
      if (aiColorChoice === 'random') {
        assignedPlayerColor = Math.random() < 0.5 ? 'w' : 'b';
      } else {
        assignedPlayerColor = aiColorChoice === 'white' ? 'w' : 'b';
      }
      setPlayerColor(assignedPlayerColor);
      setBoardOrientation(assignedPlayerColor);
    } else {
      setPlayerColor('w');
      setBoardOrientation('w');
    }

    if (mode === 'ai') {
      engineService.newGame();
    }

    // Clocks
    const initSecs = selectedTimeControl.initialMinutes * 60;
    setWhiteTime(initSecs);
    setBlackTime(initSecs);
    setIsClockRunning(initSecs > 0);

    calculateCapturedAndAdvantage(newGame);

    // If AI is White, trigger AI move immediately
    if (mode === 'ai' && assignedPlayerColor === 'b') {
      triggerAiMove(newGame);
    }
  }, [mode, aiColorChoice, selectedTimeControl, calculateCapturedAndAdvantage]);

  // Clock countdown loop
  useEffect(() => {
    if (!isClockRunning || selectedTimeControl.initialMinutes === 0 || gameResult) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const turn = game.turn();
      if (turn === 'w') {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            handleTimeout('w');
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            handleTimeout('b');
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isClockRunning, game.turn(), gameResult, selectedTimeControl]);

  const handleTimeout = (loser: PieceColor) => {
    soundService.playVictory();
    setIsClockRunning(false);
    setGameResult({
      winner: loser === 'w' ? 'b' : 'w',
      reason: 'timeout',
    });
  };

  // Check Game Termination
  const checkTermination = useCallback((currGame: Chess) => {
    if (currGame.isCheckmate()) {
      soundService.playVictory();
      setIsClockRunning(false);
      setGameResult({
        winner: currGame.turn() === 'w' ? 'b' : 'w',
        reason: 'checkmate',
      });
      return true;
    }
    if (currGame.isStalemate()) {
      soundService.playDraw();
      setIsClockRunning(false);
      setGameResult({ winner: 'draw', reason: 'stalemate' });
      return true;
    }
    if (currGame.isThreefoldRepetition()) {
      soundService.playDraw();
      setIsClockRunning(false);
      setGameResult({ winner: 'draw', reason: 'threefold' });
      return true;
    }
    if (currGame.isInsufficientMaterial()) {
      soundService.playDraw();
      setIsClockRunning(false);
      setGameResult({ winner: 'draw', reason: 'insufficient' });
      return true;
    }
    if (currGame.isDraw()) {
      soundService.playDraw();
      setIsClockRunning(false);
      setGameResult({ winner: 'draw', reason: 'fifty-moves' });
      return true;
    }
    return false;
  }, []);

  // Trigger AI Move
  const triggerAiMove = async (currGame: Chess) => {
    setIsAiThinking(true);
    const difficulty = ENGINE_DIFFICULTIES[selectedDifficultyKey] || ENGINE_DIFFICULTIES.intermediate;

    try {
      const best = await engineService.getBestMove(currGame.fen(), difficulty);
      const used = engineService.getLastEngineUsed();
      setActiveEngine(used === 'minimax' ? 'minimax' : 'stockfish');
      if (used === 'minimax') {
        setFallbackNotice('Stockfish timed out; turn played via Minimax fallback');
        setTimeout(() => setFallbackNotice(null), 4000);
      }

      const prevFen = currGame.fen();
      const move = currGame.move({
        from: best.from,
        to: best.to,
        promotion: best.promotion || 'q',
      });

      if (move) {
        if (move.captured) soundService.playCapture();
        else soundService.playMove();

        if (currGame.inCheck()) soundService.playCheck();

        // Increment time for AI if time control has increments
        if (selectedTimeControl.incrementSeconds > 0) {
          if (currGame.turn() === 'b') {
            setWhiteTime((t) => t + selectedTimeControl.incrementSeconds);
          } else {
            setBlackTime((t) => t + selectedTimeControl.incrementSeconds);
          }
        }

        const moveRec: MoveRecord = {
          san: move.san,
          from: move.from,
          to: move.to,
          color: move.color,
          piece: move.piece,
          captured: move.captured,
          fen: currGame.fen(),
        };

        setLastMove({ from: move.from, to: move.to });
        setMoves((prev) => [...prev, moveRec]);
        calculateCapturedAndAdvantage(currGame);
        checkTermination(currGame);

        // Process live coach commentary for opponent move
        const currentSanList = [...moves.map((m) => m.san), move.san];
        processCoachMove(moveRec, prevFen, currGame.fen(), false, currentSanList);
      }
    } catch (e) {
      console.warn('AI move calculation failed', e);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Handle User Move on Board
  const handleUserMove = (moveData: { from: string; to: string; promotion?: string; san?: string }) => {
    speechService.unlock();
    setLastMove({ from: moveData.from, to: moveData.to });

    const prevFen =
      moves.length > 0 ? moves[moves.length - 1].fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const history = game.history({ verbose: true });
    const lastHist = history[history.length - 1];

    if (lastHist) {
      const userMoveRec: MoveRecord = {
        san: lastHist.san,
        from: lastHist.from,
        to: lastHist.to,
        color: lastHist.color,
        piece: lastHist.piece,
        captured: lastHist.captured,
        fen: game.fen(),
      };
      setMoves((prev) => [...prev, userMoveRec]);

      // Process live coach commentary for player move
      setCustomArrow(null);
      const currentSanList = [...moves.map((m) => m.san), lastHist.san];
      processCoachMove(userMoveRec, prevFen, game.fen(), true, currentSanList);
    }

    calculateCapturedAndAdvantage(game);

    // Increment time for user
    if (selectedTimeControl.incrementSeconds > 0) {
      const prevPlayer = game.turn() === 'w' ? 'b' : 'w';
      if (prevPlayer === 'w') {
        setWhiteTime((t) => t + selectedTimeControl.incrementSeconds);
      } else {
        setBlackTime((t) => t + selectedTimeControl.incrementSeconds);
      }
    }

    const ended = checkTermination(game);

    // Auto-flip board in pass-and-play if enabled
    if (mode === 'pass-and-play' && settings.autoFlipBoard && !ended) {
      setBoardOrientation((prev) => (prev === 'w' ? 'b' : 'w'));
    }

    // Trigger AI move if in AI mode and it's AI's turn
    if (mode === 'ai' && !ended && game.turn() !== playerColor) {
      triggerAiMove(game);
    }
  };

  // On-demand Coach Hint / Suggestion
  const [isRequestingSuggestion, setIsRequestingSuggestion] = useState(false);

  const handleRequestCoachSuggestion = async () => {
    speechService.unlock();
    if (gameResult || isAiThinking || isRequestingSuggestion) return;

    setIsRequestingSuggestion(true);
    try {
      const currentFen = game.fen();
      const side = game.turn() === 'w' ? 'White' : 'Black';
      const evalInfo = await engineService.evaluate(currentFen, 400);

      let hintText = '';
      if (geminiService.hasKey()) {
        hintText = await geminiService.getHint(
          currentFen,
          `Provide an encouraging strategic hint and idea for ${side} in this position`,
          side
        );
      } else if (evalInfo && evalInfo.bestMove) {
        if (evalInfo.source === 'stockfish' && evalInfo.isAvailable) {
          const evalStr = evalInfo.mate !== null
            ? `mate in ${Math.abs(evalInfo.mate)}`
            : evalInfo.score !== null
            ? `${evalInfo.score >= 0 ? '+' : ''}${evalInfo.score} cp`
            : 'evaluated';
          hintText = `Stockfish 19 Recommendation: Best move is ${evalInfo.bestMoveSan || evalInfo.bestMove} (eval: ${evalStr}). Focus on controlling the center and active piece placement!`;
        } else {
          hintText = `Engine suggestion: Consider playing ${evalInfo.bestMoveSan || evalInfo.bestMove}. Focus on controlling key squares and active piece placement!`;
        }
      } else {
        hintText = 'Focus on piece activity: look for undefended pieces, forced checks, and double attacks!';
      }

      setLatestComment(hintText);
      if (settings.voiceEnabled) {
        speechService.speakWithCoach(hintText, settings);
      }
    } catch (e) {
      console.warn('Coach hint error:', e);
    } finally {
      setIsRequestingSuggestion(false);
    }
  };

  // Takeback / Undo
  const handleUndo = () => {
    if (moves.length === 0 || gameResult || isAiThinking) return;
    resetLiveCoach();

    if (mode === 'ai') {
      // In Vs AI mode, undo two moves (player move + AI move) unless AI hasn't moved yet
      game.undo();
      if (game.turn() !== playerColor && moves.length > 1) {
        game.undo();
      }
    } else {
      game.undo();
    }

    const remainingHistory = game.history({ verbose: true });
    const last = remainingHistory[remainingHistory.length - 1];
    setLastMove(last ? { from: last.from, to: last.to } : null);
    setMoves((prev) => prev.slice(0, remainingHistory.length));
    calculateCapturedAndAdvantage(game);
    setGameResult(null);
    soundService.playMove();
  };

  // Resign
  const handleResign = () => {
    if (gameResult) return;
    const loser = mode === 'ai' ? playerColor : game.turn();
    const winner = loser === 'w' ? 'b' : 'w';
    soundService.playVictory();
    setIsClockRunning(false);
    setGameResult({ winner, reason: 'resignation' });
  };

  // Offer Draw
  const handleOfferDraw = () => {
    if (gameResult) return;
    soundService.playDraw();
    setIsClockRunning(false);
    setGameResult({ winner: 'draw', reason: 'draw-agreed' });
  };

  // Copy PGN
  const handleCopyPgn = () => {
    const pgn = game.pgn() || '1. e4';
    navigator.clipboard.writeText(pgn).then(() => {
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    });
  };

  const isPlayerTurn = mode === 'pass-and-play' || game.turn() === playerColor;
  const isBoardDisabled = !!gameResult || isAiThinking || !isPlayerTurn;

  return (
    <div className="flex flex-col items-center w-full max-w-xl mx-auto px-3 py-2 space-y-3">
      {/* Top Controls: Mode Switcher & Game Setup Trigger */}
      <div className="flex items-center justify-between w-full max-w-[520px] px-1">
        <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
          <button
            onClick={() => {
              setMode('ai');
              setShowSetup(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              mode === 'ai' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Vs Computer</span>
          </button>
          <button
            onClick={() => {
              setMode('pass-and-play');
              setShowSetup(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              mode === 'pass-and-play'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Pass & Play</span>
          </button>
        </div>

        <button
          onClick={() => setShowSetup(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>New Game</span>
        </button>
      </div>

      {/* Dual Clocks (only if timed) */}
      {selectedTimeControl.initialMinutes > 0 && (
        <GameClock
          whiteTime={whiteTime}
          blackTime={blackTime}
          activeColor={game.turn()}
          isRunning={isClockRunning && !gameResult}
          orientation={boardOrientation}
        />
      )}

      {/* Captured Pieces & Material Advantage */}
      <CapturedPieces
        whiteCaptures={whiteCaptures}
        blackCaptures={blackCaptures}
        whiteAdvantage={whiteAdvantage}
      />

      {/* Interactive ChessBoard */}
      <div className="w-full relative">
        <ChessBoard
          game={game}
          orientation={boardOrientation}
          theme={settings.boardTheme}
          showCoordinates={settings.showCoordinates}
          disabled={isBoardDisabled}
          lastMove={lastMove}
          customArrow={customArrow}
          onMove={handleUserMove}
        />
        <LiveChatIndicator onClick={onOpenCoach} />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between w-full max-w-[520px] px-2 py-1 text-xs">
        <div className="flex items-center gap-2">
          {isAiThinking ? (
            <div className="flex items-center gap-1.5 text-amber-400 animate-pulse font-medium">
              <Bot className="w-4 h-4" />
              <span>Stockfish is thinking...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2.5 h-2.5 rounded-full border ${
                  game.turn() === 'w' ? 'bg-slate-100 border-slate-400' : 'bg-slate-900 border-slate-600'
                }`}
              />
              <span className="font-semibold text-slate-200">
                {mode === 'ai'
                  ? game.turn() === playerColor
                    ? 'Your turn'
                    : "Computer's turn"
                  : game.turn() === 'w'
                  ? "White's turn"
                  : "Black's turn"}
              </span>
              {game.inCheck() && !gameResult && (
                <span className="font-bold text-red-400 ml-1">· Check!</span>
              )}
            </div>
          )}
        </div>

        {mode === 'ai' && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                activeEngine === 'stockfish'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              }`}
            >
              {activeEngine === 'stockfish' ? '⚡ Stockfish 19' : '🛡️ Minimax'}
            </span>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              {ENGINE_DIFFICULTIES[selectedDifficultyKey]?.label}
            </span>
          </div>
        )}
      </div>

      {/* Live Coach Commentary Card */}
      {settings.liveCoachEnabled && (latestComment || commentFacts || isCoachAnalyzing) && (
        <LiveCommentaryCard
          comment={latestComment}
          isMuted={isCoachMuted}
          onToggleMute={toggleCoachMute}
          mode={settings.coachMode}
          facts={commentFacts}
          isAnalyzing={isCoachAnalyzing}
          error={coachError}
          onOpenCoach={onOpenCoach}
          onDismiss={dismissCoachComment}
          onRepeat={repeatCoachComment}
          onShowBetterMove={(from, to) => setCustomArrow({ from, to, color: '#f59e0b' })}
        />
      )}

      {/* Live Coach Controls: On/Off Switch & Mode Selector */}
      <div className="w-full max-w-[520px] bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                settings.liveCoachEnabled ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <span>Live AI Coach</span>
                {isCoachAnalyzing && (
                  <span className="text-[10px] text-amber-400 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> analyzing move...
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400">
                Stockfish fact extraction & real-time commentary
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                speechService.unlock();
                if (isPlayRecording) {
                  setIsPlayRecording(false);
                  setIsPlayTranscribing(true);
                  try {
                    const audioBlob = await speechService.stopRecording();
                    if (audioBlob && audioBlob.size > 0) {
                      const res = await geminiService.transcribeAudio(
                        audioBlob,
                        audioBlob.type,
                        settings.geminiApiKey || settings.aiApiKey
                      );
                      if (res.success && res.transcript) {
                        setFallbackNotice(`Microphone transcript: "${res.transcript}"`);
                        if (onOpenCoach) onOpenCoach();
                      } else if (res.error) {
                        setFallbackNotice(`STT error: ${res.error}`);
                      }
                    }
                  } catch (e: any) {
                    console.warn('Play mic error', e);
                  } finally {
                    setIsPlayTranscribing(false);
                    setTimeout(() => setFallbackNotice(null), 5000);
                  }
                  return;
                }

                try {
                  await speechService.startRecording(30000);
                  setIsPlayRecording(true);
                } catch (e: any) {
                  setIsPlayRecording(false);
                  setFallbackNotice('Microphone permission blocked or unavailable.');
                  setTimeout(() => setFallbackNotice(null), 4000);
                }
              }}
              disabled={isPlayTranscribing}
              className={`p-1.5 rounded-lg border transition-colors ${
                isPlayRecording
                  ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                  : isPlayTranscribing
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={isPlayRecording ? 'Tap to stop recording' : 'Voice Input (Microphone)'}
            >
              {isPlayTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : isPlayRecording ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={settings.liveCoachEnabled}
              onClick={handleToggleLiveCoach}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.liveCoachEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
              title={settings.liveCoachEnabled ? 'Disable Live Coach' : 'Enable Live Coach'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  settings.liveCoachEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Mode Selector (in sync with Coach Drawer) */}
        {settings.liveCoachEnabled && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-medium">Mode:</span>
            <div className="grid grid-cols-4 gap-1 flex-1 max-w-sm">
              {(
                [
                  { id: 'learning', label: 'Full Learning' },
                  { id: 'criticizing', label: 'Criticizing' },
                  { id: 'simple', label: 'Simple' },
                  { id: 'competitive', label: 'Competitive' },
                ] as { id: CoachMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleCoachModeChange(m.id)}
                  className={`px-1.5 py-1 text-[11px] rounded-md font-medium transition-colors text-center truncate ${
                    settings.coachMode === m.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title={m.label}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {fallbackNotice && (
        <div className="w-full max-w-[520px] px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{fallbackNotice}</span>
        </div>
      )}

      {/* Move History Strip */}
      <div className="w-full max-w-[520px]">
        <MoveHistory moves={moves} />
      </div>

      {/* Game Action Toolbar */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap w-full max-w-[520px] pt-1 pb-4">
        <button
          onClick={handleRequestCoachSuggestion}
          disabled={!!gameResult || isAiThinking || isRequestingSuggestion}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 shrink-0"
          title="Ask AI Coach for a move suggestion"
        >
          {isRequestingSuggestion ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
          ) : (
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>Coach Hint</span>
        </button>

        <button
          onClick={() => setBoardOrientation((prev) => (prev === 'w' ? 'b' : 'w'))}
          className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
          title="Flip Board"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Flip</span>
        </button>

        {settings.allowUndo && (
          <button
            onClick={handleUndo}
            disabled={moves.length === 0 || !!gameResult || isAiThinking}
            className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
            title="Takeback"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        )}

        <button
          onClick={handleOfferDraw}
          disabled={moves.length < 2 || !!gameResult}
          className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
          title="Offer Draw"
        >
          <span>Draw</span>
        </button>

        <button
          onClick={handleResign}
          disabled={moves.length < 2 || !!gameResult}
          className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-red-400 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
          title="Resign"
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Resign</span>
        </button>

        <button
          onClick={handleCopyPgn}
          className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
          title="Export PGN"
        >
          {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedPgn ? 'Copied' : 'PGN'}</span>
        </button>
      </div>

      {/* Game Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Play className="w-4 h-4 text-amber-500" />
              <span>{mode === 'ai' ? 'Play vs Computer' : 'Pass & Play Game'}</span>
            </h3>

            {mode === 'ai' && (
              <>
                {/* Choose Color */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Your Piece Color</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'white', label: 'White' },
                      { id: 'random', label: 'Random' },
                      { id: 'black', label: 'Black' },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setAiColorChoice(c.id as UserColorChoice)}
                        className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                          aiColorChoice === c.id
                            ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Difficulty Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-400">Engine Strength</span>
                    <span className="font-bold text-amber-400">
                      {ENGINE_DIFFICULTIES[selectedDifficultyKey]?.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {Object.entries(ENGINE_DIFFICULTIES).map(([k, d]) => (
                      <button
                        key={k}
                        onClick={() => setSelectedDifficultyKey(k)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg text-left border flex items-center justify-between transition-colors ${
                          selectedDifficultyKey === k
                            ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                            : 'bg-slate-950/30 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span>{d.label}</span>
                        <span className="text-[10px] text-slate-500">
                          {d.depth === 1 ? 'Beginner level' : `Depth ${d.depth}`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Time Control */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Time Control</label>
              <div className="grid grid-cols-2 gap-2">
                {TIME_CONTROLS.map((tc) => (
                  <button
                    key={tc.name}
                    onClick={() => setSelectedTimeControl(tc)}
                    className={`py-2 px-2 text-xs font-medium rounded-xl border text-center transition-all ${
                      selectedTimeControl.name === tc.name
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {tc.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowSetup(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startNewGame}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-colors shadow-lg shadow-amber-500/10"
              >
                Start Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {gameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in zoom-in-95 duration-150">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
              <Trophy className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-100">
                {gameResult.winner === 'draw'
                  ? 'Game Drawn'
                  : gameResult.winner === 'w'
                  ? 'White Wins!'
                  : 'Black Wins!'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 capitalize">
                {gameResult.reason === 'checkmate'
                  ? 'Checkmate on the board'
                  : gameResult.reason === 'resignation'
                  ? 'By resignation'
                  : gameResult.reason === 'timeout'
                  ? 'On time'
                  : gameResult.reason === 'stalemate'
                  ? 'Stalemate (no legal moves)'
                  : gameResult.reason === 'threefold'
                  ? 'Threefold repetition'
                  : gameResult.reason === 'insufficient'
                  ? 'Insufficient material to checkmate'
                  : 'Draw by agreement'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setGameResult(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
              >
                Review Board
              </button>
              <button
                onClick={startNewGame}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
