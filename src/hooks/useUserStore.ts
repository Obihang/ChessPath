import { useState, useEffect, useCallback } from 'react';
import { UserProgress } from '../types/curriculum';
import { TTSEngineType } from '../types/chess';
import { storageService, PROGRESS_KEY } from '../services/storageService';

export function useUserStore() {
  const [progress, setProgressState] = useState<UserProgress>(() => {
    const initial = storageService.getProgress();
    const settings = storageService.getSettings();
    return {
      ...initial,
      ttsEngine: initial.ttsEngine === 'browser' ? 'browser' : 'edge',
      edgeVoice: initial.edgeVoice || settings.edgeVoice || 'en-US-AndrewNeural',
      geminiApiKey: initial.geminiApiKey ?? settings.geminiApiKey ?? '',
    };
  });

  // Migrate any legacy 'gemini' ttsEngine in localStorage on mount
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ttsEngine === 'gemini') {
          const updated: UserProgress = {
            ...progress,
            ttsEngine: 'edge',
          };
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

  const setGeminiApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    updateProgress((prev) => ({
      ...prev,
      geminiApiKey: trimmed,
    }));
    storageService.updateSetting('geminiApiKey', trimmed);
  }, [updateProgress]);

  return {
    progress,
    setProgress: setProgressState,
    setTtsEngine,
    setEdgeVoice,
    setGeminiApiKey,
  };
}
