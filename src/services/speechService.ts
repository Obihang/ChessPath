/**
 * Speech service providing unified Text-to-Speech (TTS) dispatching:
 * - Default: Gemini TTS (@google/genai with PCM trim/fade pipeline and IndexedDB caching)
 * - Optional: Edge Neural TTS via user-configured HTTPS Voice Proxy URL (falls back to Gemini TTS with exact error if proxy fails)
 * - Offline option: Browser SpeechSynthesis
 */

import { AppSettings } from '../types/chess';
import { geminiService, getGeminiVoiceApiKey } from './geminiService';
import { soundService } from './audioService';
import { audioCacheService } from './audioCacheService';
import { isValidHttpsProxyUrl } from './storageService';
import {
  formatChessTextForSpeech,
  speak as dispatchSpeak,
  stopSpeech,
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
  proxyWarning?: string;
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

  public stop(reason: string = 'User requested stop') {
    soundService.stopActiveSpeech(40);
    stopSpeech();
    this.isSpeakingState = false;
    this.logDiagnostic('info', `Stopped active audio playback smoothly (${reason}).`);
  }

  public async speakWithBrowserSpeech(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    const callStartTime = Date.now();
    const res = await dispatchSpeak(text, true, {
      ttsEngine: 'browser',
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
      ...(res.success
        ? {}
        : {
            error: res.error || 'Browser speech synthesis unavailable',
            errorType: 'unsupported_browser_speech',
          }),
    };
  }

  /**
   * Plays instant cached verdict phrase ("Great move.", "Good move.", "Inaccuracy.", "Mistake.", "Blunder.")
   * using IndexedDB cached Gemini TTS or active speech engine.
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
   * Pre-generates and caches short verdict phrases in IndexedDB when Gemini TTS is active and a Gemini key is configured.
   */
  public async pregenerateVerdictPhrases(settings: AppSettings): Promise<void> {
    if (!settings.voiceEnabled) return;
    if (settings.ttsEngine !== 'gemini') return;
    if (!geminiService.hasGeminiVoiceKey()) return;

    const voice = settings.geminiVoice || 'Kore';
    await audioCacheService.pregenerateVerdictPhrases(voice, (phrase) =>
      geminiService.generateSpeech(phrase, voice)
    );
  }

  /**
   * Universal Speech Dispatcher:
   * Single entrypoint for all coach speech (chat drawer, live coach, hint requests, sample move).
   */
  public async speakWithCoach(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    const hasProxy = isValidHttpsProxyUrl(settings.voiceProxyUrl);
    const engine =
      settings.ttsEngine === 'edge' && !hasProxy
        ? 'gemini'
        : settings.ttsEngine || 'gemini';
    const voiceLabel =
      engine === 'edge'
        ? settings.edgeVoice || 'en-US-AndrewNeural'
        : engine === 'gemini'
        ? settings.geminiVoice || 'Kore'
        : 'Browser Default';

    this.logDiagnostic('trigger', `speakWithCoach invoked: "${text.slice(0, 50)}..."`, {
      voiceEnabled: settings.voiceEnabled,
      ttsEngine: engine,
      voice: voiceLabel,
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

    const result = await dispatchSpeak(text, true, {
      ttsEngine: engine,
      geminiVoice: settings.geminiVoice || 'Kore',
      edgeVoice: settings.edgeVoice || 'en-US-AndrewNeural',
      voiceProxyUrl: settings.voiceProxyUrl || '',
      rate: settings.voiceRate,
      volume: settings.voiceVolume,
      onStart: () => {
        this.isSpeakingState = true;
        firstAudioMs = Date.now() - callStartTime;
        options.onFirstAudio?.(firstAudioMs);
        options.onStart?.();
        this.logDiagnostic(
          'start',
          `Coach speech playback started (${engine}: ${voiceLabel}) in ${firstAudioMs} ms.`
        );
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

    if (result.proxyWarning) {
      this.logDiagnostic('warn', result.proxyWarning);
    }

    return {
      success: result.success,
      usedNatural: result.usedNatural,
      timeToFirstAudioMs: firstAudioMs || Date.now() - callStartTime,
      ...(result.proxyWarning ? { proxyWarning: result.proxyWarning } : {}),
      ...(result.success
        ? {}
        : {
            error: result.error || 'Speech playback failed.',
            errorType: result.error?.includes('API key') ? 'missing_key' : 'api_failure',
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
