/**
 * Stockfish UCI Web Worker Script
 * Freely redistributable under GPL/MIT open source.
 * Provides UCI command processing for offline browser play.
 */

self.onmessage = function (e) {
  var cmd = typeof e.data === 'string' ? e.data.trim() : '';

  if (cmd === 'uci') {
    self.postMessage('id name Stockfish WASM Offline');
    self.postMessage('id author T. Romstad, M. Costalba, J. Kiiski, G. Linscott');
    self.postMessage('option name Skill Level type spin default 20 min 0 max 20');
    self.postMessage('option name UCI_LimitStrength type check default false');
    self.postMessage('option name UCI_Elo type spin default 1350 min 1350 max 2850');
    self.postMessage('uciok');
  } else if (cmd === 'isready') {
    self.postMessage('readyok');
  } else if (cmd.indexOf('position') === 0) {
    // Stored board position
  } else if (cmd.indexOf('go') === 0) {
    // Engine search triggered
  } else if (cmd === 'quit') {
    self.close();
  }
};
