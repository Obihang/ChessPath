import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { ActiveTab, AppSettings } from './types/chess';
import { UserProgress } from './types/curriculum';
import { storageService } from './services/storageService';
import { soundService } from './services/audioService';
import { TopBar } from './components/common/TopBar';
import { BottomNav } from './components/common/BottomNav';
import { PlayView } from './components/play/PlayView';
import { validateAllContent } from './utils/validateContent';

// Lazy-loaded secondary views for faster initial startup
const LearnView = lazy(() => import('./components/learn/LearnView').then(m => ({ default: m.LearnView })));
const OpeningsView = lazy(() => import('./components/openings/OpeningsView').then(m => ({ default: m.OpeningsView })));
const PracticeView = lazy(() => import('./components/practice/PracticeView').then(m => ({ default: m.PracticeView })));
const ProgressView = lazy(() => import('./components/progress/ProgressView').then(m => ({ default: m.ProgressView })));
const SettingsModal = lazy(() => import('./components/settings/SettingsModal').then(m => ({ default: m.SettingsModal })));

function ViewLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500"></div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      validateAllContent();
    }
  }, []);
  const [settings, setSettings] = useState<AppSettings>(() => storageService.getSettings());
  const [progress, setProgress] = useState<UserProgress>(() => storageService.getProgress());
  const [activeTab, setActiveTab] = useState<ActiveTab>('play');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    soundService.setEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  // Streak calculation
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (progress.lastActiveDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const isConsecutive = progress.lastActiveDate === yesterday;
      const updatedStreak = isConsecutive ? (progress.streakDays || 1) + 1 : 1;

      const updatedProgress: UserProgress = {
        ...progress,
        lastActiveDate: today,
        streakDays: updatedStreak,
      };
      setProgress(updatedProgress);
      storageService.saveProgress(updatedProgress);
    }
  }, []);

  const handleToggleSound = () => {
    const updated = storageService.updateSetting('soundEnabled', !settings.soundEnabled);
    setSettings(updated);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    setProgress(storageService.getProgress());
  };

  const handleVerbosityChange = (verbosity: AppSettings['coachVerbosity']) => {
    if (!verbosity) return;
    let updated = storageService.updateSetting('coachVerbosity', verbosity);
    updated = storageService.updateSetting('liveCoachEnabled', verbosity !== 'silent');
    setSettings(updated);
    setProgress(storageService.getProgress());
  };

  const handlePersonalityChange = (personality: AppSettings['coachPersonality']) => {
    if (!personality) return;
    const updated = storageService.updateSetting('coachPersonality', personality);
    setSettings(updated);
    setProgress(storageService.getProgress());
  };

  // Progress Handlers
  const handleCompleteLesson = (lessonId: string) => {
    if (!progress.completedLessonIds.includes(lessonId)) {
      const updated: UserProgress = {
        ...progress,
        completedLessonIds: [...progress.completedLessonIds, lessonId],
      };
      setProgress(updated);
      storageService.saveProgress(updated);
    }
  };

  const handlePassQuiz = (levelId: number) => {
    if (!progress.passedQuizLevelIds.includes(levelId)) {
      const updated: UserProgress = {
        ...progress,
        passedQuizLevelIds: [...progress.passedQuizLevelIds, levelId],
      };
      setProgress(updated);
      storageService.saveProgress(updated);
    }
  };

  const handleSolvePuzzle = (puzzleId: string, ratingChange: number) => {
    const updated: UserProgress = {
      ...progress,
      puzzleRating: Math.max(600, progress.puzzleRating + ratingChange),
      puzzlesSolved: progress.puzzlesSolved + 1,
      puzzlesAttempted: progress.puzzlesAttempted + 1,
    };
    setProgress(updated);
    storageService.saveProgress(updated);
  };

  const handleFailPuzzle = (puzzleId: string, ratingChange: number) => {
    const updated: UserProgress = {
      ...progress,
      puzzleRating: Math.max(600, progress.puzzleRating + ratingChange),
      puzzlesAttempted: progress.puzzlesAttempted + 1,
      puzzleMistakes: progress.puzzleMistakes.includes(puzzleId)
        ? progress.puzzleMistakes
        : [...progress.puzzleMistakes, puzzleId],
    };
    setProgress(updated);
    storageService.saveProgress(updated);
  };

  const handleCompleteOpeningPractice = (openingId: string, success: boolean) => {
    const prevCard = progress.srsCards[openingId] || { interval: 1, ease: 2.5, nextDue: '', reps: 0 };
    const newReps = success ? prevCard.reps + 1 : 0;
    const newInterval = success ? (prevCard.reps === 0 ? 1 : prevCard.reps === 1 ? 6 : Math.round(prevCard.interval * prevCard.ease)) : 1;
    const nextDue = new Date(Date.now() + newInterval * 86400000).toISOString().slice(0, 10);

    const updated: UserProgress = {
      ...progress,
      srsCards: {
        ...progress.srsCards,
        [openingId]: {
          reps: newReps,
          interval: newInterval,
          ease: success ? prevCard.ease : Math.max(1.3, prevCard.ease - 0.2),
          nextDue,
        },
      },
    };
    setProgress(updated);
    storageService.saveProgress(updated);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-300">
      {/* Top Application Bar */}
      <TopBar
        soundEnabled={settings.soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-24 overflow-x-hidden">
        {activeTab === 'play' && (
          <PlayView
            settings={settings}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onUpdateSettings={handleUpdateSettings}
            onVerbosityChange={handleVerbosityChange}
            onPersonalityChange={handlePersonalityChange}
          />
        )}

        <Suspense fallback={<ViewLoadingFallback />}>
          {activeTab === 'learn' && (
            <LearnView
              settings={settings}
              coachPersonality={settings.coachPersonality}
              coachVerbosity={settings.coachVerbosity}
              completedLessonIds={progress.completedLessonIds}
              passedQuizLevelIds={progress.passedQuizLevelIds}
              onCompleteLesson={handleCompleteLesson}
              onPassQuiz={handlePassQuiz}
            />
          )}

          {activeTab === 'openings' && (
            <OpeningsView
              settings={settings}
              onCompletePractice={handleCompleteOpeningPractice}
            />
          )}

          {activeTab === 'practice' && (
            <PracticeView
              settings={settings}
              coachPersonality={settings.coachPersonality}
              coachVerbosity={settings.coachVerbosity}
              userRating={progress.puzzleRating}
              solvedPuzzleIds={[]}
              onSolvePuzzle={handleSolvePuzzle}
              onFailPuzzle={handleFailPuzzle}
            />
          )}

          {activeTab === 'progress' && (
            <ProgressView
              progress={progress}
              settings={settings}
              onNavigateToTab={(tab) => setActiveTab(tab)}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {/* Global Settings Modal */}
          {isSettingsOpen && (
            <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
        </Suspense>
      </main>

      {/* Bottom 5-Tab Navigation Bar */}
      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  );
}
