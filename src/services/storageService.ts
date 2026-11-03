import { AppSettings } from '../types/chess';
import { UserProgress } from '../types/curriculum';
import { EDGE_NEURAL_VOICES } from '../constants/aiModels';

export const SETTINGS_KEY = 'chesspath_settings_v1';
export const PROGRESS_KEY = 'chesspath_progress_v1';
export const RECENT_GAMES_KEY = 'chesspath_recent_games_v1';

const VALID_EDGE_VOICES = new Set(EDGE_NEURAL_VOICES.map((v) => v.id));

export const DEFAULT_PROGRESS: UserProgress = {
  completedLessonIds: [],
  passedQuizLevelIds: [],
  puzzleRating: 1000,
  puzzlesSolved: 0,
  puzzlesAttempted: 0,
  puzzleMistakes: [],
  srsCards: {},
  streakDays: 1,
  lastActiveDate: new Date().toISOString().slice(0, 10),
  gamesPlayed: 0,
  gamesWon: 0,
  ttsEngine: 'edge',
  edgeVoice: 'en-US-AndrewNeural',
  geminiApiKey: '',
};

export const DEFAULT_SETTINGS: AppSettings = {
  boardTheme: 'walnut',
  soundEnabled: true,
  showCoordinates: true,
  autoFlipBoard: false,
  allowUndo: true,
  geminiApiKey: '',
  aiProvider: 'gemini',
  aiApiKey: '',
  aiBaseUrl: '',
  aiModelName: '',
  voiceEnabled: true,
  voiceRate: 1.0,
  voiceVolume: 1.0,
  ttsEngine: 'edge',
  edgeVoice: 'en-US-AndrewNeural',
  geminiVoice: 'en-US-AndrewNeural',
  useNaturalVoice: true,
  pieceSet: 'cburnett',
  pieceShadow: true,
  liveCoachEnabled: true,
  coachMode: 'learning',
  revealBetterMoveNames: true,
  autoSendTranscribed: false,
  streamingVoice: false,
};

export const storageService = {
  getSettings(): AppSettings {
    if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      const progressData = localStorage.getItem(PROGRESS_KEY);
      const parsedProgress = progressData ? JSON.parse(progressData) : {};

      if (data) {
        const parsed = JSON.parse(data);
        const settings: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };

        // Migrate legacy 'gemini' ttsEngine to 'edge'
        if ((parsed.ttsEngine as string) === 'gemini' || !parsed.ttsEngine) {
          settings.ttsEngine = settings.useNaturalVoice === false ? 'browser' : 'edge';
        }
        settings.useNaturalVoice = settings.ttsEngine === 'edge';

        // Migrate voice selection to a valid Edge Neural voice
        const candidateVoice = parsed.edgeVoice || parsedProgress.edgeVoice || parsed.geminiVoice;
        settings.edgeVoice = VALID_EDGE_VOICES.has(candidateVoice)
          ? candidateVoice
          : 'en-US-AndrewNeural';
        settings.geminiVoice = settings.edgeVoice;

        // Safe migration: preserve saved Gemini keys across settings & progress
        if (
          (!settings.geminiApiKey || !settings.geminiApiKey.trim()) &&
          parsedProgress.geminiApiKey &&
          typeof parsedProgress.geminiApiKey === 'string' &&
          parsedProgress.geminiApiKey.trim()
        ) {
          settings.geminiApiKey = parsedProgress.geminiApiKey.trim();
        } else if (
          (!settings.geminiApiKey || !settings.geminiApiKey.trim()) &&
          (!settings.aiProvider || settings.aiProvider === 'gemini') &&
          settings.aiApiKey &&
          settings.aiApiKey.trim()
        ) {
          settings.geminiApiKey = settings.aiApiKey.trim();
        }

        return settings;
      } else if (progressData) {
        // Hydrate settings from progress if only progress was saved
        const migratedTts =
          parsedProgress.ttsEngine === 'browser' ? 'browser' : 'edge';
        const migratedVoice = VALID_EDGE_VOICES.has(parsedProgress.edgeVoice)
          ? parsedProgress.edgeVoice
          : 'en-US-AndrewNeural';
        return {
          ...DEFAULT_SETTINGS,
          ttsEngine: migratedTts,
          useNaturalVoice: migratedTts === 'edge',
          edgeVoice: migratedVoice,
          geminiVoice: migratedVoice,
          geminiApiKey: (parsedProgress.geminiApiKey || '').trim(),
        };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: AppSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const normalized: AppSettings = {
        ...settings,
        ttsEngine: settings.ttsEngine || (settings.useNaturalVoice ? 'edge' : 'browser'),
        useNaturalVoice: (settings.ttsEngine || (settings.useNaturalVoice ? 'edge' : 'browser')) === 'edge',
        edgeVoice: VALID_EDGE_VOICES.has(settings.edgeVoice)
          ? settings.edgeVoice
          : VALID_EDGE_VOICES.has(settings.geminiVoice)
          ? settings.geminiVoice
          : 'en-US-AndrewNeural',
      };
      normalized.geminiVoice = normalized.edgeVoice;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));

      // Keep progress TTS & API key fields in sync
      const currentProgress = this.getProgress();
      const syncedProgress: UserProgress = {
        ...currentProgress,
        ttsEngine: normalized.ttsEngine,
        edgeVoice: normalized.edgeVoice,
        geminiApiKey: normalized.geminiApiKey || currentProgress.geminiApiKey || '',
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(syncedProgress));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  },

  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, [key]: value };
    if (key === 'ttsEngine') {
      updated.useNaturalVoice = value === 'edge';
    } else if (key === 'useNaturalVoice') {
      updated.ttsEngine = value ? 'edge' : 'browser';
    } else if (key === 'edgeVoice') {
      updated.geminiVoice = value as string;
    } else if (key === 'geminiVoice') {
      updated.edgeVoice = value as string;
    }
    this.saveSettings(updated);
    return updated;
  },

  getProgress(): UserProgress {
    if (typeof localStorage === 'undefined') return DEFAULT_PROGRESS;
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const progress: UserProgress = { ...DEFAULT_PROGRESS, ...parsed };
        let needsSave = false;

        // Migrate any saved 'gemini' ttsEngine value to 'edge'
        if ((parsed.ttsEngine as string) === 'gemini' || !parsed.ttsEngine) {
          progress.ttsEngine = 'edge';
          if ((parsed.ttsEngine as string) === 'gemini') {
            needsSave = true;
          }
        }
        if (!progress.edgeVoice || !VALID_EDGE_VOICES.has(progress.edgeVoice)) {
          progress.edgeVoice = 'en-US-AndrewNeural';
        }
        if (needsSave) {
          localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
        }
        return progress;
      }
    } catch (e) {
      console.warn('Failed to load progress from localStorage', e);
    }
    return DEFAULT_PROGRESS;
  },

  saveProgress(progress: UserProgress): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const normalized: UserProgress = {
        ...progress,
        ttsEngine:
          (progress.ttsEngine as string) === 'gemini'
            ? 'edge'
            : progress.ttsEngine || 'edge',
        edgeVoice:
          progress.edgeVoice && VALID_EDGE_VOICES.has(progress.edgeVoice)
            ? progress.edgeVoice
            : 'en-US-AndrewNeural',
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(normalized));
    } catch (e) {
      console.warn('Failed to save progress to localStorage', e);
    }
  },

  exportAllData(): string {
    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      settings: this.getSettings(),
      progress: localStorage.getItem(PROGRESS_KEY) ? JSON.parse(localStorage.getItem(PROGRESS_KEY)!) : {},
      recentGames: localStorage.getItem(RECENT_GAMES_KEY) ? JSON.parse(localStorage.getItem(RECENT_GAMES_KEY)!) : [],
    };
    return JSON.stringify(backup, null, 2);
  },

  importAllData(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.settings) {
        this.saveSettings(parsed.settings);
      }
      if (parsed.progress) {
        this.saveProgress(parsed.progress);
      }
      if (parsed.recentGames) {
        localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(parsed.recentGames));
      }
      return true;
    } catch (e) {
      console.error('Failed to import data', e);
      return false;
    }
  },
};
