import React, { useState } from 'react';
import { PUZZLES } from '../../data/puzzlesData';
import { PuzzleItem } from '../../types/curriculum';
import { AppSettings } from '../../types/chess';
import { PuzzlePlayer } from './PuzzlePlayer';
import { PuzzleRush } from './PuzzleRush';
import { EndgameDrillsView } from './EndgameDrillsView';
import {
  Target,
  Zap,
  Crown,
  ChevronRight,
  Sparkles,
  Flame,
  Award,
} from 'lucide-react';

interface PracticeViewProps {
  settings: AppSettings;
  userRating: number;
  solvedPuzzleIds: string[];
  onSolvePuzzle: (puzzleId: string, ratingChange: number) => void;
  onFailPuzzle: (puzzleId: string, ratingChange: number) => void;
}

export const PracticeView: React.FC<PracticeViewProps> = ({
  settings,
  userRating,
  solvedPuzzleIds,
  onSolvePuzzle,
  onFailPuzzle,
}) => {
  const [activeSubView, setActiveSubView] = useState<'hub' | 'puzzle' | 'rush' | 'endgames'>('hub');
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleItem | null>(null);
  const [themeFilter, setThemeFilter] = useState<string>('all');

  const themes = [
    { id: 'all', label: 'All Puzzles' },
    { id: 'fork', label: 'Forks' },
    { id: 'pin', label: 'Pins' },
    { id: 'skewer', label: 'Skewers' },
    { id: 'discovered', label: 'Discovered' },
    { id: 'deflection', label: 'Deflection' },
    { id: 'clearance', label: 'Clearance' },
    { id: 'mate-1', label: 'Mate in 1' },
    { id: 'mate-2', label: 'Mate in 2' },
    { id: 'smothered', label: 'Smothered' },
  ];

  const filteredPuzzles = PUZZLES.filter(
    (p) => themeFilter === 'all' || p.theme === themeFilter
  );

  // Daily puzzle (deterministic based on day of year)
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const dailyPuzzle = PUZZLES[dayOfYear % PUZZLES.length] || PUZZLES[0];

  if (activeSubView === 'rush') {
    return <PuzzleRush settings={settings} onBack={() => setActiveSubView('hub')} />;
  }

  if (activeSubView === 'endgames') {
    return <EndgameDrillsView settings={settings} onBack={() => setActiveSubView('hub')} />;
  }

  if (activeSubView === 'puzzle' && selectedPuzzle) {
    const currentIndex = PUZZLES.findIndex((p) => p.id === selectedPuzzle.id);
    const nextPuzzle = PUZZLES[(currentIndex + 1) % PUZZLES.length];

    return (
      <PuzzlePlayer
        puzzle={selectedPuzzle}
        settings={settings}
        userRating={userRating}
        onBack={() => {
          setSelectedPuzzle(null);
          setActiveSubView('hub');
        }}
        onSolve={onSolvePuzzle}
        onFail={onFailPuzzle}
        onNext={() => setSelectedPuzzle(nextPuzzle)}
      />
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto px-3 py-3 space-y-4">
      {/* Rating & Stats Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100">Tactics & Practice</h1>
              <p className="text-xs text-slate-400">Sharpen tactical calculation and calculation speed.</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-medium">Estimated Elo</span>
            <span className="text-lg font-mono font-bold text-amber-400">{userRating}</span>
          </div>
        </div>

        {/* Quick Launch Cards */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80">
          <button
            onClick={() => setActiveSubView('rush')}
            className="p-3 bg-gradient-to-br from-amber-500/15 to-orange-500/10 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/40 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <Zap className="w-4 h-4 text-amber-400" />
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="text-xs font-bold text-slate-100 block mt-1.5">Puzzle Rush</span>
            <span className="text-[10px] text-slate-400 block">3-minute speed sprint</span>
          </button>

          <button
            onClick={() => setActiveSubView('endgames')}
            className="p-3 bg-gradient-to-br from-blue-500/15 to-indigo-500/10 hover:from-blue-500/25 hover:to-indigo-500/20 border border-blue-500/40 rounded-xl text-left transition-all group"
          >
            <div className="flex items-center justify-between">
              <Crown className="w-4 h-4 text-blue-400" />
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="text-xs font-bold text-slate-100 block mt-1.5">Endgame Drills</span>
            <span className="text-[10px] text-slate-400 block">Convert winning kings</span>
          </button>
        </div>
      </div>

      {/* Daily Puzzle Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Daily Tactical Challenge</span>
          </span>
          <span className="text-xs font-mono text-slate-400">{dailyPuzzle.rating} Elo</span>
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-100">{dailyPuzzle.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{dailyPuzzle.description}</p>
        </div>

        <button
          onClick={() => {
            setSelectedPuzzle(dailyPuzzle);
            setActiveSubView('puzzle');
          }}
          className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>Solve Daily Puzzle</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Thematic Puzzles List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tactics by Theme</h2>
          <span className="text-xs text-slate-500 font-mono">{filteredPuzzles.length} available</span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {themes.map((th) => (
            <button
              key={th.id}
              onClick={() => setThemeFilter(th.id)}
              className={`px-3 py-1 rounded-xl border transition-colors whitespace-nowrap shrink-0 text-[11px] ${
                themeFilter === th.id
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              {th.label}
            </button>
          ))}
        </div>

        {/* Puzzles List */}
        <div className="space-y-1.5">
          {filteredPuzzles.map((puz) => {
            const isSolved = solvedPuzzleIds.includes(puz.id);

            return (
              <button
                key={puz.id}
                onClick={() => {
                  setSelectedPuzzle(puz);
                  setActiveSubView('puzzle');
                }}
                className={`w-full text-left p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                  isSolved
                    ? 'bg-slate-950/40 border-slate-800 text-slate-400'
                    : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-200 hover:border-amber-500/40'
                }`}
              >
                <div className="space-y-0.5 truncate pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">
                      {puz.theme}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {puz.rating} Elo
                    </span>
                  </div>
                  <span className="font-semibold block truncate">{puz.title}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 text-slate-500">
                  {isSolved && <Award className="w-4 h-4 text-emerald-400" />}
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
