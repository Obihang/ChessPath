import { useState, useEffect, useCallback } from 'react';
import { UserProgress } from '../types/curriculum';
import { CoachPersonality, CoachVerbosity, TTSEngineType } from '../types/chess';
import { storageService, PROGRESS_KEY } from '../services/storageService';

export function useUserStore() {
  const [progress, setProgressState] = useState<UserProgress>(() => {
    const initial = storageService.getProgress();
    const settings = storageService.getSettings();
    const migratedApiKey = (
      initial.aiApiKey ??
      initial.geminiApiKey ??
      settings.aiApiKey ??
      settings.geminiApiKey ??
      ''
    ).trim();
    return {
      ...initial,
      voiceEnabled: initial.voiceEnabled ?? settings.voiceEnabled ?? true,
      coachVerbosity: initial.coachVerbosity || settings.coachVerbosity || 'detailed',
      coachPersonality: initial.coachPersonality || settings.coachPersonality || 'strict',
      ttsEngine: initial.ttsEngine === 'browser' ? 'browser' : 'edge',
      edgeVoice: initial.edgeVoice || settings.edgeVoice || 'en-US-AndrewNeural',
      aiApiKey: migratedApiKey,
      geminiApiKey: migratedApiKey,
    };
  });

  // Migrate any legacy 'gemini' ttsEngine or geminiApiKey in localStorage on mount
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        let needsMigration = false;
        const updated: UserProgress = { ...progress };

        if (parsed.ttsEngine === 'gemini') {
          updated.ttsEngine = 'edge';
          needsMigration = true;
        }
        if (!parsed.aiApiKey && parsed.geminiApiKey) {
          updated.aiApiKey = parsed.geminiApiKey.trim();
          updated.geminiApiKey = parsed.geminiApiKey.trim();
          needsMigration = true;
        }
        if (!parsed.coachPersonality) {
          updated.coachPersonality = 'strict';
          needsMigration = true;
        }

        if (needsMigration) {
          setProgressState(updated);
          storageService.saveProgress(updated);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const updateProgress = useCallback((updater: (prev: UserProgress) => UserProgress) => {
    setProgressState((prev) => {
      const next = updater(prev);
      storageService.saveProgress(next);
      return next;
    });
  }, []);

  const setVoiceEnabled = useCallback((enabled: boolean) => {
    updateProgress((prev) => ({
      ...prev,
      voiceEnabled: enabled,
    }));
    storageService.updateSetting('voiceEnabled', enabled);
  }, [updateProgress]);

  const setCoachVerbosity = useCallback((verbosity: CoachVerbosity) => {
    updateProgress((prev) => ({
      ...prev,
      coachVerbosity: verbosity,
    }));
    storageService.updateSetting('coachVerbosity', verbosity);
  }, [updateProgress]);

  const setCoachPersonality = useCallback((personality: CoachPersonality) => {
    updateProgress((prev) => ({
      ...prev,
      coachPersonality: personality,
    }));
    storageService.updateSetting('coachPersonality', personality);
  }, [updateProgress]);

  const setTtsEngine = useCallback((engine: TTSEngineType) => {
    const normalized: TTSEngineType = (engine as string) === 'gemini' ? 'edge' : engine;
    updateProgress((prev) => ({
      ...prev,
      ttsEngine: normalized,
    }));
    storageService.updateSetting('ttsEngine', normalized);
  }, [updateProgress]);

  const setEdgeVoice = useCallback((voice: string) => {
    const targetVoice = voice || 'en-US-AndrewNeural';
    updateProgress((prev) => ({
      ...prev,
      edgeVoice: targetVoice,
    }));
    storageService.updateSetting('edgeVoice', targetVoice);
  }, [updateProgress]);

  const setAiApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    updateProgress((prev) => ({
      ...prev,
      aiApiKey: trimmed,
      geminiApiKey: trimmed,
    }));
    storageService.updateSetting('aiApiKey', trimmed);
  }, [updateProgress]);

  return {
    progress,
    setProgress: setProgressState,
    setVoiceEnabled,
    setCoachVerbosity,
    setCoachPersonality,
    setTtsEngine,
    setEdgeVoice,
    setAiApiKey,
    setGeminiApiKey: setAiApiKey,
  };
}
