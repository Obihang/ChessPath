/**
 * Speech service providing robust text-to-speech with phonetic chess notation parsing,
 * Chromium/WebKit bug workarounds, and browser/native speech recognition capability.
 */

// Phonetic converter for chess algebraic notation
export function convertChessNotationToSpokenText(text: string): string {
  if (!text) return '';

  let spoken = text;

  // Castling
  spoken = spoken.replace(/\bO-O-O\b/g, 'castles queenside');
  spoken = spoken.replace(/\bO-O\b/g, 'castles kingside');
  spoken = spoken.replace(/\b0-0-0\b/g, 'castles queenside');
  spoken = spoken.replace(/\b0-0\b/g, 'castles kingside');

  // Check and checkmate symbols
  spoken = spoken.replace(/#/g, ', checkmate');
  spoken = spoken.replace(/\+/g, ', check');
  spoken = spoken.replace(/!!/g, ', brilliant move');
  spoken = spoken.replace(/\?/g, ''); // avoid reading question marks as punctuation anomalies

  // Promotion like e8=Q or d8=N
  spoken = spoken.replace(/([a-h][18])=([QRBN])/g, (_, sq, piece) => {
    const pNames: Record<string, string> = { Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
    return `promotes on ${sq} to ${pNames[piece] || piece}`;
  });

  // Captures with specific pieces: e.g. Nxd4, Bxf7, Qxd5, Rxd1, Kxd2
  spoken = spoken.replace(/\b([NBRQK])([a-h1-8]?)x([a-h][1-8])\b/g, (_, piece, disambig, target) => {
    const names: Record<string, string> = {
      N: 'knight',
      B: 'bishop',
      R: 'rook',
      Q: 'queen',
      K: 'king',
    };
    const pName = names[piece] || 'piece';
    const dis = disambig ? ` from ${disambig}` : '';
    return `${pName}${dis} takes on ${target}`;
  });

  // Pawn captures: e.g. exd5, cxd4, fxg6
  spoken = spoken.replace(/\b([a-h])x([a-h][1-8])\b/g, (_, file, target) => {
    return `${file}-pawn takes on ${target}`;
  });

  // Regular piece moves: e.g. Nf3, Bb5, Re1, Qh5, Kh1, Nbd7, R1e2
  spoken = spoken.replace(/\b([NBRQK])([a-h1-8]?)([a-h][1-8])\b/g, (_, piece, disambig, target) => {
    const names: Record<string, string> = {
      N: 'knight',
      B: 'bishop',
      R: 'rook',
      Q: 'queen',
      K: 'king',
    };
    const pName = names[piece] || 'piece';
    const dis = disambig ? ` from ${disambig}` : '';
    return `${pName}${dis} to ${target}`;
  });

  // Pawn moves: e.g. e4, d5, c4, a6
  spoken = spoken.replace(/\b([a-h][1-8])\b/g, (sq) => {
    return `pawn to ${sq}`;
  });

  // Clean up en passant
  spoken = spoken.replace(/\be\.p\.\b/gi, 'en passant');

  return spoken;
}

import { AppSettings } from '../types/chess';
import { geminiService } from './geminiService';
import { soundService } from './audioService';

export interface SpeechDiagnosticEntry {
  id: string;
  time: string;
  type: 'info' | 'trigger' | 'start' | 'end' | 'error' | 'blocked' | 'warn';
  message: string;
  details?: Record<string, any>;
}

export interface SpeechEngineStatus {
  isSupported: boolean;
  isRecognitionSupported: boolean;
  voicesCount: number;
  availableVoices: { name: string; lang: string; default: boolean }[];
  isSpeaking: boolean;
  isPaused: boolean;
  isPending: boolean;
  hasUserActivation: boolean;
  audioContextState: string;
}

class SpeechService {
  private voices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private isSpeakingState: boolean = false;
  private retryAttempted: boolean = false;
  private cancelTimeout: any = null;
  private resumeInterval: any = null;
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private diagnosticLogs: SpeechDiagnosticEntry[] = [];
  private diagnosticListeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
        this.logDiagnostic(
          'info',
          `voiceschanged event fired by browser. Total voices: ${this.voices.length}`,
          { voicesCount: this.voices.length }
        );
      };
    } else {
      this.logDiagnostic('warn', 'Web Speech API (speechSynthesis) is not available in window.');
    }
  }

  public logDiagnostic(
    type: SpeechDiagnosticEntry['type'],
    message: string,
    details?: Record<string, any>
  ) {
    const now = new Date();
    const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    const entry: SpeechDiagnosticEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: timeStr,
      type,
      message,
      details,
    };

    this.diagnosticLogs = [entry, ...this.diagnosticLogs].slice(0, 100);

    const prefix = `[SpeechDiag ${timeStr}][${type.toUpperCase()}]`;
    if (type === 'error' || type === 'blocked') {
      console.error(prefix, message, details || '');
    } else if (type === 'warn') {
      console.warn(prefix, message, details || '');
    } else {
      console.log(prefix, message, details || '');
    }

    if (typeof window !== 'undefined') {
      (window as any).__speechDiagnostics = {
        logs: this.diagnosticLogs,
        getStatus: () => this.getEngineStatus(),
        service: this,
      };
    }

    this.diagnosticListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('Diagnostic listener callback failed', err);
      }
    });
  }

  public getDiagnosticLogs(): SpeechDiagnosticEntry[] {
    return this.diagnosticLogs;
  }

  public clearDiagnosticLogs() {
    this.diagnosticLogs = [];
    this.logDiagnostic('info', 'Diagnostic log cleared by user.');
  }

  public subscribeDiagnostics(listener: () => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  public getEngineStatus(): SpeechEngineStatus {
    const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const synth = isSupported ? window.speechSynthesis : null;
    const userActivation =
      typeof navigator !== 'undefined' && (navigator as any).userActivation
        ? (navigator as any).userActivation.hasBeenActive
        : true;

    return {
      isSupported,
      isRecognitionSupported: this.isRecognitionAvailable(),
      voicesCount: this.voices.length,
      availableVoices: this.voices.slice(0, 8).map((v) => ({
        name: v.name,
        lang: v.lang,
        default: v.default,
      })),
      isSpeaking: synth ? synth.speaking : false,
      isPaused: synth ? synth.paused : false,
      isPending: synth ? synth.pending : false,
      hasUserActivation: userActivation,
      audioContextState: soundService.getContextState(),
    };
  }

  public unlock() {
    soundService.initCtx();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          this.logDiagnostic('info', 'Audio gesture unlock: window.speechSynthesis.resume() triggered.');
        }
      } catch {
        // Ignored
      }
    }
  }

  private loadVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        this.voices = v;
      }
    }
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
    }
    return this.voices;
  }

  public isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isRecognitionAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public stop(reason: string = 'User/app requested stop') {
    if (this.cancelTimeout) {
      clearTimeout(this.cancelTimeout);
      this.cancelTimeout = null;
    }

    if (this.resumeInterval) {
      clearInterval(this.resumeInterval);
      this.resumeInterval = null;
    }

    soundService.stopActiveSpeech();

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        this.logDiagnostic('info', `Stopping active speech (${reason}). Calling speechSynthesis.cancel().`);
        try {
          synth.cancel();
          synth.resume();
        } catch (e) {
          console.warn('speechSynthesis.cancel error', e);
        }
      }
    }

    this.activeUtterances.clear();
    this.isSpeakingState = false;
    this.currentUtterance = null;
  }

  /**
   * Universal coach speech dispatcher:
   * Prioritizes Gemini Natural Voice if enabled and key is present,
   * with automatic, instantaneous fallback to offline Web Speech API.
   * Fully instrumented with diagnostic logging and mute checks.
   */
  public async speakWithCoach(
    text: string,
    settings: AppSettings,
    options: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    } = {}
  ): Promise<{ usedNatural: boolean; error?: string }> {
    this.logDiagnostic('trigger', `speakWithCoach invoked: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`, {
      voiceEnabled: settings.voiceEnabled,
      soundEnabled: settings.soundEnabled,
      voiceVolume: settings.voiceVolume,
      voiceRate: settings.voiceRate,
      useNaturalVoice: settings.useNaturalVoice,
      hasGeminiKey: !!settings.geminiApiKey || geminiService.hasKey(),
    });

    if (!settings.voiceEnabled) {
      this.logDiagnostic(
        'blocked',
        'Voice is MUTED (voiceEnabled is false). Speech was intentionally blocked by mute setting. Click Mute in Coach header or Settings to enable.',
        { voiceEnabled: false }
      );
      options.onError?.(new Error('Voice Coach is disabled in Settings'));
      return { usedNatural: false, error: 'Voice is muted' };
    }

    if (!text || !text.trim()) {
      this.logDiagnostic('warn', 'Empty text passed to speakWithCoach. Operation skipped.');
      return { usedNatural: false };
    }

    if (settings.voiceVolume <= 0) {
      this.logDiagnostic(
        'warn',
        `Voice volume is set to ${Math.round(settings.voiceVolume * 100)}% (silent). Audio will not be audible. Increase volume in Settings.`,
        { volume: settings.voiceVolume }
      );
    }

    const spokenText = convertChessNotationToSpokenText(text);

    // Try Gemini Natural Voice if enabled and key exists
    const hasKey = !!(settings.geminiApiKey || geminiService.hasKey());
    if (settings.useNaturalVoice && hasKey) {
      try {
        this.logDiagnostic('info', 'Attempting Gemini Natural Voice generation (model: gemini-3.8-flash-lite-tts)...');
        options.onStart?.();
        this.isSpeakingState = true;

        const result = await geminiService.generateNaturalVoice(spokenText, settings.geminiApiKey);

        if (result.success && result.audioBuffer) {
          this.logDiagnostic('start', `Gemini Natural Voice received (${result.audioBuffer.byteLength} bytes). Starting audio playback...`);
          const played = await soundService.playAudioArrayBuffer(
            result.audioBuffer,
            settings.voiceVolume,
            () => {
              this.isSpeakingState = false;
              this.logDiagnostic('end', 'Gemini Natural Voice audio finished playing.');
              options.onEnd?.();
            }
          );

          if (played) {
            return { usedNatural: true };
          }
          this.logDiagnostic('warn', 'Audio playback failed through Web Audio / HTML5. Falling back to browser SpeechSynthesis...');
        } else {
          this.logDiagnostic(
            'warn',
            `Gemini Natural Voice error: "${result.error || 'Failed to generate'}". Falling back to browser SpeechSynthesis...`
          );
        }
      } catch (err: any) {
        this.logDiagnostic(
          'warn',
          `Gemini Natural Voice exception: "${err?.message || err}". Falling back to browser SpeechSynthesis...`
        );
      }
    } else {
      if (settings.useNaturalVoice && !hasKey) {
        this.logDiagnostic('info', 'Natural Voice enabled, but no Gemini key configured. Using offline Web Speech API.');
      } else {
        this.logDiagnostic('info', 'Using offline Web Speech API (speechSynthesis).');
      }
    }

    // Fallback to browser SpeechSynthesis
    this.speak(spokenText, {
      rate: settings.voiceRate,
      volume: settings.voiceVolume,
      voiceURI: settings.selectedVoiceURI,
      onStart: options.onStart,
      onEnd: options.onEnd,
      onError: options.onError,
    });

    return { usedNatural: false };
  }

  public playAudioUrl(
    url: string,
    options: {
      volume?: number;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    } = {}
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.stop('playAudioUrl requested');

      try {
        const audio = new Audio(url);
        audio.volume = options.volume ?? 1.0;
        this.currentAudio = audio;
        this.isSpeakingState = true;

        audio.onended = () => {
          this.isSpeakingState = false;
          this.currentAudio = null;
          options.onEnd?.();
          resolve(true);
        };

        audio.onerror = (e) => {
          this.isSpeakingState = false;
          this.currentAudio = null;
          options.onError?.(e);
          resolve(false);
        };

        audio
          .play()
          .then(() => {
            resolve(true);
          })
          .catch((err) => {
            console.warn('Audio playback error', err);
            this.isSpeakingState = false;
            this.currentAudio = null;
            options.onError?.(err);
            resolve(false);
          });
      } catch (e) {
        this.isSpeakingState = false;
        options.onError?.(e);
        resolve(false);
      }
    });
  }

  public speak(
    text: string,
    options: {
      rate?: number;
      volume?: number;
      voiceURI?: string;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    } = {}
  ) {
    if (!this.isAvailable()) {
      this.logDiagnostic('error', 'SpeechSynthesis API is not supported in this browser environment.');
      options.onError?.(new Error('SpeechSynthesis not available in this browser.'));
      return;
    }

    this.retryAttempted = false;

    if (!text || !text.trim()) {
      this.logDiagnostic('warn', 'Empty text provided to speak(). Operation skipped.');
      return;
    }

    const synth = window.speechSynthesis;
    const spokenText = convertChessNotationToSpokenText(text);

    this.logDiagnostic(
      'trigger',
      `Queueing SpeechSynthesis utterance: "${spokenText.slice(0, 60)}${spokenText.length > 60 ? '...' : ''}"`,
      {
        volume: options.volume ?? 1.0,
        rate: options.rate ?? 1.0,
        synthSpeaking: synth.speaking,
        synthPaused: synth.paused,
        synthPending: synth.pending,
        voicesLoaded: this.voices.length,
      }
    );

    if ((options.volume ?? 1.0) <= 0) {
      this.logDiagnostic('warn', 'Utterance volume is set to 0.0 (silent). No sound will be emitted.');
    }

    // Stop current speech cleanly without triggering an immediate cancellation race
    this.stop('Replacing with new utterance');

    if (synth.paused) {
      this.logDiagnostic('info', 'Synthesizer was paused; calling resume().');
      synth.resume();
    }

    // Schedule utterance with a safe delay so Chromium's cancel clears the audio buffer
    this.cancelTimeout = setTimeout(() => {
      try {
        if (synth.paused) {
          synth.resume();
        }

        const utterance = new SpeechSynthesisUtterance(spokenText);
        utterance.lang = 'en-US';
        utterance.rate = options.rate ?? 1.0;
        utterance.volume = options.volume ?? 1.0;

        const allVoices = this.getVoices();
        if (options.voiceURI) {
          const match = allVoices.find((v) => v.voiceURI === options.voiceURI);
          if (match) utterance.voice = match;
        } else if (allVoices.length > 0) {
          const enVoice =
            allVoices.find(
              (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Natural') ||
                  v.name.includes('Google') ||
                  v.name.includes('Samantha') ||
                  v.name.includes('Daniel') ||
                  v.name.includes('Alex'))
            ) || allVoices.find((v) => v.lang.startsWith('en'));
          if (enVoice) utterance.voice = enVoice;
        }

        this.logDiagnostic(
          'info',
          `Configured utterance: voice="${utterance.voice?.name || 'Default'}" (${utterance.voice?.lang || 'en-US'}), vol=${utterance.volume}, rate=${utterance.rate}`
        );

        utterance.onstart = () => {
          this.isSpeakingState = true;
          this.logDiagnostic('start', 'SpeechSynthesis onstart event fired (audio playback actively started).', {
            textPreview: spokenText.slice(0, 40),
            voice: utterance.voice?.name,
          });
          options.onStart?.();

          // Watchdog: only resume if paused (never call pause()!)
          if (this.resumeInterval) clearInterval(this.resumeInterval);
          this.resumeInterval = setInterval(() => {
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
              if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
                this.logDiagnostic('info', 'Synthesizer paused during speech; calling resume() to unblock.');
                window.speechSynthesis.resume();
              }
            }
          }, 2000);
        };

        utterance.onend = () => {
          if (this.resumeInterval) {
            clearInterval(this.resumeInterval);
            this.resumeInterval = null;
          }
          this.activeUtterances.delete(utterance);
          this.isSpeakingState = false;
          this.currentUtterance = null;
          this.logDiagnostic('end', 'SpeechSynthesis onend event fired (playback completed successfully).');
          options.onEnd?.();
        };

        utterance.onerror = (e: any) => {
          if (this.resumeInterval) {
            clearInterval(this.resumeInterval);
            this.resumeInterval = null;
          }
          this.activeUtterances.delete(utterance);
          this.isSpeakingState = false;
          this.currentUtterance = null;

          const errCode = e?.error || 'unknown';
          let explanation = '';
          if (errCode === 'not-allowed') {
            explanation = 'BLOCKED by browser autoplay / permission policy. User must tap the page / test button to allow speech synthesis in this frame.';
          } else if (errCode === 'synthesis-failed') {
            if (!this.retryAttempted) {
              this.retryAttempted = true;
              this.logDiagnostic('info', 'synthesis-failed error detected, retrying once in 500ms...');
              setTimeout(() => this.speak(spokenText, options), 500);
              return;
            }
            explanation = 'Browser speech synthesis engine failed to render audio stream (common in headless/sandboxed frames).';
          } else if (errCode === 'canceled') {
            explanation = 'CANCELLED: speechSynthesis.cancel() was called or speech was pre-empted.';
          } else if (errCode === 'interrupted') {
            explanation = 'INTERRUPTED: another utterance or audio source interrupted playback.';
          } else if (errCode === 'audio-busy') {
            explanation = 'AUDIO BUSY: audio device locked by another process.';
          } else {
            explanation = `Code: ${errCode}`;
          }

          const isNonFatal = errCode === 'canceled' || errCode === 'interrupted' || errCode === 'synthesis-failed';
          this.logDiagnostic(
            isNonFatal ? 'warn' : 'error',
            `SpeechSynthesis onerror event fired: [${errCode}] - ${explanation}`,
            {
              error: errCode,
              elapsedTime: e?.elapsedTime,
            }
          );
          options.onError?.(e);
        };

        this.currentUtterance = utterance;
        this.activeUtterances.add(utterance);
        (window as any).__lastUtterance = utterance;

        this.logDiagnostic('info', 'Dispatched window.speechSynthesis.speak(). Waiting for audio output...');
        synth.speak(utterance);

        if (synth.paused) {
          synth.resume();
        }
      } catch (err: any) {
        this.logDiagnostic('error', `Exception while calling speechSynthesis.speak: ${err?.message || err}`, {
          error: err,
        });
        this.isSpeakingState = false;
        options.onError?.(err);
      }
    }, 80);
  }
}

export const speechService = new SpeechService();
