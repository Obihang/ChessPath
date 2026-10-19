import { AppSettings, BoardThemeId } from '../types/chess';
import { UserProgress } from '../types/curriculum';

const SETTINGS_KEY = 'chesspath_settings_v1';
const PROGRESS_KEY = 'chesspath_progress_v1';
const RECENT_GAMES_KEY = 'chesspath_recent_games_v1';

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
  geminiVoice: 'Kore',
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
      if (data) {
        const parsed = JSON.parse(data);
        const settings: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };

        // Safe migration: preserve legacy saved Gemini keys without overwriting other provider keys
        if (
          (!settings.geminiApiKey || !settings.geminiApiKey.trim()) &&
          (!settings.aiProvider || settings.aiProvider === 'gemini') &&
          settings.aiApiKey &&
          settings.aiApiKey.trim()
        ) {
          settings.geminiApiKey = settings.aiApiKey.trim();
        }

        return settings;
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: AppSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  },

  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, [key]: value };
    this.saveSettings(updated);
    return updated;
  },

  getProgress(): UserProgress {
    if (typeof localStorage === 'undefined') return DEFAULT_PROGRESS;
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      if (data) {
        return { ...DEFAULT_PROGRESS, ...JSON.parse(data) };
      }
    } catch (e) {
      console.warn('Failed to load progress from localStorage', e);
    }
    return DEFAULT_PROGRESS;
  },

  saveProgress(progress: UserProgress): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
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
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(parsed.progress));
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
