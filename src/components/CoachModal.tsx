import React, { useState } from 'react';
import { X, Volume2, Sparkles, Key, Eye, EyeOff, Cpu, Check } from 'lucide-react';
import { EDGE_VOICES, speak, stopSpeech } from '../utils/voice';
import { TTSEngineType } from '../types/chess';

interface CoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  ttsEngine: TTSEngineType;
  setTtsEngine: (engine: TTSEngineType) => void;
  edgeVoice?: string;
  setEdgeVoice?: (voice: string) => void;
  geminiApiKey?: string;
  setGeminiApiKey?: (key: string) => void;
}

export const CoachModal: React.FC<CoachModalProps> = ({
  isOpen,
  onClose,
  ttsEngine,
  setTtsEngine,
  edgeVoice = 'en-US-AndrewNeural',
  setEdgeVoice,
  geminiApiKey = '',
  setGeminiApiKey,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleTestVoice = async () => {
    setIsTesting(true);
    try {
      await speak(
        "Hello! I am your chess coach. Let's find the best move together.",
        true,
        {
          ttsEngine,
          edgeVoice,
          onEnd: () => setIsTesting(false),
          onError: () => setIsTesting(false),
        }
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopSpeech();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold">Coach Voice & AI Settings</h2>
          </div>
          <button
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          {/* Voice Engine Selection */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Coach Voice Engine</span>
            </label>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setTtsEngine('edge')}
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  ttsEngine === 'edge'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs">Edge Neural TTS (Natural Coach Voice)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Expressive Microsoft neural voices with automatic offline fallback
                  </div>
                </div>
                {ttsEngine === 'edge' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => setTtsEngine('browser')}
                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  ttsEngine === 'browser'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-200'
                    : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs">Standard Device TTS (100% Offline)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Built-in system speech synthesis with zero network usage
                  </div>
                </div>
                {ttsEngine === 'browser' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            </div>
          </div>

          {/* Coach Voice Persona Selector when 'edge' is selected */}
          {ttsEngine === 'edge' && (
            <div className="space-y-2.5 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800">
              <label className="text-xs font-semibold text-slate-300 block">
                Coach Voice Persona
              </label>
              <select
                value={edgeVoice}
                onChange={(e) => setEdgeVoice?.(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
              >
                {EDGE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleTestVoice}
                disabled={isTesting}
                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-lg text-xs transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Playing Sample...' : 'Test Voice'}</span>
              </button>
            </div>
          )}

          {/* Optional Gemini AI Text Coach Key */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Gemini AI Text Coach Key (Optional)</span>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey?.(e.target.value)}
                placeholder="AIzaSy... (for Ask Coach & AI Game Summary)"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-9 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Used strictly for text coaching. Stored locally on your device.</span>
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            type="button"
            onClick={() => {
              stopSpeech();
              onClose();
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-xl text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
