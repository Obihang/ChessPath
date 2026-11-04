/**
 * Centralized AI model constants and curated Edge Neural Coach voices.
 */

export const GEMINI_MODELS = {
  // Basic & Complex Text Tasks
  TEXT_PRIMARY: 'gemini-3.8-flash',
  TEXT_FALLBACK: 'gemini-flash-latest',

  // Audio Transcription (STT)
  STT_PRIMARY: 'gemini-3.5-transcribe',
  STT_FALLBACK: 'gemini-3.8-flash',
} as const;

export interface EdgeVoiceOption {
  id: string;
  name: string;
  label: string;
  description: string;
  lang: string;
  shortName: string;
}

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

// Alias for backward compatibility in any component importing GEMINI_PREBUILT_VOICES
export const GEMINI_PREBUILT_VOICES = EDGE_NEURAL_VOICES;
