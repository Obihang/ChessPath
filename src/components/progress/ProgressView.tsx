import React from 'react';
import { UserProgress } from '../../types/curriculum';
import { AppSettings } from '../../types/chess';
import {
  Trophy,
  Flame,
  GraduationCap,
  Target,
  BookOpen,
  Sparkles,
  Download,
  Calendar,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface ProgressViewProps {
  progress: UserProgress;
  settings: AppSettings;
  onNavigateToTab: (tab: 'learn' | 'practice' | 'openings') => void;
  onOpenSettings: () => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  progress,
  onNavigateToTab,
  onOpenSettings,
}) => {
  // Determine smart recommendation
  let recommendation: {
    title: string;
    description: string;
    tab: 'learn' | 'practice' | 'openings';
  } = {
    title: 'Beginner Tactics Fundamentals',
    description: 'Work through Level 3 Tactics lessons to master forks, pins, and skewers.',
    tab: 'learn',
  };

  if (progress.completedLessonIds.length < 5) {
    recommendation = {
      title: 'Level 1: Absolute Basics',
      description: 'Complete the foundational rules and piece movements curriculum.',
      tab: 'learn',
    };
  } else if (progress.puzzlesSolved < 10) {
    recommendation = {
      title: 'Daily Tactics Training',
      description: 'Solve 5 tactical puzzles today to boost your puzzle rating.',
      tab: 'practice',
    };
  } else {
    recommendation = {
      title: 'Spaced Repetition Opening Drill',
      description: 'Explore the Openings and Gambits library to build a rock-solid opening repertoire.',
      tab: 'openings',
    };
  }

  return (
    <div className="w-full max-w-xl mx-auto px-3 py-3 space-y-4">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-100">Training Progress</h1>
            <p className="text-xs text-slate-400">All stats are stored locally in your browser.</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-300 text-xs font-bold font-mono">
            <Flame className="w-4 h-4 text-orange-400" />
            <span>{progress.streakDays || 1} Day Streak</span>
          </div>
        </div>

        {/* 4-KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-800/80">
          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Tactics Elo</span>
            <span className="text-lg font-bold font-mono text-amber-400">{progress.puzzleRating}</span>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Lessons</span>
            <span className="text-lg font-bold font-mono text-slate-100">{progress.completedLessonIds.length}</span>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Puzzles Solved</span>
            <span className="text-lg font-bold font-mono text-emerald-400">{progress.puzzlesSolved}</span>
          </div>

          <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Quizzes Passed</span>
            <span className="text-lg font-bold font-mono text-sky-400">{progress.passedQuizLevelIds.length}</span>
          </div>
        </div>
      </div>

      {/* Smart Study Recommendation Card */}
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/30 rounded-2xl p-4 space-y-2 shadow-md">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Recommended Next</span>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-100">{recommendation.title}</h3>
          <p className="text-xs text-slate-300 mt-0.5">{recommendation.description}</p>
        </div>

        <div className="pt-1">
          <button
            onClick={() => onNavigateToTab(recommendation.tab)}
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <span>Start Recommended Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Curriculum Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <GraduationCap className="w-4 h-4 text-amber-400" />
            <span>Curriculum Progress</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {progress.completedLessonIds.length} lessons mastered across Levels 1–3.
          </p>
          <button
            onClick={() => onNavigateToTab('learn')}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 pt-1"
          >
            <span>Open Curriculum</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tactics Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Target className="w-4 h-4 text-amber-400" />
            <span>Tactics & Drills</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {progress.puzzlesSolved} tactics solved with an estimated rating of {progress.puzzleRating} Elo.
          </p>
          <button
            onClick={() => onNavigateToTab('practice')}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 pt-1"
          >
            <span>Open Tactics Hub</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Data Management Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-200">Data & Backup</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Export your JSON progress or import from another device.
          </p>
        </div>
        <button
          onClick={onOpenSettings}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
        >
          Manage in Settings
        </button>
      </div>
    </div>
  );
};
