import React from 'react';
import { Bot, MessageSquare } from 'lucide-react';

interface LiveChatIndicatorProps {
  onClick: () => void;
}

export const LiveChatIndicator: React.FC<LiveChatIndicatorProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="absolute top-2 right-2 z-10 p-2 bg-slate-900/90 border border-slate-700 text-amber-400 rounded-full shadow-lg hover:bg-slate-800 transition-colors"
      title="Open Live Coach"
    >
      <MessageSquare className="w-5 h-5" />
    </button>
  );
};
