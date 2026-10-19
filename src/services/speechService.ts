/**
 * Speech service providing unified Text-to-Speech (TTS) dispatching with phonetic chess notation parsing,
 * IndexedDB audio caching, streaming voice, ordinary natural Gemini TTS, and browser speech synthesis fallback.
 * Strictly stops prior utterances before speaking and reports typed, descriptive failure reasons.
 */

import { AppSettings } from '../types/chess';
import { geminiService, getGeminiVoiceApiKey } from './geminiService';
import { soundService } from './audioService';
import { audioCacheService } from './audioCacheService';

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
  private currentAudio: HTMLAudioElement | null = null;
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
   * Stops all active audio playback cleanly across Web Audio, HTML5 audio, and browser speech synthesis.
   */
  public stop(reason: string = 'User requested stop') {
    soundService.stopActiveSpeech(40);

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        // Ignored
      }
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignored
      }
    }

    this.isSpeakingState = false;
    this.logDiagnostic('info', `Stopped active audio playback smoothly (${reason}).`);
  }

  /**
   * Fallback using browser's native SpeechSynthesis API when Gemini Natural Voice is disabled or unavailable.
   */
  public speakWithBrowserSpeech(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      const err = 'Browser speech synthesis is not supported on this device.';
      this.logDiagnostic('error', err);
      options.onError?.(new Error(err));
      return Promise.resolve({
        success: false,
        usedNatural: false,
        error: err,
        errorType: 'unsupported_browser_speech',
      });
    }

    return new Promise((resolve) => {
      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = Math.max(0.5, Math.min(2.0, settings.voiceRate || 1.0));
        utterance.volume = Math.max(0, Math.min(1.0, settings.voiceVolume ?? 1.0));
        utterance.pitch = 1.0;

        let hasStarted = false;
        utterance.onstart = () => {
          hasStarted = true;
          this.isSpeakingState = true;
          options.onStart?.();
          this.logDiagnostic('start', 'Browser speech synthesis playback started.');
        };

        utterance.onend = () => {
          this.isSpeakingState = false;
          this.logDiagnostic('end', 'Browser speech synthesis finished.');
          options.onEnd?.();
          resolve({ success: true, usedNatural: false });
        };

        utterance.onerror = (e) => {
          this.isSpeakingState = false;
          // Normal cancelation on stop or replacement
          if (e.error === 'canceled' || e.error === 'interrupted') {
            resolve({ success: true, usedNatural: false });
            return;
          }
          const errMsg = `Browser speech error: ${e.error || 'Playback failed'}`;
          this.logDiagnostic('error', errMsg);
          options.onError?.(new Error(errMsg));
          resolve({
            success: false,
            usedNatural: false,
            error: errMsg,
            errorType: 'audio_playback_failure',
          });
        };

        window.speechSynthesis.speak(utterance);
      } catch (err: any) {
        this.isSpeakingState = false;
        const msg = err?.message || 'Failed to start browser speech synthesis';
        options.onError?.(err);
        resolve({
          success: false,
          usedNatural: false,
          error: msg,
          errorType: 'audio_playback_failure',
        });
      }
    });
  }

  /**
   * Plays instant cached verdict phrase ("Great move.", "Good move.", "Inaccuracy.", "Mistake.", "Blunder.")
   * directly from IndexedDB without making any network API calls.
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
    const voice = settings.geminiVoice || 'Kore';

    try {
      const cached = await audioCacheService.getClip(phrase, voice);
      if (cached) {
        this.logDiagnostic('start', `Playing instant cached verdict audio: "${phrase}"`);
        await soundService.playAudioArrayBuffer(
          cached,
          settings.voiceVolume,
          undefined,
          settings.voiceRate
        );
        return true;
      } else {
        const apiKey = getGeminiVoiceApiKey(settings.geminiApiKey);
        if (apiKey) {
          const res = await geminiService.generateNaturalVoice(phrase, apiKey);
          if (res.success && res.audioBuffer) {
            await soundService.playAudioArrayBuffer(
              res.audioBuffer,
              settings.voiceVolume,
              undefined,
              settings.voiceRate
            );
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('speakVerdictInstant error:', e);
    }
    return false;
  }

  /**
   * Pre-generates short verdict clips into IndexedDB in the background.
   */
  public async pregenerateVerdictPhrases(settings: AppSettings): Promise<void> {
    const voice = settings.geminiVoice || 'Kore';
    const apiKey = getGeminiVoiceApiKey(settings.geminiApiKey);
    if (!apiKey) return;

    await audioCacheService.pregenerateVerdictPhrases(voice, (text) =>
      geminiService.generateNaturalVoice(text, apiKey)
    );
  }

  /**
   * Speaks coach explanation using Gemini STREAMING TTS.
   * Schedules PCM chunks as they arrive so first audio starts in ~1 second.
   */
  public async speakWithCoachStream(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    if (!settings.voiceEnabled) {
      return { success: false, usedNatural: false, timeToFirstAudioMs: 0, error: 'Voice disabled in Settings', errorType: 'voice_disabled' };
    }

    if (!text || !text.trim()) {
      return { success: true, usedNatural: false, timeToFirstAudioMs: 0 };
    }

    const spokenText = convertChessNotationToSpokenText(text);
    const callStartTime = Date.now();
    let firstAudioTimeMs = 0;

    const streamSession = soundService.createPcmStreamSession(
      settings.voiceVolume,
      settings.voiceRate
    );

    options.onStart?.();
    this.isSpeakingState = true;

    try {
      const apiKey = getGeminiVoiceApiKey(settings.geminiApiKey);
      const res = await geminiService.generateNaturalVoiceStream(
        spokenText,
        (pcmChunk) => {
          streamSession.pushChunk(pcmChunk);
          if (!firstAudioTimeMs) {
            firstAudioTimeMs = Date.now() - callStartTime;
            options.onFirstAudio?.(firstAudioTimeMs);
            this.logDiagnostic('start', `Streaming TTS first audio started in ${firstAudioTimeMs} ms.`);
          }
        },
        apiKey
      );

      if (res.success) {
        this.isSpeakingState = false;
        options.onEnd?.();
        return {
          success: true,
          usedNatural: true,
          timeToFirstAudioMs: firstAudioTimeMs || (Date.now() - callStartTime),
        };
      }

      this.logDiagnostic('warn', `Streaming TTS failed (${res.error}), falling back to unary TTS`);
      return await this.speakWithCoachUnary(text, settings, options);
    } catch (err: any) {
      this.isSpeakingState = false;
      this.logDiagnostic('error', `Streaming TTS exception: ${err?.message || err}`);
      return await this.speakWithCoachUnary(text, settings, options);
    }
  }

  /**
   * Unary Gemini Natural Voice TTS:
   * Generates complete audio WAV via Gemini API, caches it in IndexedDB, and plays via Web Audio.
   */
  public async speakWithCoachUnary(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    const spokenText = convertChessNotationToSpokenText(text);
    const apiKey = getGeminiVoiceApiKey(settings.geminiApiKey);

    if (!apiKey) {
      const err = 'No Gemini API key configured for Natural Voice TTS.';
      this.logDiagnostic('warn', err);
      return { success: false, usedNatural: false, error: err, errorType: 'missing_key' };
    }

    try {
      options.onStart?.();
      this.isSpeakingState = true;

      const result = await geminiService.generateNaturalVoice(spokenText, apiKey);

      if (result.success && result.audioBuffer) {
        this.logDiagnostic('start', `Gemini TTS audio received (${result.audioBuffer.byteLength} bytes). Playing at ${settings.voiceRate}x speed...`);
        const played = await soundService.playAudioArrayBuffer(
          result.audioBuffer,
          settings.voiceVolume,
          () => {
            this.isSpeakingState = false;
            this.logDiagnostic('end', 'Gemini TTS audio playback finished.');
            options.onEnd?.();
          },
          settings.voiceRate
        );

        if (played) {
          return { success: true, usedNatural: true };
        }
        this.isSpeakingState = false;
        const errStr = 'Web Audio / HTML5 playback failed on this device.';
        this.logDiagnostic('error', errStr);
        options.onError?.(new Error(errStr));
        return { success: false, usedNatural: false, error: errStr, errorType: 'audio_playback_failure' };
      } else {
        this.isSpeakingState = false;
        const errStr = result.error || 'Gemini TTS audio generation failed.';
        const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
        const isApiKey = errStr.includes('401') || errStr.includes('403') || errStr.includes('API_KEY_INVALID');
        const errorType: SpeechErrorType = isRateLimit ? 'rate_limit' : isApiKey ? 'api_failure' : 'api_failure';

        this.logDiagnostic('error', `Gemini TTS error: "${errStr}"`);
        options.onError?.(new Error(errStr));
        return { success: false, usedNatural: false, error: errStr, errorType };
      }
    } catch (err: any) {
      this.isSpeakingState = false;
      const errStr = err?.message || 'Gemini TTS exception occurred.';
      const isRateLimit = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED');
      const isTimeout = errStr.includes('timeout') || errStr.includes('timed out');
      const errorType: SpeechErrorType = isRateLimit ? 'rate_limit' : isTimeout ? 'timeout' : 'api_failure';

      this.logDiagnostic('error', `Gemini TTS exception: "${errStr}"`);
      options.onError?.(err);
      return { success: false, usedNatural: false, error: errStr, errorType };
    }
  }

  /**
   * Universal Speech Dispatcher:
   * Single entrypoint for all coach speech (chat drawer, live coach, hint requests, sample move).
   * Honors settings:
   * 1. If voice is disabled -> returns voice_disabled.
   * 2. Always stops previous utterance cleanly before starting.
   * 3. If useNaturalVoice is true:
   *    - Checks for Gemini voice credentials. If none, falls back to browser speech synthesis.
   *    - If credentials exist, dispatches to streaming voice (if enabled) or unary TTS.
   *    - If Gemini voice fails, falls back gracefully to browser speech synthesis.
   * 4. If useNaturalVoice is false:
   *    - Directly uses browser speech synthesis.
   * Returns explicit typed result and descriptive errors.
   */
  public async speakWithCoach(
    text: string,
    settings: AppSettings,
    options: SpeechDispatchOptions = {}
  ): Promise<SpeechDispatchResult> {
    this.logDiagnostic('trigger', `speakWithCoach invoked: "${text.slice(0, 50)}..."`, {
      voiceEnabled: settings.voiceEnabled,
      useNaturalVoice: settings.useNaturalVoice,
      streamingVoice: settings.streamingVoice,
      hasGeminiVoiceKey: !!getGeminiVoiceApiKey(settings.geminiApiKey),
    });

    if (!settings.voiceEnabled) {
      this.logDiagnostic('blocked', 'Voice is muted/disabled in Settings.');
      options.onError?.(new Error('Voice Coach is disabled in Settings'));
      return { success: false, usedNatural: false, error: 'Voice is muted in Settings', errorType: 'voice_disabled' };
    }

    if (!text || !text.trim()) {
      return { success: true, usedNatural: false };
    }

    // Always stop previous utterance smoothly
    this.stop('Replacing with new utterance');

    const spokenText = convertChessNotationToSpokenText(text);

    // Path 1: User explicitly enabled Natural Voice (Gemini TTS)
    if (settings.useNaturalVoice) {
      const apiKey = getGeminiVoiceApiKey(settings.geminiApiKey);

      if (!apiKey) {
        // No Gemini key: fall back to browser speech synthesis if available
        this.logDiagnostic('warn', 'No Gemini key for Natural Voice; falling back to browser speech synthesis.');
        const fallbackRes = await this.speakWithBrowserSpeech(spokenText, settings, options);
        if (fallbackRes.success) {
          return { success: true, usedNatural: false };
        }
        return {
          success: false,
          usedNatural: false,
          error: 'No Gemini API key found for natural voice, and browser speech is unavailable.',
          errorType: 'missing_key',
        };
      }

      // Gemini key present: use Streaming or Unary TTS
      let res: SpeechDispatchResult;
      if (settings.streamingVoice) {
        res = await this.speakWithCoachStream(spokenText, settings, options);
      } else {
        res = await this.speakWithCoachUnary(spokenText, settings, options);
      }

      if (res.success) {
        return res;
      }

      // If Gemini TTS failed, attempt browser speech synthesis fallback so user still hears audio
      this.logDiagnostic('warn', `Gemini voice failed (${res.error}); falling back to browser speech synthesis.`);
      const browserFallback = await this.speakWithBrowserSpeech(spokenText, settings, options);
      if (browserFallback.success) {
        return {
          success: true,
          usedNatural: false,
          error: `Natural voice failed (${res.error}); used browser speech`,
        };
      }

      // Both natural voice and browser fallback failed: return root cause error
      return res;
    }

    // Path 2: Browser Speech Synthesis (when useNaturalVoice is false)
    return await this.speakWithBrowserSpeech(spokenText, settings, options);
  }

  /**
   * Alias for speakWithCoach to support universal dispatcher interface.
   */
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

        // Release mic hardware
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

  /**
   * Tests the microphone by recording 3 seconds of audio, sending it to Gemini STT,
   * and returning the transcript or a human-friendly error message.
   */
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
