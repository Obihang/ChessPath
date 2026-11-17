/**
 * Centralized AI model constants, Gemini TTS prebuilt voices, and optional Edge Neural voices.
 */

export const GEMINI_MODELS = {
  // Basic & Complex Text Tasks
  TEXT_PRIMARY: 'gemini-2.5-flash',
  TEXT_FALLBACK: 'gemini-2.5-flash-lite',

  // Audio Transcription (STT)
  STT_PRIMARY: 'gemini-2.5-flash',
  STT_FALLBACK: 'gemini-2.5-flash-lite',

  // Text-to-Speech (TTS)
  TTS_PRIMARY: 'gemini-2.5-flash-preview-tts',
  TTS_FALLBACK: 'gemini-2.5-pro-preview-tts',
} as const;

export interface VoiceOption {
  id: string;
  name: string;
  label: string;
  description: string;
  lang: string;
  shortName: string;
}

export type EdgeVoiceOption = VoiceOption;

export const GEMINI_PREBUILT_VOICES: VoiceOption[] = [
  {
    id: 'Kore',
    name: 'Coach Kore',
    label: 'Coach Kore (Firm & Articulate)',
    description: 'Firm & Articulate',
    lang: 'en-US',
    shortName: 'Kore',
  },
  {
    id: 'Puck',
    name: 'Coach Puck',
    label: 'Coach Puck (Upbeat & Energetic)',
    description: 'Upbeat & Energetic',
    lang: 'en-US',
    shortName: 'Puck',
  },
  {
    id: 'Charon',
    name: 'Grandmaster Charon',
    label: 'Grandmaster Charon (Deep & Calm)',
    description: 'Deep & Calm',
    lang: 'en-US',
    shortName: 'Charon',
  },
  {
    id: 'Fenrir',
    name: 'Coach Fenrir',
    label: 'Coach Fenrir (Direct & Dynamic)',
    description: 'Direct & Dynamic',
    lang: 'en-US',
    shortName: 'Fenrir',
  },
  {
    id: 'Zephyr',
    name: 'Coach Zephyr',
    label: 'Coach Zephyr (Warm & Clear)',
    description: 'Warm & Clear',
    lang: 'en-US',
    shortName: 'Zephyr',
  },
];

export const EDGE_NEURAL_VOICES: EdgeVoiceOption[] = [
  {
    id: 'en-US-AndrewNeural',
    name: 'Coach Andrew',
    label: 'Coach Andrew (Warm & Confident US Male)',
    description: 'Warm & Confident US Male',
    lang: 'en-US',
    shortName: 'Andrew',
  },
  {
    id: 'en-US-AriaNeural',
    name: 'Coach Aria',
    label: 'Coach Aria (Expressive US Female)',
    description: 'Expressive US Female',
    lang: 'en-US',
    shortName: 'Aria',
  },
  {
    id: 'en-GB-RyanNeural',
    name: 'Grandmaster Ryan',
    label: 'Grandmaster Ryan (Classic British Male)',
    description: 'Classic British Male',
    lang: 'en-GB',
    shortName: 'Ryan',
  },
  {
    id: 'en-GB-SoniaNeural',
    name: 'Coach Sonia',
    label: 'Coach Sonia (Articulate British Female)',
    description: 'Articulate British Female',
    lang: 'en-GB',
    shortName: 'Sonia',
  },
  {
    id: 'en-US-BrianNeural',
    name: 'Coach Brian',
    label: 'Coach Brian (Clear & Calm US Male)',
    description: 'Clear & Calm US Male',
    lang: 'en-US',
    shortName: 'Brian',
  },
];
