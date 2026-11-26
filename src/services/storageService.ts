import { AppSettings } from '../types/chess';
import { UserProgress } from '../types/curriculum';
import { DEFAULT_EDGE_VOICE, EDGE_NEURAL_VOICES } from '../constants/aiModels';

export const SETTINGS_KEY = 'chesspath_settings_v1';
export const PROGRESS_KEY = 'chesspath_progress_v1';
export const RECENT_GAMES_KEY = 'chesspath_recent_games_v1';

const VALID_EDGE_VOICES = new Set(EDGE_NEURAL_VOICES.map((v) => v.id));

function resolveEdgeVoice(candidate: unknown): string {
  if (typeof candidate === 'string' && VALID_EDGE_VOICES.has(candidate)) {
    return candidate;
  }
  return DEFAULT_EDGE_VOICE;
}

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
  voiceEnabled: true,
  coachVerbosity: 'detailed',
  coachPersonality: 'strict',
  ttsEngine: 'edge',
  edgeVoice: DEFAULT_EDGE_VOICE,
  aiApiKey: '',
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
  voiceRate: 0.92,
  voiceVolume: 1.0,
  ttsEngine: 'edge',
  edgeVoice: DEFAULT_EDGE_VOICE,
  pieceSet: 'cburnett',
  pieceShadow: true,
  liveCoachEnabled: true,
  coachMode: 'learning',
  coachVerbosity: 'detailed',
  coachPersonality: 'strict',
  commentaryEngine: 'ai',
  revealBetterMoveNames: true,
};

function sanitizeSettings(raw: Record<string, any>, fallbackProgress?: Record<string, any>): AppSettings {
  const resolvedKey = (
    raw.aiApiKey ||
    fallbackProgress?.aiApiKey ||
    raw.geminiApiKey ||
    fallbackProgress?.geminiApiKey ||
    ''
  ).trim();

  const coachPersonality = raw.coachPersonality || fallbackProgress?.coachPersonality || 'strict';
  const coachVerbosity =
    raw.coachVerbosity ||
    fallbackProgress?.coachVerbosity ||
    (raw.liveCoachEnabled === false ? 'silent' : 'detailed');

  // Strip any stale proxy URL or legacy ttsEngine/geminiVoice fields from localStorage
  const {
    voiceProxyUrl: _ignoredVoiceProxy,
    edgeProxyUrl: _ignoredEdgeProxy,
    geminiVoice: _ignoredGeminiVoice,
    useNaturalVoice: _ignoredUseNatural,
    ttsEngine: _ignoredTtsEngine,
    ...rest
  } = raw;

  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    ttsEngine: 'edge',
    edgeVoice: resolveEdgeVoice(raw.edgeVoice || fallbackProgress?.edgeVoice),
    coachPersonality,
    coachVerbosity,
    aiApiKey: resolvedKey,
    geminiApiKey: resolvedKey,
  };
}

export const storageService = {
  getSettings(): AppSettings {
    if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      const progressData = localStorage.getItem(PROGRESS_KEY);
      const parsedProgress = progressData ? JSON.parse(progressData) : {};

      if (data) {
        const parsed = JSON.parse(data);
        return sanitizeSettings(parsed, parsedProgress);
      } else if (progressData) {
        return sanitizeSettings({
          voiceEnabled: parsedProgress.voiceEnabled ?? true,
          coachVerbosity: parsedProgress.coachVerbosity || 'detailed',
          coachPersonality: parsedProgress.coachPersonality || 'strict',
          edgeVoice: parsedProgress.edgeVoice,
          aiApiKey: parsedProgress.aiApiKey,
          geminiApiKey: parsedProgress.geminiApiKey,
        });
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: AppSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const normalized = sanitizeSettings(settings as unknown as Record<string, any>);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));

      const currentProgress = this.getProgress();
      const syncedProgress: UserProgress = {
        ...currentProgress,
        voiceEnabled: normalized.voiceEnabled,
        coachVerbosity: normalized.coachVerbosity,
        coachPersonality: normalized.coachPersonality,
        ttsEngine: 'edge',
        edgeVoice: normalized.edgeVoice,
        aiApiKey: normalized.aiApiKey,
        geminiApiKey: normalized.geminiApiKey,
      };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(syncedProgress));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
  },

  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, [key]: value };
    if (key === 'aiApiKey') {
      updated.geminiApiKey = value as string;
    } else if (key === 'geminiApiKey') {
      updated.aiApiKey = value as string;
    } else if (key === 'coachVerbosity') {
      updated.liveCoachEnabled = value !== 'silent';
    }
    updated.ttsEngine = 'edge';
    this.saveSettings(updated);
    return this.getSettings();
  },

  getProgress(): UserProgress {
    if (typeof localStorage === 'undefined') return DEFAULT_PROGRESS;
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const {
          voiceProxyUrl: _ignoredVoiceProxy,
          edgeProxyUrl: _ignoredEdgeProxy,
          geminiVoice: _ignoredGeminiVoice,
          ...rest
        } = parsed;

        const resolvedKey = (parsed.aiApiKey || parsed.geminiApiKey || '').trim();
        return {
          ...DEFAULT_PROGRESS,
          ...rest,
          ttsEngine: 'edge',
          edgeVoice: resolveEdgeVoice(parsed.edgeVoice),
          coachPersonality: parsed.coachPersonality || 'strict',
          coachVerbosity: parsed.coachVerbosity || 'detailed',
          aiApiKey: resolvedKey,
          geminiApiKey: resolvedKey,
        };
      }
    } catch (e) {
      console.warn('Failed to load progress from localStorage', e);
    }
    return DEFAULT_PROGRESS;
  },

  saveProgress(progress: UserProgress): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const resolvedKey = (progress.aiApiKey ?? progress.geminiApiKey ?? '').trim();
      const {
        voiceProxyUrl: _ignoredVoiceProxy,
        edgeProxyUrl: _ignoredEdgeProxy,
        geminiVoice: _ignoredGeminiVoice,
        ...rest
      } = progress as unknown as Record<string, any>;

      const normalized: UserProgress = {
        ...DEFAULT_PROGRESS,
        ...rest,
        coachPersonality: progress.coachPersonality || 'strict',
        coachVerbosity: progress.coachVerbosity || 'detailed',
        ttsEngine: 'edge',
        edgeVoice: resolveEdgeVoice(progress.edgeVoice),
        aiApiKey: resolvedKey,
        geminiApiKey: resolvedKey,
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
