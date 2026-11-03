import { useCallback } from 'react';
import { soundService } from '../services/audioService';

// Shared singleton AudioContext to prevent hitting browser AudioContext limits (~6-32 contexts)
let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  if (!sharedAudioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx();
    }
  }

  if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }

  return sharedAudioContext;
}

export type ChessSoundType = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'game-end' | 'illegal';

export function useChessAudio(soundEnabled: boolean = true) {
  const playSound = useCallback(
    (type: ChessSoundType) => {
      if (!soundEnabled) return;

      try {
        const ctx = getSharedAudioContext();
        if (!ctx) {
          // Fallback to soundService singleton
          if (type === 'capture') soundService.playCapture();
          else if (type === 'check') soundService.playCheck();
          else if (type === 'game-end') soundService.playVictory();
          else if (type === 'illegal') soundService.playIllegal();
          else soundService.playMove();
          return;
        }

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        switch (type) {
          case 'move':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;
          case 'capture':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(90, now + 0.11);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.11);
            osc.start(now);
            osc.stop(now + 0.11);
            break;
          case 'check':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(340, now + 0.18);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
            osc.start(now);
            osc.stop(now + 0.18);
            break;
          case 'castle':
          case 'promote':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(240, now);
            osc.frequency.setValueAtTime(320, now + 0.06);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;
          case 'game-end':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(330, now);
            osc.frequency.setValueAtTime(440, now + 0.12);
            osc.frequency.setValueAtTime(554, now + 0.24);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
            osc.start(now);
            osc.stop(now + 0.45);
            break;
          case 'illegal':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;
        }
      } catch {
        // Ignore Web Audio errors on restricted devices
      }
    },
    [soundEnabled]
  );

  return { playSound };
}
