import React, { useState, useMemo } from 'react';
import { OPENINGS } from '../../data/openingsData';
import { GAMBITS } from '../../data/gambitsData';
import { OpeningItem } from '../../types/curriculum';
import { AppSettings, PieceColor } from '../../types/chess';
import { OpeningTrainer } from './OpeningTrainer';
import {
  BookOpen,
  Search,
  Flame,
  Swords,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface OpeningsViewProps {
  settings: AppSettings;
  onCompletePractice?: (openingId: string, success: boolean) => void;
}

export const OpeningsView: React.FC<OpeningsViewProps> = ({
  settings,
  onCompletePractice,
}) => {
  const [selectedOpening, setSelectedOpening] = useState<OpeningItem | null>(null);
  const [activeTab, setActiveTab] = useState<'openings' | 'gambits'>('openings');
  const [searchQuery, setSearchQuery] = useState('');
  const [moveFilter, setMoveFilter] = useState<'all' | '1. e4' | '1. d4' | 'Flank'>('all');
  const [colorFilter, setColorFilter] = useState<'all' | 'w' | 'b'>('all');

  const allItems = useMemo(() => {
    return activeTab === 'openings' ? OPENINGS : GAMBITS;
  }, [activeTab]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Search match
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.eco.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.family.toLowerCase().includes(searchQuery.toLowerCase());

      // Move match
      const matchesMove = moveFilter === 'all' || item.firstMove === moveFilter;

      // Color match
      const matchesColor = colorFilter === 'all' || item.side === colorFilter;

      return matchesSearch && matchesMove && matchesColor;
    });
  }, [allItems, searchQuery, moveFilter, colorFilter]);

  if (selectedOpening) {
    return (
      <OpeningTrainer
        opening={selectedOpening}
        settings={settings}
        onBack={() => setSelectedOpening(null)}
        onCompletePractice={onCompletePractice}
      />
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto px-3 py-3 space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
            {activeTab === 'gambits' ? <Flame className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">
              {activeTab === 'gambits' ? 'Gambits Hub' : 'Openings Explorer'}
            </h1>
            <p className="text-xs text-slate-400">
              {activeTab === 'gambits'
                ? 'High-octane pawn sacrifices, opening traps, and attacking arsenals.'
                : 'Grandmaster repertoires with plain-language plans and SRS trainers.'}
            </p>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('openings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
              activeTab === 'openings'
                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Openings ({OPENINGS.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('gambits')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
              activeTab === 'gambits'
                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400" />
            <span>Gambits ({GAMBITS.length})</span>
          </button>
        </div>
      </div>

      {/* Search and Filter Strip */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by opening name, ECO (e.g. C50), or family..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 text-xs">
          <div className="flex items-center gap-1">
            {(['all', '1. e4', '1. d4', 'Flank'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMoveFilter(m)}
                className={`px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap shrink-0 text-[11px] ${
                  moveFilter === m
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {m === 'all' ? 'All Moves' : m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(['all', 'w', 'b'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColorFilter(c)}
                className={`px-2 py-1 rounded-lg border transition-colors text-[11px] ${
                  colorFilter === c
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {c === 'all' ? 'Any' : c === 'w' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Opening Cards Grid */}
      <div className="space-y-2">
        {filteredItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedOpening(item)}
            className="w-full text-left bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-3.5 transition-all shadow-md group flex items-center justify-between"
          >
            <div className="space-y-1 truncate pr-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {item.eco}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {item.firstMove} · for {item.side === 'w' ? 'White' : 'Black'}
                </span>
                {item.isGambit && (
                  <span className="text-[10px] font-bold text-orange-400 flex items-center gap-0.5">
                    <Flame className="w-3 h-3" />
                    <span>Gambit</span>
                  </span>
                )}
              </div>

              <h3 className="text-sm font-bold text-slate-100 group-hover:text-amber-300 transition-colors truncate">
                {item.name}
              </h3>

              <p className="text-xs text-slate-400 line-clamp-1">
                {item.mainIdea}
              </p>

              <div className="text-[11px] font-mono text-slate-500 pt-0.5 truncate">
                {item.moves.slice(0, 6).join(' ')}...
              </div>
            </div>

            <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-amber-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}

        {filteredItems.length === 0 && (
          <div className="text-center py-10 bg-slate-900/50 border border-slate-800 rounded-2xl text-slate-400 space-y-1">
            <p className="text-sm font-medium">No lines match your search.</p>
            <p className="text-xs text-slate-500">Try adjusting your move or search filter.</p>
          </div>
        )}
      </div>
    </div>
  );
};
