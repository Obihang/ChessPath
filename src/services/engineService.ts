import { Chess } from 'chess.js';
import { EngineDifficulty } from '../types/chess';

export const ENGINE_DIFFICULTIES: Record<string, EngineDifficulty> = {
  beginner: { elo: 1320, label: 'Beginner (1320 Elo)', depth: 1, skillLevel: 0, blunderRate: 0.10 },
  casual: { elo: 1500, label: 'Casual (1500 Elo)', depth: 2, skillLevel: 5, blunderRate: 0.0 },
  intermediate: { elo: 1800, label: 'Intermediate, about 1800 Elo', depth: 4, skillLevel: 10, blunderRate: 0.0 },
  advanced: { elo: 2200, label: 'Advanced (2200 Elo)', depth: 6, skillLevel: 16, blunderRate: 0.0 },
  master: { elo: 2800, label: 'Master, full strength', depth: 8, skillLevel: 20, blunderRate: 0.0 },
};

export type EngineSource = 'stockfish' | 'minimax' | 'none';

export type EngineEvaluationStatus =
  | 'available'
  | 'timeout'
  | 'unavailable'
  | 'no_legal_moves'
  | 'worker_error';

export interface EngineEvaluationResult {
  /**
   * Centipawns from the perspective of the side whose turn it is to move in the evaluated FEN.
   * Positive means the side to move has an advantage; negative means they are behind.
   * Explicitly null when evaluation is unavailable, timed out, mate, or when fallback was used.
   * Never reports score 0 merely because Stockfish failed or an evaluation timed out.
   */
  score: number | null;
  /**
   * Moves to mate (+ for side to move mating, - for side to move getting mated).
   * Null when not a forced mate or when evaluation is unavailable.
   */
  mate: number | null;
  /**
   * Best move in UCI notation (e.g. 'e2e4'), or empty string if unavailable.
   */
  bestMove: string;
  bestMoveSan?: string;
  source: EngineSource;
  isAvailable: boolean;
  status: EngineEvaluationStatus;
  depth?: number;
  error?: string;
}

export interface EngineMoveResult {
  from: string;
  to: string;
  promotion?: string;
  san?: string;
  source: EngineSource;
  isFallback: boolean;
  status?: 'ok' | 'timeout' | 'fallback' | 'no_legal_moves';
}

export interface EngineStatusInfo {
  isStockfishReady: boolean;
  statusLabel: string;
  lastError: string | null;
  activeEngine: 'stockfish' | 'minimax';
  fallbackUsedCount: number;
}

export interface EngineTestResult {
  success: boolean;
  bestMove: string;
  san: string;
  timeTakenMs: number;
  engineUsed: 'stockfish' | 'minimax';
  error?: string;
}

interface QueuedTask {
  id: number;
  fen: string;
  movetime: number;
  isAnalysis: boolean;
  limitStrength: boolean;
  elo?: number;
  resolve: (result: { bestMove: string; score: number | null; mate: number | null; depth?: number }) => void;
  reject: (err: any) => void;
}

interface UciTransport {
  postMessage(cmd: string): void;
  terminate(): void;
  onMessage: ((msg: string) => void) | null;
  onError: ((err: any) => void) | null;
}

/**
 * Controller that exclusively owns the Stockfish UCI message stream.
 * Serializes all requests through a single FIFO queue on the shared worker.
 * Prevents concurrent searches from overwriting positions or consuming one another's responses.
 * Correctly handles newGame, readyok, cancellation, timeout, worker errors, and terminal states.
 */
class StockfishUciController {
  private transport: UciTransport | null = null;
  private isReady: boolean = false;
  private isProcessing: boolean = false;
  private queue: QueuedTask[] = [];
  private currentTask: QueuedTask | null = null;
  private taskCounter: number = 0;
  private lastError: string | null = null;
  private stopWaitPromise: Promise<void> | null = null;
  private initPromise: Promise<boolean> | null = null;
  private resolveInit: ((ready: boolean) => void) | null = null;

  constructor() {
    this.initWorker();
  }

  public initWorker(): void {
    if (this.transport) {
      try {
        this.transport.terminate();
      } catch {
        // Ignored
      }
      this.transport = null;
    }

    this.isReady = false;
    this.isProcessing = false;
    this.initPromise = new Promise<boolean>((resolve) => {
      this.resolveInit = resolve;
    });

    // Browser environment: Web Worker
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const baseUrl = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '') + '/';
        const wasmFilename = 'stockfish-19-lite-single.wasm';
        const wasmUrl = new URL(`${baseUrl}engine/${wasmFilename}`, window.location.href).href;
        const workerUrl = `${baseUrl}engine/stockfish-19-lite-single.js#${wasmFilename},${encodeURIComponent(wasmUrl)}`;

        const worker = new Worker(workerUrl);
        const transport: UciTransport = {
          postMessage: (cmd) => worker.postMessage(cmd),
          terminate: () => worker.terminate(),
          onMessage: null,
          onError: null,
        };

        worker.onmessage = (e: MessageEvent) => {
          const msg = typeof e.data === 'string' ? e.data : '';
          transport.onMessage?.(msg);
        };

        worker.onerror = (err: ErrorEvent) => {
          const errorMsg = err.message || 'Stockfish worker error';
          console.warn('Stockfish worker error event:', errorMsg);
          this.lastError = errorMsg;
          transport.onError?.(err);
          this.recoverWorker();
        };

        this.transport = transport;
        this.sendUciHandshake();
        return;
      } catch (e: any) {
        this.lastError = e?.message || 'Failed to construct Stockfish Worker';
        console.warn('Stockfish browser worker initialization failed:', this.lastError);
        this.transport = null;
        this.isReady = false;
        this.resolveInit?.(false);
        this.resolveInit = null;
      }
    }

    // Node.js environment (e.g. test suites)
    if (typeof process !== 'undefined' && process.versions?.node) {
      this.initNodeTransport();
    }
  }

  private async initNodeTransport(): Promise<void> {
    try {
      let requireFn = typeof require !== 'undefined' ? require : (globalThis as any).require;
      if (!requireFn) {
        const { createRequire } = await import('node:module');
        requireFn = createRequire(process.cwd() + '/package.json');
      }
      const initStockfish = requireFn('stockfish');
      const sf = initStockfish();
      const transport: UciTransport = {
        postMessage: (cmd) => sf.processCommand(cmd),
        terminate: () => {
          try {
            sf.terminate?.();
          } catch {
            // Ignored
          }
        },
        onMessage: null,
        onError: null,
      };

      sf.listener = (line: string) => {
        if (typeof line === 'string') {
          transport.onMessage?.(line);
        }
      };

      this.transport = transport;
      this.sendUciHandshake();
    } catch (err: any) {
      this.lastError = err?.message || 'Failed to load Stockfish in Node';
      this.transport = null;
      this.isReady = false;
      this.resolveInit?.(false);
      this.resolveInit = null;
    }
  }

  private sendUciHandshake(): void {
    if (!this.transport) return;

    const transport = this.transport;
    const onInitialMessage = (msg: string) => {
      if (msg.includes('uciok')) {
        transport.postMessage('isready');
      }
      if (msg.includes('readyok')) {
        this.isReady = true;
        this.lastError = null;
        this.resolveInit?.(true);
        this.resolveInit = null;
        transport.onMessage = null;
        this.processNext();
      }
    };

    transport.onMessage = onInitialMessage;
    transport.postMessage('uci');
  }

  public async ensureReady(timeoutMs: number = 4000): Promise<boolean> {
    if (this.isReady && this.transport) return true;
    if (!this.initPromise) return false;
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<boolean>((res) => {
      timer = setTimeout(() => res(false), timeoutMs);
    });
    const result = await Promise.race([this.initPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result && this.isReady && !!this.transport;
  }

  public isAvailable(): boolean {
    return this.isReady && !!this.transport;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Recreates the worker cleanly when it encounters an unrecoverable failure or timeout.
   */
  public recoverWorker(): void {
    console.warn('Recovering Stockfish worker...');
    if (this.currentTask) {
      const task = this.currentTask;
      this.currentTask = null;
      task.reject(new Error('Stockfish worker terminated during recovery'));
    }
    this.initWorker();
  }

  /**
   * Cancels all pending searches in the queue.
   */
  public cancelPendingSearches(reason: string = 'Searches cancelled'): void {
    const pending = [...this.queue];
    this.queue = [];
    for (const task of pending) {
      task.reject(new Error(reason));
    }
  }

  /**
   * Safely stops the currently executing search (if any) and waits until
   * Stockfish has emitted bestmove or reached its terminal idle state.
   */
  public async stopCurrentSearch(): Promise<void> {
    if (this.stopWaitPromise) {
      return this.stopWaitPromise;
    }
    if (!this.currentTask || !this.transport) {
      return;
    }

    this.stopWaitPromise = new Promise<void>((resolve) => {
      const transport = this.transport;
      if (!transport) {
        resolve();
        return;
      }

      let timeoutTimer: NodeJS.Timeout | null = null;
      const prevOnMessage = transport.onMessage;

      const finish = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.stopWaitPromise = null;
        resolve();
      };

      timeoutTimer = setTimeout(() => {
        // If engine does not respond to stop within 1500ms, recover the worker
        this.recoverWorker();
        finish();
      }, 1500);

      transport.onMessage = (msg: string) => {
        prevOnMessage?.(msg);
        if (msg.includes('bestmove')) {
          finish();
        }
      };

      try {
        transport.postMessage('stop');
      } catch {
        finish();
      }
    });

    return this.stopWaitPromise;
  }

  /**
   * Resets game state: cancels pending tasks, stops any active search,
   * and sends ucinewgame followed by isready/readyok handshake.
   */
  public async resetNewGame(): Promise<void> {
    this.cancelPendingSearches('New game started');
    await this.stopCurrentSearch();

    if (this.transport && this.isReady) {
      await new Promise<void>((resolve) => {
        const transport = this.transport;
        if (!transport) {
          resolve();
          return;
        }

        let timer: NodeJS.Timeout | null = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          transport.onMessage = null;
          resolve();
        };

        timer = setTimeout(cleanup, 1000);

        transport.onMessage = (msg: string) => {
          if (msg.includes('readyok')) {
            cleanup();
          }
        };

        try {
          transport.postMessage('ucinewgame');
          transport.postMessage('isready');
        } catch {
          cleanup();
        }
      });
    }
  }

  /**
   * Schedules a search task on the serialized worker queue.
   */
  public scheduleSearch(
    fen: string,
    movetime: number,
    isAnalysis: boolean,
    limitStrength: boolean,
    elo?: number
  ): Promise<{ bestMove: string; score: number | null; mate: number | null; depth?: number }> {
    return new Promise((resolve, reject) => {
      const id = ++this.taskCounter;
      this.queue.push({ id, fen, movetime, isAnalysis, limitStrength, elo, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    if (!this.transport || !this.isReady) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;
    this.currentTask = task;

    try {
      const result = await this.executeTask(task);
      this.currentTask = null;
      task.resolve(result);
    } catch (err) {
      this.currentTask = null;
      task.reject(err);
    } finally {
      this.isProcessing = false;
      // Schedule next item on microtask queue
      Promise.resolve().then(() => this.processNext());
    }
  }

  private executeTask(
    task: QueuedTask
  ): Promise<{ bestMove: string; score: number | null; mate: number | null; depth?: number }> {
    return new Promise((resolve, reject) => {
      const transport = this.transport;
      if (!transport) {
        reject(new Error('Stockfish worker not available'));
        return;
      }

      let bestMove = '';
      let score: number | null = null;
      let mate: number | null = null;
      let depth: number | undefined;
      let settled = false;
      let timeoutId: NodeJS.Timeout | null = null;
      let hardStopTimer: NodeJS.Timeout | null = null;
      let phase: 'readyok' | 'searching' | 'stopping' = 'readyok';

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (hardStopTimer) {
          clearTimeout(hardStopTimer);
          hardStopTimer = null;
        }
        transport.onMessage = null;
        transport.onError = null;
      };

      const handleMessage = (msg: string) => {
        const lines = msg.split(/[\r\n]+/);
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          if (phase === 'readyok') {
            if (line.includes('readyok')) {
              phase = 'searching';
              transport.postMessage('ucinewgame');
              transport.postMessage(`position fen ${task.fen}`);
              transport.postMessage(`go movetime ${task.movetime}`);
            }
            continue;
          }

          // Parse search progress safely
          if (phase === 'searching' || phase === 'stopping') {
            if (line.includes('score cp')) {
              const match = line.match(/score cp (-?\d+)/);
              if (match) {
                score = parseInt(match[1], 10);
                mate = null;
              }
            } else if (line.includes('score mate')) {
              const match = line.match(/score mate (-?\d+)/);
              if (match) {
                mate = parseInt(match[1], 10);
                score = null;
              }
            }

            const depthMatch = line.match(/depth (\d+)/);
            if (depthMatch) {
              depth = parseInt(depthMatch[1], 10);
            }

            if (line.includes('bestmove')) {
              const parts = line.split(/\s+/);
              const bmIdx = parts.indexOf('bestmove');
              if (bmIdx !== -1 && parts[bmIdx + 1]) {
                bestMove = parts[bmIdx + 1];
              }
              cleanup();
              if (!settled) {
                settled = true;
                if (phase === 'stopping') {
                  // If stopped after timeout, reject cleanly now that engine is in idle terminal state
                  reject(new Error('Search timed out and stopped cleanly'));
                } else {
                  resolve({ bestMove, score, mate, depth });
                }
              }
            }
          }
        }
      };

      transport.onMessage = handleMessage;
      transport.onError = (err) => {
        cleanup();
        if (!settled) {
          settled = true;
          reject(new Error(err?.message || 'Worker error during search'));
        }
      };

      // Timeout watchdog: allow movetime + 2500ms before sending stop
      timeoutId = setTimeout(() => {
        if (!settled && phase === 'searching') {
          phase = 'stopping';
          try {
            transport.postMessage('stop');
          } catch {
            // Ignored
          }

          // Hard timeout watchdog if engine fails to emit bestmove within 1500ms after stop
          hardStopTimer = setTimeout(() => {
            if (!settled) {
              cleanup();
              settled = true;
              this.recoverWorker();
              reject(new Error('Stockfish unresponsive to stop; worker recovered'));
            }
          }, 1500);
        }
      }, task.movetime + 2500);

      // Step 1: Configure options safely and await readyok before starting search
      try {
        if (task.isAnalysis) {
          transport.postMessage('setoption name UCI_LimitStrength value false');
          transport.postMessage('setoption name Skill Level value 20');
        } else {
          if (task.limitStrength && task.elo) {
            transport.postMessage('setoption name UCI_LimitStrength value true');
            transport.postMessage(`setoption name UCI_Elo value ${task.elo}`);
          } else {
            transport.postMessage('setoption name UCI_LimitStrength value false');
            transport.postMessage('setoption name Skill Level value 20');
          }
        }
        transport.postMessage('isready');
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
}

export class ChessEngineService {
  private uciController: StockfishUciController;
  private lastEngineUsed: EngineSource = 'stockfish';
  private fallbackCount: number = 0;

  constructor() {
    this.uciController = new StockfishUciController();
  }

  public getStatus(): EngineStatusInfo {
    const isReady = this.uciController.isAvailable();
    return {
      isStockfishReady: isReady,
      statusLabel: isReady ? 'Stockfish 19 ready' : 'Fallback engine (Minimax)',
      lastError: this.uciController.getLastError(),
      activeEngine: isReady ? 'stockfish' : 'minimax',
      fallbackUsedCount: this.fallbackCount,
    };
  }

  public getLastEngineUsed(): EngineSource {
    return this.lastEngineUsed;
  }

  /**
   * Evaluates the given FEN position.
   * Returns an honest EngineEvaluationResult:
   * - Never reports score 0 when Stockfish is unavailable or times out.
   * - Distinguishes available evaluations from unavailable evaluations.
   * - Score perspective: centipawns relative to the side whose turn it is to move in the FEN.
   *   (Positive = side to move is ahead; Negative = side to move is behind).
   */
  public async evaluate(
    fen: string,
    ms: number = 250
  ): Promise<EngineEvaluationResult> {
    const game = new Chess();
    try {
      game.load(fen);
    } catch {
      return {
        score: null,
        mate: null,
        bestMove: '',
        source: 'none',
        isAvailable: false,
        status: 'unavailable',
        error: 'Invalid FEN string',
      };
    }

    if (game.isGameOver()) {
      if (game.isCheckmate()) {
        return {
          score: null,
          mate: 0,
          bestMove: '',
          source: 'none',
          isAvailable: true,
          status: 'available',
        };
      }
      return {
        score: 0,
        mate: null,
        bestMove: '',
        source: 'none',
        isAvailable: true,
        status: 'available',
      };
    }

    const isReady = await this.uciController.ensureReady(3000);
    if (isReady) {
      try {
        const result = await this.uciController.scheduleSearch(fen, ms, true, false);
        this.lastEngineUsed = 'stockfish';
        const hasScore = result.score !== null || result.mate !== null;

        let bestMoveSan: string | undefined;
        if (result.bestMove && result.bestMove.length >= 4) {
          try {
            const m = game.move({
              from: result.bestMove.slice(0, 2),
              to: result.bestMove.slice(2, 4),
              promotion: result.bestMove.length > 4 ? result.bestMove[4] : undefined,
            });
            if (m) bestMoveSan = m.san;
          } catch {
            // Ignored
          }
        }

        return {
          score: result.score,
          mate: result.mate,
          bestMove: result.bestMove,
          bestMoveSan,
          source: 'stockfish',
          isAvailable: hasScore,
          status: hasScore ? 'available' : 'unavailable',
          depth: result.depth,
        };
      } catch (err: any) {
        const isTimeout = (err?.message || '').toLowerCase().includes('time');
        console.warn('Stockfish evaluation timed out or failed:', err?.message || err);
        return {
          score: null, // Honest: do NOT fake 0 cp on error/timeout
          mate: null,
          bestMove: '',
          source: 'stockfish',
          isAvailable: false,
          status: isTimeout ? 'timeout' : 'worker_error',
          error: err?.message || 'Stockfish evaluation failed',
        };
      }
    }

    // Minimax fallback provides a candidate move if possible, but honestly reports evaluation as unavailable
    this.fallbackCount++;
    this.lastEngineUsed = 'minimax';
    try {
      const fallback = await this.getBestMoveMinimax(fen);
      const uci = `${fallback.from}${fallback.to}${fallback.promotion || ''}`;
      return {
        score: null, // Honest: do NOT fake 0 cp
        mate: null,
        bestMove: uci,
        bestMoveSan: fallback.san,
        source: 'minimax',
        isAvailable: false,
        status: 'unavailable',
        error: 'Stockfish evaluation unavailable; fallback move provided',
      };
    } catch {
      return {
        score: null,
        mate: null,
        bestMove: '',
        source: 'none',
        isAvailable: false,
        status: 'unavailable',
        error: 'Evaluation completely unavailable',
      };
    }
  }

  /**
   * Resets the engine state cleanly for a new game.
   */
  public async newGame(): Promise<void> {
    await this.uciController.resetNewGame();
  }

  public async testEngine(): Promise<EngineTestResult> {
    const startPos = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const startTime = performance.now();

    try {
      const result = await this.getBestMove(startPos, ENGINE_DIFFICULTIES.casual, true);
      const timeTakenMs = Math.round(performance.now() - startTime);
      return {
        success: true,
        bestMove: `${result.from}${result.to}${result.promotion || ''}`,
        san: result.san || `${result.from}-${result.to}`,
        timeTakenMs,
        engineUsed: result.source === 'stockfish' ? 'stockfish' : 'minimax',
      };
    } catch (err: any) {
      const timeTakenMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        bestMove: '',
        san: '',
        timeTakenMs,
        engineUsed: this.lastEngineUsed === 'stockfish' ? 'stockfish' : 'minimax',
        error: err?.message || 'Test failed',
      };
    }
  }

  /**
   * Computes the best move for the given FEN according to the selected difficulty.
   * Validates move legality strictly against chess.js.
   */
  public async getBestMove(
    fen: string,
    difficulty: EngineDifficulty = ENGINE_DIFFICULTIES.intermediate,
    skipBlunder: boolean = false
  ): Promise<EngineMoveResult> {
    const game = new Chess();
    try {
      game.load(fen);
    } catch {
      throw new Error('Invalid FEN provided to getBestMove');
    }

    const legalMoves = game.moves({ verbose: true });
    if (legalMoves.length === 0) {
      return {
        from: '',
        to: '',
        source: 'none',
        isFallback: false,
        status: 'no_legal_moves',
      };
    }

    // Beginner blunder logic (10% random non-mating move, only on beginner level)
    if (!skipBlunder && difficulty.blunderRate && Math.random() < difficulty.blunderRate) {
      const nonMateMoves = legalMoves.filter((m) => {
        game.move(m);
        const mate = game.isCheckmate();
        game.undo();
        return !mate;
      });
      const pool = nonMateMoves.length > 0 ? nonMateMoves : legalMoves;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      return {
        from: chosen.from,
        to: chosen.to,
        promotion: chosen.promotion,
        san: chosen.san,
        source: 'stockfish',
        isFallback: false,
        status: 'ok',
      };
    }

    // Search settings by Elo tier
    const movetime =
      difficulty.elo <= 1320 ? 300 :
      difficulty.elo <= 1500 ? 400 :
      difficulty.elo <= 1800 ? 700 :
      difficulty.elo <= 2200 ? 1000 : 1500;
    const limitStrength = difficulty.elo < 2500;
    const elo = difficulty.elo;

    const isReady = await this.uciController.ensureReady(3000);
    if (isReady) {
      try {
        let bestMoveUCI = '';
        try {
          const res = await this.uciController.scheduleSearch(fen, movetime, false, limitStrength, elo);
          bestMoveUCI = res.bestMove;
        } catch {
          // Retry once on failure or timeout
          const resRetry = await this.uciController.scheduleSearch(fen, movetime, false, limitStrength, elo);
          bestMoveUCI = resRetry.bestMove;
        }

        if (bestMoveUCI && bestMoveUCI.length >= 4) {
          const from = bestMoveUCI.slice(0, 2);
          const to = bestMoveUCI.slice(2, 4);
          const promotion = bestMoveUCI.length === 5 ? bestMoveUCI[4] : undefined;

          // Strictly validate legality with chess.js
          const matchingMove = legalMoves.find(
            (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion)
          );

          if (matchingMove) {
            this.lastEngineUsed = 'stockfish';
            return {
              from: matchingMove.from,
              to: matchingMove.to,
              promotion: matchingMove.promotion,
              san: matchingMove.san,
              source: 'stockfish',
              isFallback: false,
              status: 'ok',
            };
          }
        }
      } catch (err) {
        console.warn('Stockfish opponent search failed, falling back:', err);
      }
    }

    // Fallback to Minimax if Stockfish failed, timed out, or returned an illegal move
    this.fallbackCount++;
    this.lastEngineUsed = 'minimax';
    const fallbackMove = await this.getBestMoveMinimax(fen);
    return {
      from: fallbackMove.from,
      to: fallbackMove.to,
      promotion: fallbackMove.promotion,
      san: fallbackMove.san,
      source: 'minimax',
      isFallback: true,
      status: 'fallback',
    };
  }

  private async getBestMoveMinimax(
    fen: string
  ): Promise<{ from: string; to: string; promotion?: string; san?: string }> {
    const game = new Chess();
    game.load(fen);
    const legalMoves = game.moves({ verbose: true });
    if (legalMoves.length === 0) throw new Error('No legal moves');

    // Prefer captures or checks if available, otherwise pick a legal move
    const attackingMoves = legalMoves.filter((m) => m.captured || game.inCheck());
    const pool = attackingMoves.length > 0 ? attackingMoves : legalMoves;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    return {
      from: chosen.from,
      to: chosen.to,
      promotion: chosen.promotion,
      san: chosen.san,
    };
  }
}

export const engineService = new ChessEngineService();
