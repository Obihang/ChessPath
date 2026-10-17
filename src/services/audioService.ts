/**
 * Synthesized Web Audio sound effects for chess moves, captures, checks, and game endings.
 * Completely offline with zero external audio assets.
 */

export function ensureWavBuffer(buffer: ArrayBuffer, sampleRate: number = 24000): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 12) {
    const isRiff =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45;
    if (isRiff) {
      return buffer;
    }
  }

  // Prepend standard 44-byte RIFF WAV header (24kHz, 16-bit mono little-endian)
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = bytes.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // 'RIFF'
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  // 'WAVE'
  view.setUint32(8, 0x57415645, false);
  // 'fmt '
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // 'data'
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);

  const fullWav = new Uint8Array(44 + dataSize);
  fullWav.set(new Uint8Array(header), 0);
  fullWav.set(bytes, 44);
  return fullWav.buffer;
}

class SoundService {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private activeSourceNode: AudioBufferSourceNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getContextState(): string {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  /**
   * Plays a distinct 3-tone chime directly through Web Audio API.
   * Useful for diagnosing physical device speaker output independently of TTS speech output.
   */
  public async playDiagnosticBeep(): Promise<boolean> {
    const ctx = this.initCtx();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.setValueAtTime(659.25, t + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, t + 0.24); // G5

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.45);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Directly plays decoded PCM or WAV Audio ArrayBuffer through Web Audio API
   * or HTML5 Audio fallback.
   */
  public async playAudioArrayBuffer(
    buffer: ArrayBuffer,
    volume: number = 1.0,
    onEnded?: () => void,
    playbackRate: number = 1.0
  ): Promise<boolean> {
    const validWav = ensureWavBuffer(buffer);
    const ctx = this.initCtx();

    this.stopActiveSpeech();

    // Strategy 1: Web Audio decodeAudioData
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }

        const audioBuffer = await ctx.decodeAudioData(validWav.slice(0));
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();

        gain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
        source.playbackRate.value = Math.max(0.5, Math.min(2.0, playbackRate));
        source.buffer = audioBuffer;
        source.connect(gain);
        gain.connect(ctx.destination);

        return new Promise<boolean>((resolve) => {
          source.onended = () => {
            if (this.activeSourceNode === source) {
              this.activeSourceNode = null;
            }
            onEnded?.();
            resolve(true);
          };

          this.activeSourceNode = source;
          source.start(0);
        });
      } catch (e) {
        console.warn('Web Audio decodeAudioData playback failed, trying HTML5 Audio fallback', e);
      }
    }

    // Strategy 2: HTML5 Audio element fallback
    try {
      const blob = new Blob([validWav], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);
      const audio = new Audio(blobUrl);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.playbackRate = Math.max(0.5, Math.min(2.0, playbackRate));

      return new Promise<boolean>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(blobUrl);
          onEnded?.();
          resolve(true);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          resolve(false);
        };
        audio.play().then(() => resolve(true)).catch(() => resolve(false));
      });
    } catch {
      return false;
    }
  }

  public stopActiveSpeech() {
    if (this.activeSourceNode) {
      try {
        this.activeSourceNode.stop();
      } catch {
        // Ignored if already ended
      }
      this.activeSourceNode = null;
    }
  }

  public playMove() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  public playCapture() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // Primary impact
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(320, t);
    osc1.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    gain1.gain.setValueAtTime(0.25, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.1);

    // Subtle wooden crack
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(480, t + 0.015);
    osc2.frequency.exponentialRampToValueAtTime(140, t + 0.12);
    gain2.gain.setValueAtTime(0.2, t + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t + 0.015);
    osc2.stop(t + 0.12);
  }

  public playCheck() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.setValueAtTime(783.99, t + 0.08); // G5

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  public playVictory() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const noteTime = t + idx * 0.1;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.2, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.22);
    });
  }

  public playDraw() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [440, 415.3]; // A4 -> G#4
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const noteTime = t + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.18, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.25);
    });
  }

  public playIllegal() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, t);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.1);
  }
}

export const soundService = new SoundService();
