import { Chess } from 'chess.js';
import { EngineDifficulty } from '../types/chess';

export const ENGINE_DIFFICULTIES: Record<string, EngineDifficulty> = {
  beginner: { elo: 1320, label: 'Beginner (Stockfish Level 0 - 1320 Elo)', depth: 1, skillLevel: 0, blunderRate: 0.35 },
  casual: { elo: 1450, label: 'Casual (Stockfish Level 2 - 1450 Elo)', depth: 2, skillLevel: 2, blunderRate: 0.20 },
  intermediate: { elo: 1750, label: 'Intermediate (Stockfish Level 6 - 1750 Elo)', depth: 4, skillLevel: 6, blunderRate: 0.05 },
  advanced: { elo: 2100, label: 'Advanced (Stockfish Level 12 - 2100 Elo)', depth: 6, skillLevel: 12, blunderRate: 0.01 },
  master: { elo: 2500, label: 'Master (Stockfish Level 20 - 2500+ Elo)', depth: 8, skillLevel: 20, blunderRate: 0.0 },
};

export interface EngineStatusInfo {
  isStockfishReady: boolean;
  statusLabel: string;
  lastError: string | null;
  activeEngine: 'stockfish' | 'minimax';
}

export interface EngineTestResult {
  success: boolean;
  bestMove: string;
  san: string;
  timeTakenMs: number;
  engineUsed: 'stockfish' | 'minimax';
  error?: string;
}

export class ChessEngineService {
  private worker: Worker | null = null;
  private minimaxWorker: Worker | null = null;
  private uciOkReceived: boolean = false;
  private readyOkReceived: boolean = false;
  private isReady: boolean = false;
  private lastError: string | null = null;
  private lastEngineUsed: 'stockfish' | 'minimax' = 'stockfish';
  private reqCounter: number = 0;

  constructor() {
    this.initWorkers();
  }

  private initWorkers() {
    if (typeof window === 'undefined') return;

    // 1. Initialize Stockfish 19 Lite Web Worker
    try {
      const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/';
      const wasmFilename = 'stockfish-19-lite-single.wasm';
      const wasmUrl = new URL(`${baseUrl}engine/${wasmFilename}`, window.location.href).href;
      // Pass wasm filename and full URL hint in worker URL hash as required
      const workerUrl = `${baseUrl}engine/stockfish-19-lite-single.js#${wasmFilename},${encodeURIComponent(wasmUrl)}`;

      this.worker = new Worker(workerUrl);

      this.worker.onerror = (err) => {
        const errorMsg = err.message || 'Stockfish worker failed to load';
        console.warn('Stockfish worker error:', errorMsg);
        this.lastError = errorMsg;
        this.isReady = false;
      };

      this.worker.onmessage = (e: MessageEvent) => {
        const msg = typeof e.data === 'string' ? e.data : '';
        if (msg.includes('uciok')) {
          this.uciOkReceived = true;
          this.worker?.postMessage('isready');
        }
        if (msg.includes('readyok')) {
          this.readyOkReceived = true;
        }
        if (this.uciOkReceived && this.readyOkReceived) {
          this.isReady = true;
          this.lastError = null;
        }
      };

      // Initiate UCI handshake
      this.worker.postMessage('uci');
    } catch (e: any) {
      this.lastError = e?.message || 'Failed to construct Stockfish Worker';
      console.warn('Stockfish initialization failed, fallback active:', this.lastError);
      this.isReady = false;
      this.worker = null;
    }

    // 2. Initialize background Minimax Web Worker (prevents main thread freeze)
    try {
      this.minimaxWorker = new Worker(new URL('../workers/minimaxWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.minimaxWorker.onerror = (e) => {
        console.warn('Minimax worker error, will use main thread fallback:', e);
      };
    } catch (e) {
      console.warn('Failed to load Minimax worker, local fallback available:', e);
      this.minimaxWorker = null;
    }
  }

  public getStatus(): EngineStatusInfo {
    const isReady = this.isReady && !!this.worker;
    return {
      isStockfishReady: isReady,
      statusLabel: isReady ? 'Stockfish ready' : 'Fallback engine (minimax)',
      lastError: this.lastError,
      activeEngine: isReady ? 'stockfish' : 'minimax',
    };
  }

  public getLastEngineUsed(): 'stockfish' | 'minimax' {
    return this.lastEngineUsed;
  }

  public async evaluate(
    fen: string,
    ms: number = 300
  ): Promise<{ score: number; bestMove: string }> {
    if (this.worker && this.isReady) {
      return new Promise((resolve) => {
        let bestMove = '';
        let score = 0;
        
        const handleMessage = (e: MessageEvent) => {
          const data = typeof e.data === 'string' ? e.data : '';
          if (data.includes('score cp')) {
            const match = data.match(/score cp (-?\d+)/);
            if (match) score = parseInt(match[1]);
          } else if (data.includes('score mate')) {
             const match = data.match(/score mate (-?\d+)/);
             if (match) score = parseInt(match[1]) > 0 ? 9999 : -9999;
          }
          if (data.startsWith('bestmove')) {
            bestMove = data.split(' ')[1];
            this.worker?.removeEventListener('message', handleMessage);
            resolve({ score, bestMove });
          }
        };

        this.worker?.addEventListener('message', handleMessage);
        this.worker?.postMessage(`position fen ${fen}`);
        this.worker?.postMessage(`go movetime ${ms}`);
      });
    }
    // Minimax fallback
    return { score: 0, bestMove: '' };
  }

  public async newGame(): Promise<void> {
    if (this.worker && this.isReady) {
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage('isready');
    }
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
        engineUsed: this.lastEngineUsed,
      };
    } catch (err: any) {
      const timeTakenMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        bestMove: '',
        san: '',
        timeTakenMs,
        engineUsed: this.lastEngineUsed,
        error: err?.message || 'Test failed',
      };
    }
  }

  public async getBestMove(
    fen: string,
    difficulty: EngineDifficulty = ENGINE_DIFFICULTIES.intermediate,
    skipBlunder: boolean = false
  ): Promise<{ from: string; to: string; promotion?: string; san?: string }> {
    const game = new Chess(fen);
    const legalMoves = game.moves({ verbose: true });

    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }

    // Beginner/Casual blunder logic
    if (!skipBlunder && Math.random() < (difficulty.blunderRate || 0)) {
      const nonMateMoves = legalMoves.filter((m) => {
        game.move(m);
        const mate = game.isCheckmate();
        game.undo();
        return !mate;
      });
      const pool = nonMateMoves.length > 0 ? nonMateMoves : legalMoves;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      return { from: chosen.from, to: chosen.to, promotion: chosen.promotion, san: chosen.san };
    }

    // Try Stockfish Worker with strict readiness & timeout
    if (this.worker && this.isReady) {
      try {
        const bestMoveUCI = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Stockfish response timed out (fallback to minimax for this move)'));
          }, 4000);

          const handleMessage = (e: MessageEvent) => {
            const data = typeof e.data === 'string' ? e.data : '';
            if (data.startsWith('bestmove')) {
              clearTimeout(timeout);
              if (this.worker) {
                this.worker.removeEventListener('message', handleMessage);
              }
              const parts = data.split(' ');
              resolve(parts[1] || '');
            }
          };

          if (this.worker) {
            this.worker.addEventListener('message', handleMessage);
            const skillLevel = Math.max(0, Math.min(20, difficulty.skillLevel ?? 5));
            const elo = Math.max(1320, Math.min(3190, difficulty.elo ?? 1500));
            const depth = Math.max(1, difficulty.depth || 3);
            const moveTime = Math.min(600, depth * 120);

            this.worker.postMessage(`setoption name Skill Level value ${skillLevel}`);
            this.worker.postMessage('setoption name UCI_LimitStrength value true');
            this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
            this.worker.postMessage(`position fen ${fen}`);
            this.worker.postMessage(`go depth ${depth} movetime ${moveTime}`);
          } else {
            clearTimeout(timeout);
            reject(new Error('Stockfish worker not available'));
          }
        });

        if (bestMoveUCI && bestMoveUCI.length >= 4) {
          const from = bestMoveUCI.substring(0, 2);
          const to = bestMoveUCI.substring(2, 4);
          const promotion = bestMoveUCI.length > 4 ? bestMoveUCI[4] : undefined;

          const match = legalMoves.find(
            (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion)
          );
          if (match) {
            this.lastEngineUsed = 'stockfish';
            return { from: match.from, to: match.to, promotion: match.promotion, san: match.san };
          }
        }
      } catch (stockfishErr: any) {
        console.warn('Stockfish move failed for this turn, using fallback engine:', stockfishErr?.message);
        this.lastEngineUsed = 'minimax';
      }
    } else {
      this.lastEngineUsed = 'minimax';
    }

    // Minimax Web Worker fallback (non-blocking)
    if (this.minimaxWorker) {
      try {
        const reqId = ++this.reqCounter;
        const workerResult = await new Promise<{ from: string; to: string; promotion?: string; san?: string }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Minimax worker timeout'));
            }, 3000);

            const handleWorkerMsg = (e: MessageEvent) => {
              if (e.data && e.data.id === reqId) {
                clearTimeout(timeout);
                this.minimaxWorker?.removeEventListener('message', handleWorkerMsg);
                if (e.data.bestMove) {
                  resolve(e.data.bestMove);
                } else {
                  reject(new Error(e.data.error || 'Minimax worker returned null'));
                }
              }
            };

            this.minimaxWorker?.addEventListener('message', handleWorkerMsg);
            this.minimaxWorker?.postMessage({
              id: reqId,
              fen,
              depth: Math.min(3, difficulty.depth || 2),
            });
          }
        );

        const match = legalMoves.find(
          (m) =>
            m.from === workerResult.from &&
            m.to === workerResult.to &&
            (!workerResult.promotion || m.promotion === workerResult.promotion)
        );
        if (match) {
          return { from: match.from, to: match.to, promotion: match.promotion, san: match.san };
        }
      } catch (minimaxErr) {
        console.warn('Minimax worker failed, using safe fallback:', minimaxErr);
      }
    }

    // Safety fallback: first legal move
    const fallback = legalMoves[0];
    return { from: fallback.from, to: fallback.to, promotion: fallback.promotion, san: fallback.san };
  }
}

export const engineService = new ChessEngineService();
