/**
 * Speech service providing Gemini-only Text-to-Speech (TTS) with phonetic chess notation parsing,
 * IndexedDB audio caching, playback rate control, and MediaRecorder microphone STT transcription.
 * Fully static - zero server required. No browser speech synthesis or native web speech API used.
 */

import { AppSettings } from '../types/chess';
import { geminiService } from './geminiService';
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

export interface SpeechDiagnosticEntry {
  id: string;
  time: string;
  type: 'info' | 'trigger' | 'start' | 'end' | 'error' | 'blocked' | 'warn';
  message: string;
  details?: Record<string, any>;
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
    this.isSpeakingState = false;
    this.logDiagnostic('info', `Stopped active audio playback smoothly (${reason}).`);
  }

  /**
   * Plays instant cached verdict phrase ("Great move.", "Good move.", "Inaccuracy.", "Mistake.", "Blunder.")
   * directly from IndexedDB without making any network API calls.
   */
  public async speakVerdictInstant(
    classification: 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder',
    settings: AppSettings
  ): Promise<boolean> {
    if (!settings.voiceEnabled) return false;

    const phraseMap: Record<string, string> = {
      great: 'Great move.',
      good: 'Good move.',
      inaccuracy: 'Inaccuracy.',
      mistake: 'Mistake.',
      blunder: 'Blunder.',
    };

    const phrase = phraseMap[classification] || 'Good move.';
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
        const res = await geminiService.generateNaturalVoice(phrase, settings.geminiApiKey);
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
    await audioCacheService.pregenerateVerdictPhrases(voice, (text) =>
      geminiService.generateNaturalVoice(text, settings.geminiApiKey)
    );
  }

  /**
   * Speaks coach explanation using Gemini STREAMING TTS.
   * Schedules PCM chunks as they arrive so first audio starts in ~1 second.
   */
  public async speakWithCoachStream(
    text: string,
    settings: AppSettings,
    options: {
      onStart?: () => void;
      onFirstAudio?: (timeToFirstAudioMs: number) => void;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    } = {}
  ): Promise<{ usedNatural: boolean; timeToFirstAudioMs: number; error?: string }> {
    if (!settings.voiceEnabled) {
      return { usedNatural: false, timeToFirstAudioMs: 0, error: 'Voice disabled' };
    }

    if (!text || !text.trim()) {
      return { usedNatural: false, timeToFirstAudioMs: 0 };
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
        settings.geminiApiKey
      );

      if (res.success) {
        this.isSpeakingState = false;
        options.onEnd?.();
        return {
          usedNatural: true,
          timeToFirstAudioMs: firstAudioTimeMs || (Date.now() - callStartTime),
        };
      }

      // Fallback to unary TTS if streaming fails
      this.logDiagnostic('warn', 'Streaming TTS failed, falling back to unary TTS');
      const fallbackRes = await this.speakWithCoach(text, settings, options);
      return {
        usedNatural: fallbackRes.usedNatural,
        timeToFirstAudioMs: Date.now() - callStartTime,
        error: fallbackRes.error,
      };
    } catch (err: any) {
      this.isSpeakingState = false;
      this.logDiagnostic('error', `Streaming TTS exception: ${err?.message || err}`);
      options.onError?.(err);
      return { usedNatural: false, timeToFirstAudioMs: 0, error: err?.message };
    }
  }

  /**
   * Universal Coach Speech Dispatcher (Unary Fallback):
   * Calls Gemini TTS model using Gemini API Key,
   * converts returned audio to WAV, caches in IndexedDB, and plays via Web Audio with speed control.
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
    this.logDiagnostic('trigger', `speakWithCoach invoked: "${text.slice(0, 50)}..."`, {
      voiceEnabled: settings.voiceEnabled,
      voiceVolume: settings.voiceVolume,
      voiceRate: settings.voiceRate,
      geminiVoice: settings.geminiVoice || 'Kore',
      hasGeminiKey: !!settings.geminiApiKey || geminiService.hasKey(),
    });

    if (!settings.voiceEnabled) {
      this.logDiagnostic('blocked', 'Voice Coach is muted in Settings.');
      options.onError?.(new Error('Voice Coach is disabled in Settings'));
      return { usedNatural: false, error: 'Voice is muted' };
    }

    if (!text || !text.trim()) {
      return { usedNatural: false };
    }

    this.stop('Replacing with new utterance');

    const spokenText = convertChessNotationToSpokenText(text);

    try {
      options.onStart?.();
      this.isSpeakingState = true;

      const result = await geminiService.generateNaturalVoice(spokenText, settings.geminiApiKey);

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
          return { usedNatural: true };
        }
        this.isSpeakingState = false;
        const errStr = 'Web Audio / HTML5 playback failed.';
        this.logDiagnostic('error', errStr);
        options.onError?.(new Error(errStr));
        return { usedNatural: false, error: errStr };
      } else {
        this.isSpeakingState = false;
        const errStr = result.error || 'Gemini TTS audio generation failed.';
        this.logDiagnostic('error', `Gemini TTS error: "${errStr}"`);
        options.onError?.(new Error(errStr));
        return { usedNatural: false, error: errStr };
      }
    } catch (err: any) {
      this.isSpeakingState = false;
      const errStr = err?.message || 'Gemini TTS exception occurred.';
      this.logDiagnostic('error', `Gemini TTS exception: "${errStr}"`);
      options.onError?.(err);
      return { usedNatural: false, error: errStr };
    }
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

      let options: MediaRecorderOptions = {};
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

        // Stop all tracks to release mic hardware
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

      this.logDiagnostic('info', 'Transcribing 3s test audio with Gemini STT...');
      const res = await geminiService.transcribeAudio(audioBlob, audioBlob.type, customKey);
      return res;
    } catch (e: any) {
      let errName = e?.name || '';
      let errMsg = e?.message || '';

      if (errName === 'NotAllowedError' || errMsg.includes('Permission denied')) {
        return { success: false, error: 'Permission denied: Microphone permission was blocked by the browser/app.' };
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
