/**
 * Speech service providing unified Text-to-Speech (TTS) dispatching with Edge Neural TTS,
 * phonetic chess notation parsing, and browser speech synthesis fallback.
 * Gemini API is NOT used for TTS.
 */

import { AppSettings } from '../types/chess';
import { geminiService, getGeminiVoiceApiKey } from './geminiService';
import { soundService } from './audioService';
import {
  formatChessTextForSpeech,
  speak as speakWithEdgeOrBrowser,
  stopSpeech,
  synthesizeEdgeNeuralAudio,
  findNativeEdgeNeuralVoice,
} from '../utils/voice';

export function convertChessNotationToSpokenText(text: string): string {
  return formatChessTextForSpeech(text);
}

export type SpeechErrorType =
  | 'voice_disabled'
  | 'missing_key'
  | 'rate_limit'
  | 'api_failure'
  | 'timeout'
  | 'unsupported_browser_speech'
  | 'audio_playback_failure';

export interface SpeechDispatchResult {
  success: boolean;
  usedNatural: boolean;
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
  onStart?: () => void;
  onFirstAudio?: (timeToFirstAudioMs: number) => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

class SpeechService {
  private isSpeakingState: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingTimer: NodeJS.Timeout | null = null;
  private isRecordingState: boolean = false;
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

  /**
   * Stops all active audio playback cleanly across Web Audio, Edge Neural HTMLAudioElement, and browser speech synthesis.
   */
  public stop(reason: string = 'User requested stop') {
    soundService.stopActiveSpeech(40);
    stopSpeech();
    this.isSpeakingState = false;
    this.logDiagnostic('info', `Stopped active audio playback smoothly (${reason}).`);
  }

  /**
   * Standard Device TTS (100% Offline) using browser's SpeechSynthesis API.
   */
  public async speakWithBrowserSpeech(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    const callStartTime = Date.now();
    const res = await speakWithEdgeOrBrowser(text, true, {
      ttsEngine: 'browser',
      edgeVoice: settings.edgeVoice || 'en-US-AndrewNeural',
      rate: settings.voiceRate,
      volume: settings.voiceVolume,
      onStart: () => {
        this.isSpeakingState = true;
        const firstMs = Date.now() - callStartTime;
        options.onFirstAudio?.(firstMs);
        options.onStart?.();
        this.logDiagnostic('start', 'Browser speech synthesis playback started.');
      },
      onEnd: () => {
        this.isSpeakingState = false;
        this.logDiagnostic('end', 'Browser speech synthesis finished.');
        options.onEnd?.();
      },
      onError: (err) => {
        this.isSpeakingState = false;
        this.logDiagnostic('error', err.message);
        options.onError?.(err);
      },
    });

    return {
      success: res.success,
      usedNatural: false,
      timeToFirstAudioMs: Date.now() - callStartTime,
      ...(res.success ? {} : { error: 'Browser speech synthesis unavailable', errorType: 'unsupported_browser_speech' }),
    };
  }

  /**
   * Plays instant cached verdict phrase ("Great move.", "Good move.", "Inaccuracy.", "Mistake.", "Blunder.")
   * using Edge Neural TTS cache or native neural voice.
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
   * Pre-warms short verdict clips into the Edge Neural in-memory ObjectURL cache.
   */
  public async pregenerateVerdictPhrases(settings: AppSettings): Promise<void> {
    if (!settings.voiceEnabled) return;
    const engine = settings.ttsEngine || (settings.useNaturalVoice ? 'edge' : 'browser');
    if (engine !== 'edge') return;

    const edgeVoice = settings.edgeVoice || 'en-US-AndrewNeural';
    if (findNativeEdgeNeuralVoice(edgeVoice)) {
      // Native Microsoft Natural voice is installed in browser; zero-latency without network pre-fetch
      return;
    }

    const phrases = ['Great move.', 'Good move.', 'Inaccuracy.', 'Mistake.', 'Blunder.'];
    for (const phrase of phrases) {
      try {
        await synthesizeEdgeNeuralAudio(phrase, edgeVoice, settings.voiceRate || 1.0);
      } catch {
        // Ignore offline/network errors during background warm-up
      }
    }
  }

  /**
   * Universal Speech Dispatcher:
   * Single entrypoint for all coach speech (chat drawer, live coach, hint requests, sample move).
   * Uses Edge Neural TTS when ttsEngine === 'edge' (with graceful fallback to local browser speech),
   * or Standard Device TTS when ttsEngine === 'browser'.
   */
  public async speakWithCoach(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    const engine = settings.ttsEngine || (settings.useNaturalVoice === false ? 'browser' : 'edge');
    const edgeVoice = settings.edgeVoice || settings.geminiVoice || 'en-US-AndrewNeural';

    this.logDiagnostic('trigger', `speakWithCoach invoked: "${text.slice(0, 50)}..."`, {
      voiceEnabled: settings.voiceEnabled,
      ttsEngine: engine,
      edgeVoice,
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
      return { success: true, usedNatural: false };
    }

    const callStartTime = Date.now();
    let firstAudioMs = 0;

    const result = await speakWithEdgeOrBrowser(text, true, {
      ttsEngine: engine,
      edgeVoice,
      rate: settings.voiceRate,
      volume: settings.voiceVolume,
      onStart: () => {
        this.isSpeakingState = true;
        firstAudioMs = Date.now() - callStartTime;
        options.onFirstAudio?.(firstAudioMs);
        options.onStart?.();
        this.logDiagnostic('start', `Coach speech playback started (${engine}: ${edgeVoice}) in ${firstAudioMs} ms.`);
      },
      onEnd: () => {
        this.isSpeakingState = false;
        this.logDiagnostic('end', 'Coach speech playback finished.');
        options.onEnd?.();
      },
      onError: (err) => {
        this.isSpeakingState = false;
        this.logDiagnostic('error', `Coach speech error: ${err.message}`);
        options.onError?.(err);
      },
    });

    return {
      success: result.success,
      usedNatural: result.usedEdgeNeural,
      timeToFirstAudioMs: firstAudioMs || Date.now() - callStartTime,
      ...(result.success ? {} : { error: 'Speech playback unavailable on this device', errorType: 'unsupported_browser_speech' }),
    };
  }

  public async speak(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    return this.speakWithCoach(text, settings, options);
  }

  // --- Microphone Recording & Speech-to-Text (STT) ---

  public isRecording(): boolean {
    return this.isRecordingState;
  }

  public async startRecording(maxDurationMs: number = 30000): Promise<void> {
    if (this.isRecordingState) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('NotFoundError: Microphone access is not supported in this browser environment.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordedChunks = [];

      const options: MediaRecorderOptions = {};
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm')) options.mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) options.mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/wav')) options.mimeType = 'audio/wav';
      }

      this.mediaRecorder = new MediaRecorder(stream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      this.isRecordingState = true;
      this.logDiagnostic('info', 'Microphone recording started (max 30s)...');

      if (this.recordingTimer) clearTimeout(this.recordingTimer);
      this.recordingTimer = setTimeout(() => {
        if (this.isRecordingState) {
          this.logDiagnostic('info', 'Max 30s recording duration reached. Auto stopping recording...');
          this.stopRecording().catch(() => {});
        }
      }, maxDurationMs);
    } catch (err: any) {
      this.isRecordingState = false;
      this.logDiagnostic('error', `Microphone permission/access error: ${err?.name || err?.message || err}`);
      throw err;
    }
  }

  public async stopRecording(): Promise<Blob> {
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

    if (!this.mediaRecorder || !this.isRecordingState) {
      this.isRecordingState = false;
      return new Blob([], { type: 'audio/webm' });
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        this.isRecordingState = false;
        resolve(new Blob([], { type: 'audio/webm' }));
        return;
      }

      const recorder = this.mediaRecorder;
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        this.isRecordingState = false;

        try {
          recorder.stream.getTracks().forEach((track) => track.stop());
        } catch {
          // Ignored
        }

        this.logDiagnostic('info', `Microphone recording stopped (${blob.size} bytes).`);
        resolve(blob);
      };

      recorder.onerror = (e: any) => {
        this.isRecordingState = false;
        reject(e?.error || new Error('MediaRecorder error'));
      };

      try {
        recorder.stop();
      } catch {
        this.isRecordingState = false;
        const mimeType = recorder.mimeType || 'audio/webm';
        resolve(new Blob(this.recordedChunks, { type: mimeType }));
      }
    });
  }

  public async testMicrophone(customKey?: string): Promise<{ success: boolean; transcript?: string; error?: string }> {
    this.logDiagnostic('info', 'Testing microphone for 3 seconds...');
    try {
      await this.startRecording(3000);
      await new Promise((res) => setTimeout(res, 3000));
      const audioBlob = await this.stopRecording();

      if (!audioBlob || audioBlob.size === 0) {
        return { success: false, error: 'No audio recorded from microphone.' };
      }

      const apiKey = getGeminiVoiceApiKey(customKey);
      this.logDiagnostic('info', 'Transcribing 3s test audio with Gemini STT...');
      const res = await geminiService.transcribeAudio(audioBlob, audioBlob.type, apiKey);
      return res;
    } catch (e: any) {
      const errName = e?.name || '';
      const errMsg = e?.message || '';

      if (errName === 'NotAllowedError' || errMsg.includes('Permission denied')) {
        return { success: false, error: 'Permission denied: Microphone access was blocked by the browser or system.' };
      }
      if (errName === 'NotFoundError' || errMsg.includes('DevicesNotFound')) {
        return { success: false, error: 'No microphone found on this device.' };
      }
      if (errMsg.includes('NO_KEY')) {
        return { success: false, error: 'No Gemini API key found for audio transcription.' };
      }
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        return { success: false, error: 'Gemini quota reached (429). Please wait a moment.' };
      }
      if (errMsg.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return { success: false, error: 'Offline: No internet connection for transcription.' };
      }

      return { success: false, error: `Microphone test error: ${errMsg || errName}` };
    }
  }
}

export const speechService = new SpeechService();
