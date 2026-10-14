import React from 'react';
import { ActiveTab } from '../../types/chess';
import { GraduationCap, Target, Play, BookOpen, BarChart3 } from 'lucide-react';

interface BottomNavProps {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'learn', label: 'Learn', icon: <GraduationCap className="w-5 h-5" /> },
    { id: 'practice', label: 'Practice', icon: <Target className="w-5 h-5" /> },
    { id: 'play', label: 'Play', icon: <Play className="w-5 h-5" /> },
    { id: 'openings', label: 'Openings', icon: <BookOpen className="w-5 h-5" /> },
    { id: 'progress', label: 'Progress', icon: <BarChart3 className="w-5 h-5" /> },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-slate-800/80 pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-5 h-16 items-center px-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-colors relative ${
                isActive ? 'text-amber-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`transition-transform duration-150 ${isActive ? 'scale-110' : ''}`}>
                {tab.icon}
              </div>
              <span className="text-[10px] tracking-tight mt-1 truncate">{tab.label}</span>
              {isActive && (
                <span className="absolute top-1 w-1 h-1 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
