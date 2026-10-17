/**
 * Centralized Gemini model constants and prebuilt voices.
 * Verified against official Google AI Studio Gemini API documentation.
 */

export const GEMINI_MODELS = {
  // Basic & Complex Text Tasks
  TEXT_PRIMARY: 'gemini-3.8-flash',
  TEXT_FALLBACK: 'gemini-flash-latest',

  // Text-to-Speech (TTS)
  TTS_PRIMARY: 'gemini-3.8-flash-lite-tts',
  TTS_FALLBACK: 'gemini-3.8-flash-tts',

  // Audio Transcription (STT)
  STT_PRIMARY: 'gemini-3.5-transcribe',
  STT_FALLBACK: 'gemini-3.8-flash',
} as const;

export interface GeminiVoiceOption {
  id: string;
  name: string;
  description: string;
}

export const GEMINI_PREBUILT_VOICES: GeminiVoiceOption[] = [
  { id: 'Kore', name: 'Kore', description: 'Calm, clear, balanced female voice' },
  { id: 'Puck', name: 'Puck', description: 'Upbeat, enthusiastic male voice' },
  { id: 'Charon', name: 'Charon', description: 'Deep, resonant, authoritative male voice' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Energetic, confident male voice' },
  { id: 'Aoede', name: 'Aoede', description: 'Warm, expressive female voice' },
];
