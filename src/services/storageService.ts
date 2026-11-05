import { AppSettings, TTSEngineType } from '../types/chess';
import { UserProgress } from '../types/curriculum';
import { EDGE_NEURAL_VOICES, GEMINI_PREBUILT_VOICES } from '../constants/aiModels';

export const SETTINGS_KEY = 'chesspath_settings_v1';
export const PROGRESS_KEY = 'chesspath_progress_v1';
export const RECENT_GAMES_KEY = 'chesspath_recent_games_v1';

const VALID_GEMINI_VOICES = new Set(GEMINI_PREBUILT_VOICES.map((v) => v.id));
const VALID_EDGE_VOICES = new Set(EDGE_NEURAL_VOICES.map((v) => v.id));

export function isValidHttpsProxyUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed);
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
  gamesWon: number(0),
  voiceEnabled: true,
  coachVerbosity: 'detailed',
  coachPersonality: 'strict',
  ttsEngine: 'gemini',
  geminiVoice: 'Kore',
  edgeVoice: 'en-US-AndrewNeural',
  voiceProxyUrl: '',
  aiApiKey: '',
  geminiApiKey: '',
};

function number(n: number): number {
  return n;
}

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
  ttsEngine: 'gemini',
  edgeVoice: 'en-US-AndrewNeural',
  geminiVoice: 'Kore',
  voiceProxyUrl: '',
  useNaturalVoice: true,
  pieceSet: 'cburnett',
  pieceShadow: true,
  liveCoachEnabled: true,
  coachMode: 'learning',
  coachVerbosity: 'detailed',
  coachPersonality: 'strict',
  revealBetterMoveNames: true,
  autoSendTranscribed: false,
  streamingVoice: false,
};

function resolveEffectiveTtsEngine(
  requestedEngine: unknown,
  useNaturalVoice: boolean | undefined,
  voiceProxyUrl: string | undefined
): TTSEngineType {
  const hasProxy = isValidHttpsProxyUrl(voiceProxyUrl);
  if (requestedEngine === 'browser') {
    return 'browser';
  }
  if (requestedEngine === 'edge') {
    return hasProxy ? 'edge' : 'gemini';
  }
  if (requestedEngine === 'gemini') {
    return 'gemini';
  }
  return useNaturalVoice === false ? 'browser' : 'gemini';
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
        const settings: AppSettings = { ...DEFAULT_SETTINGS, ...parsed };

        const voiceProxyUrl = (parsed.voiceProxyUrl ?? parsedProgress.voiceProxyUrl ?? '').trim();
        settings.voiceProxyUrl = voiceProxyUrl;

        settings.ttsEngine = resolveEffectiveTtsEngine(
          parsed.ttsEngine,
          parsed.useNaturalVoice,
          voiceProxyUrl
        );
        settings.useNaturalVoice = settings.ttsEngine !== 'browser';

        const candidateGeminiVoice = parsed.geminiVoice || parsedProgress.geminiVoice;
        settings.geminiVoice = VALID_GEMINI_VOICES.has(candidateGeminiVoice)
          ? candidateGeminiVoice
          : 'Kore';

        const candidateEdgeVoice = parsed.edgeVoice || parsedProgress.edgeVoice;
        settings.edgeVoice = VALID_EDGE_VOICES.has(candidateEdgeVoice)
          ? candidateEdgeVoice
          : 'en-US-AndrewNeural';

        settings.coachPersonality =
          parsed.coachPersonality || parsedProgress.coachPersonality || 'strict';
        settings.coachVerbosity =
          parsed.coachVerbosity ||
          parsedProgress.coachVerbosity ||
          (settings.liveCoachEnabled === false ? 'silent' : 'detailed');

        const resolvedKey = (
          parsed.aiApiKey ||
          parsedProgress.aiApiKey ||
          parsed.geminiApiKey ||
          parsedProgress.geminiApiKey ||
          ''
        ).trim();
        settings.aiApiKey = resolvedKey;
        settings.geminiApiKey = resolvedKey;

        return settings;
      } else if (progressData) {
        const voiceProxyUrl = (parsedProgress.voiceProxyUrl || '').trim();
        const migratedTts = resolveEffectiveTtsEngine(
          parsedProgress.ttsEngine,
          undefined,
          voiceProxyUrl
        );
        const migratedGeminiVoice = VALID_GEMINI_VOICES.has(parsedProgress.geminiVoice)
          ? parsedProgress.geminiVoice
          : 'Kore';
        const migratedEdgeVoice = VALID_EDGE_VOICES.has(parsedProgress.edgeVoice)
          ? parsedProgress.edgeVoice
          : 'en-US-AndrewNeural';
        const resolvedKey = (
          parsedProgress.aiApiKey ||
          parsedProgress.geminiApiKey ||
          ''
        ).trim();
        return {
          ...DEFAULT_SETTINGS,
          voiceEnabled: parsedProgress.voiceEnabled ?? true,
          coachVerbosity: parsedProgress.coachVerbosity || 'detailed',
          coachPersonality: parsedProgress.coachPersonality || 'strict',
          ttsEngine: migratedTts,
          useNaturalVoice: migratedTts !== 'browser',
          geminiVoice: migratedGeminiVoice,
          edgeVoice: migratedEdgeVoice,
          voiceProxyUrl,
          aiApiKey: resolvedKey,
          geminiApiKey: resolvedKey,
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
      const resolvedKey = (settings.aiApiKey || settings.geminiApiKey || '').trim();
      const voiceProxyUrl = (settings.voiceProxyUrl || '').trim();
      const effectiveEngine = resolveEffectiveTtsEngine(
        settings.ttsEngine,
        settings.useNaturalVoice,
        voiceProxyUrl
      );

      const normalized: AppSettings = {
        ...settings,
        ttsEngine: effectiveEngine,
        useNaturalVoice: effectiveEngine !== 'browser',
        geminiVoice: VALID_GEMINI_VOICES.has(settings.geminiVoice)
          ? settings.geminiVoice
          : 'Kore',
        edgeVoice: VALID_EDGE_VOICES.has(settings.edgeVoice)
          ? settings.edgeVoice
          : 'en-US-AndrewNeural',
        voiceProxyUrl,
        coachPersonality: settings.coachPersonality || 'strict',
        coachVerbosity: settings.coachVerbosity || 'detailed',
        aiApiKey: resolvedKey,
        geminiApiKey: resolvedKey,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));

      const currentProgress = this.getProgress();
      const syncedProgress: UserProgress = {
        ...currentProgress,
        voiceEnabled: normalized.voiceEnabled,
        coachVerbosity: normalized.coachVerbosity,
        coachPersonality: normalized.coachPersonality,
        ttsEngine: normalized.ttsEngine,
        geminiVoice: normalized.geminiVoice,
        edgeVoice: normalized.edgeVoice,
        voiceProxyUrl: normalized.voiceProxyUrl,
        aiApiKey: resolvedKey,
        geminiApiKey: resolvedKey,
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
      updated.useNaturalVoice = value !== 'browser';
    } else if (key === 'useNaturalVoice') {
      updated.ttsEngine = value ? 'gemini' : 'browser';
    } else if (key === 'voiceProxyUrl') {
      if (!isValidHttpsProxyUrl(value as string) && updated.ttsEngine === 'edge') {
        updated.ttsEngine = 'gemini';
      }
    } else if (key === 'aiApiKey') {
      updated.geminiApiKey = value as string;
    } else if (key === 'geminiApiKey') {
      updated.aiApiKey = value as string;
    } else if (key === 'coachVerbosity') {
      updated.liveCoachEnabled = value !== 'silent';
    }
    this.saveSettings(updated);
    return this.getSettings();
  },

  getProgress(): UserProgress {
    if (typeof localStorage === 'undefined') return DEFAULT_PROGRESS;
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        const progress: UserProgress = { ...DEFAULT_PROGRESS, ...parsed };
        const voiceProxyUrl = (parsed.voiceProxyUrl || '').trim();
        progress.voiceProxyUrl = voiceProxyUrl;
        progress.ttsEngine = resolveEffectiveTtsEngine(
          parsed.ttsEngine,
          undefined,
          voiceProxyUrl
        );
        if (!progress.geminiVoice || !VALID_GEMINI_VOICES.has(progress.geminiVoice)) {
          progress.geminiVoice = 'Kore';
        }
        if (!progress.edgeVoice || !VALID_EDGE_VOICES.has(progress.edgeVoice)) {
          progress.edgeVoice = 'en-US-AndrewNeural';
        }
        if (!progress.coachPersonality) {
          progress.coachPersonality = 'strict';
        }
        if (!progress.coachVerbosity) {
          progress.coachVerbosity = 'detailed';
        }
        if (!progress.aiApiKey && parsed.geminiApiKey) {
          progress.aiApiKey = parsed.geminiApiKey.trim();
        }
        progress.geminiApiKey = progress.aiApiKey || progress.geminiApiKey || '';
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
      const resolvedKey = (progress.aiApiKey ?? progress.geminiApiKey ?? '').trim();
      const voiceProxyUrl = (progress.voiceProxyUrl || '').trim();
      const normalized: UserProgress = {
        ...progress,
        coachPersonality: progress.coachPersonality || 'strict',
        coachVerbosity: progress.coachVerbosity || 'detailed',
        ttsEngine: resolveEffectiveTtsEngine(progress.ttsEngine, undefined, voiceProxyUrl),
        geminiVoice:
          progress.geminiVoice && VALID_GEMINI_VOICES.has(progress.geminiVoice)
            ? progress.geminiVoice
            : 'Kore',
        edgeVoice:
          progress.edgeVoice && VALID_EDGE_VOICES.has(progress.edgeVoice)
            ? progress.edgeVoice
            : 'en-US-AndrewNeural',
        voiceProxyUrl,
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
