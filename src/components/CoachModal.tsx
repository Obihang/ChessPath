import React, { useState } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Sparkles,
  GraduationCap,
  Key,
  Eye,
  EyeOff,
  Cpu,
} from 'lucide-react';
import { EDGE_VOICES, speak, stopSpeech } from '../utils/voice';
import { detectApiKeyProvider } from '../services/coachService';
import {
  CoachPersonality,
  CoachVerbosity,
  TTSEngineType,
} from '../types/chess';

export interface CoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  voiceEnabled?: boolean;
  setVoiceEnabled?: (enabled: boolean) => void;
  coachVerbosity?: CoachVerbosity;
  setCoachVerbosity?: (verbosity: CoachVerbosity) => void;
  coachPersonality?: CoachPersonality;
  setCoachPersonality?: (personality: CoachPersonality) => void;
  ttsEngine: TTSEngineType;
  setTtsEngine: (engine: TTSEngineType) => void;
  edgeVoice?: string;
  setEdgeVoice?: (voice: string) => void;
  aiApiKey?: string;
  setAiApiKey?: (key: string) => void;
  geminiApiKey?: string;
  setGeminiApiKey?: (key: string) => void;
}

export const CoachModal: React.FC<CoachModalProps> = ({
  isOpen,
  onClose,
  voiceEnabled = true,
  setVoiceEnabled,
  coachVerbosity = 'detailed',
  setCoachVerbosity,
  coachPersonality = 'strict',
  setCoachPersonality,
  ttsEngine,
  setTtsEngine,
  edgeVoice = 'en-US-AndrewNeural',
  setEdgeVoice,
  aiApiKey,
  setAiApiKey,
  geminiApiKey = '',
  setGeminiApiKey,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const activeApiKey = aiApiKey !== undefined ? aiApiKey : geminiApiKey;
  const handleKeyChange = (val: string) => {
    setAiApiKey?.(val);
    setGeminiApiKey?.(val);
  };

  const detectedProvider = detectApiKeyProvider(activeApiKey);

  const handleTestVoice = async () => {
    setIsTesting(true);
    try {
      await speak(
        "Hello! I am your chess coach. Let's analyze the board and find the strongest plan.",
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-amber-400" />
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

        <div className="p-5 space-y-4 text-sm max-h-[80vh] overflow-y-auto">
          {/* 1. Voice Output (Mute / Active) Toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2.5">
              {voiceEnabled ? (
                <Volume2 className="w-4 h-4 text-amber-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Coach Voice Output
                </div>
                <div className="text-[11px] text-slate-400">
                  {voiceEnabled ? 'Active — Coach speaks feedback aloud' : 'Muted — Text commentary only'}
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={voiceEnabled}
              onClick={() => {
                const next = !voiceEnabled;
                if (!next) stopSpeech();
                setVoiceEnabled?.(next);
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                voiceEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                  voiceEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 2. Coaching Mode (coachVerbosity) Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Coaching Mode</span>
            </label>
            <select
              value={coachVerbosity}
              onChange={(e) => setCoachVerbosity?.(e.target.value as CoachVerbosity)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
            >
              <option value="silent">Silent — No Live Commentary</option>
              <option value="brief">Brief — Criticize Mistakes & Blunders Only</option>
              <option value="detailed">Detailed — Analyze Every Move, Criticize & Suggest</option>
              <option value="verbose">Verbose — Deep Tactical & Positional Breakdown</option>
            </select>
          </div>

          {/* 3. Coach Style / Persona (coachPersonality) Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
              <span>Coach Style / Persona</span>
            </label>
            <select
              value={coachPersonality}
              onChange={(e) => setCoachPersonality?.(e.target.value as CoachPersonality)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
            >
              <option value="strict">Strict Grandmaster — Direct criticism, demands precision</option>
              <option value="supportive">Supportive Mentor — Encouraging, constructive guidance</option>
              <option value="aggressive">Tactical Attacker — Focuses on initiative, threats & punishment</option>
              <option value="professor">Positional Professor — Strategic plans & structure</option>
            </select>
          </div>

          {/* 4. Speech Engine (ttsEngine) Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Speech Engine</span>
            </label>
            <select
              value={ttsEngine}
              onChange={(e) => setTtsEngine(e.target.value as TTSEngineType)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
            >
              <option value="edge">Edge Neural TTS (Natural Coach Voice)</option>
              <option value="browser">Standard Device TTS (100% Offline)</option>
            </select>
          </div>

          {/* 5. Coach Voice (edgeVoice) Dropdown + Compact Test Button */}
          {ttsEngine === 'edge' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Coach Voice
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={edgeVoice}
                  onChange={(e) => setEdgeVoice?.(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
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
                  className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-xl text-xs transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isTesting ? 'Playing...' : 'Test'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 6. Universal AI API Key Input (aiApiKey) */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Universal AI API Key (Optional)</span>
              </label>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                  detectedProvider.provider !== 'none'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {detectedProvider.provider !== 'none'
                  ? `Detected: ${detectedProvider.label}`
                  : 'Using Built-in Environment Key / Offline Heuristics'}
              </span>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={activeApiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="Paste Gemini (AIza...), Groq (gsk_...), OpenAI (sk-...), Claude, or OpenRouter key"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 pr-9 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
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
              <span>Supports Gemini, Groq, OpenAI, Claude, OpenRouter & xAI. Stored locally on device.</span>
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
