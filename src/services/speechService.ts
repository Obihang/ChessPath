/**
 * Speech service providing unified MS Edge Neural Text-to-Speech (TTS) dispatching
 * via the hardcoded https://chesspath-tts.vercel.app/tts endpoint.
 */

import { AppSettings } from '../types/chess';
import { DEFAULT_EDGE_TTS_URL, DEFAULT_EDGE_VOICE } from '../constants/aiModels';
import { soundService } from './audioService';
import {
  formatChessTextForSpeech,
  speak as dispatchSpeak,
  stopSpeech,
} from '../utils/voice';

export { DEFAULT_EDGE_TTS_URL, DEFAULT_EDGE_VOICE };

export function convertChessNotationToSpokenText(text: string): string {
  return formatChessTextForSpeech(text);
}

export type SpeechErrorType =
  | 'voice_disabled'
  | 'rate_limit'
  | 'api_failure'
  | 'timeout'
  | 'audio_playback_failure';

export interface SpeechDispatchResult {
  success: boolean;
  usedNatural: boolean;
  aborted?: boolean;
  timeToFirstAudioMs?: number;
  error?: string;
  errorType?: SpeechErrorType;
}

export interface SpeechDiagnosticEntry {
  id: string;
  time: string;
  type: 'info' | 'trigger' | 'start' | 'end' | 'error' | 'blocked' | 'warn';
  message: string;
  details?: Record<string, any>;
}

export interface SpeechDispatchOptions {
  signal?: AbortSignal;
  onStart?: () => void;
  onFirstAudio?: (timeToFirstAudioMs: number) => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

class SpeechService {
  private isSpeakingState: boolean = false;
  private diagnosticLogs: SpeechDiagnosticEntry[] = [];
  private diagnosticListeners: Set<() => void> = new Set();

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
  }

  public subscribeDiagnostics(listener: () => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  public unlock() {
    soundService.initCtx();
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public stop(reason: string = 'User requested stop') {
    stopSpeech();
    this.isSpeakingState = false;
    this.logDiagnostic('info', `Stopped active audio playback (${reason}).`);
  }

  /**
   * Plays instant verdict phrase ("Great move.", "Good move.", "Inaccuracy.", "Mistake.", "Blunder.")
   * using MS Edge Neural TTS with in-memory LRU caching.
   */
  public async speakVerdictInstant(
    classification: 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'unavailable',
    settings: AppSettings
  ): Promise<boolean> {
    if (!settings.voiceEnabled || classification === 'unavailable') return false;

    const phraseMap: Record<string, string> = {
      great: 'Great move.',
      good: 'Good move.',
      inaccuracy: 'Inaccuracy.',
      mistake: 'Mistake.',
      blunder: 'Blunder.',
    };

    const phrase = phraseMap[classification];
    if (!phrase) return false;

    try {
      const res = await this.speakWithCoach(phrase, settings);
      return res.success;
    } catch {
      return false;
    }
  }

  /**
   * Universal Speech Dispatcher:
   * Single entrypoint for all coach speech (live coach, hint requests, Settings test).
   */
  public async speakWithCoach(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    if (options.signal?.aborted) {
      return { success: false, usedNatural: false, aborted: true };
    }

    const edgeVoice = settings.edgeVoice || DEFAULT_EDGE_VOICE;

    this.logDiagnostic('trigger', `speakWithCoach invoked: "${text.slice(0, 50)}..."`, {
      voiceEnabled: settings.voiceEnabled,
      voice: edgeVoice,
    });

    if (!settings.voiceEnabled) {
      this.logDiagnostic('blocked', 'Voice is muted/disabled in Settings.');
      options.onError?.(new Error('Voice Coach is disabled in Settings'));
      return {
        success: false,
        usedNatural: false,
        error: 'Voice is muted in Settings',
        errorType: 'voice_disabled',
      };
    }

    if (!text || !text.trim()) {
      return { success: true, usedNatural: true };
    }

    const callStartTime = Date.now();
    let firstAudioMs = 0;

    const result = await dispatchSpeak(text, true, {
      edgeVoice,
      rate: settings.voiceRate,
      volume: settings.voiceVolume,
      signal: options.signal,
      onStart: () => {
        this.isSpeakingState = true;
        firstAudioMs = Date.now() - callStartTime;
        options.onFirstAudio?.(firstAudioMs);
        options.onStart?.();
        this.logDiagnostic('start', `MS Edge Neural TTS started (${edgeVoice}) in ${firstAudioMs} ms.`);
      },
      onEnd: () => {
        this.isSpeakingState = false;
        this.logDiagnostic('end', 'MS Edge Neural TTS playback finished.');
        options.onEnd?.();
      },
      onError: (err) => {
        this.isSpeakingState = false;
        this.logDiagnostic('warn', `MS Edge Neural TTS unavailable: ${err.message}`);
        options.onError?.(err);
      },
    });

    if (result.aborted) {
      this.isSpeakingState = false;
      return { success: false, usedNatural: false, aborted: true };
    }

    return {
      success: result.success,
      usedNatural: result.usedNatural,
      timeToFirstAudioMs: firstAudioMs || Date.now() - callStartTime,
      ...(result.success
        ? {}
        : {
            error: result.error || 'Speech playback unavailable.',
            errorType: 'api_failure',
          }),
    };
  }

  public async speak(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    return this.speakWithCoach(text, settings, options);
  }
}

export const speechService = new SpeechService();
