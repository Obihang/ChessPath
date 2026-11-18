/**
 * Centralized AI model constants (text analysis/hints) and MS Edge Neural TTS voices.
 */

export const GEMINI_MODELS = {
  // Basic & Complex Text Tasks (optional user API key for commentary/hints)
  TEXT_PRIMARY: 'gemini-3.5-flash-lite',
  TEXT_FALLBACK: 'gemini-3.8-flash-lite',
  TEXT_LEGACY_FALLBACK: 'gemini-3.8-flash',
} as const;

export const DEFAULT_EDGE_TTS_URL = 'https://chesspath-tts.vercel.app/tts';
export const DEFAULT_EDGE_VOICE = 'en-US-JennyNeural';

export interface VoiceOption {
  id: string;
  name: string;
  label: string;
  description: string;
  lang: string;
  shortName: string;
}

export type EdgeVoiceOption = VoiceOption;

export const EDGE_NEURAL_VOICES: EdgeVoiceOption[] = [
  {
    id: 'en-US-JennyNeural',
    name: 'Coach Jenny',
    label: 'Coach Jenny (Clear & Natural US Female — Default)',
    description: 'Clear & Natural US Female',
    lang: 'en-US',
    shortName: 'Jenny',
  },
  {
    id: 'en-US-GuyNeural',
    name: 'Coach Guy',
    label: 'Coach Guy (Confident & Warm US Male)',
    description: 'Confident & Warm US Male',
    lang: 'en-US',
    shortName: 'Guy',
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
    id: 'en-GB-SoniaNeural',
    name: 'Coach Sonia',
    label: 'Coach Sonia (Articulate British Female)',
    description: 'Articulate British Female',
    lang: 'en-GB',
    shortName: 'Sonia',
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
    id: 'en-US-AndrewNeural',
    name: 'Coach Andrew',
    label: 'Coach Andrew (Warm & Steady US Male)',
    description: 'Warm & Steady US Male',
    lang: 'en-US',
    shortName: 'Andrew',
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
