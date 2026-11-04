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
import { storageService } from '../services/storageService';
import {
  AIProviderId,
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
  voiceRate?: number;
  setVoiceRate?: (rate: number) => void;
  voiceVolume?: number;
  setVoiceVolume?: (volume: number) => void;
  aiProvider?: AIProviderId;
  setAiProvider?: (provider: AIProviderId) => void;
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
  voiceRate = 1.0,
  setVoiceRate,
  voiceVolume = 1.0,
  setVoiceVolume,
  aiProvider = 'auto',
  setAiProvider,
  aiApiKey,
  setAiApiKey,
  geminiApiKey = '',
  setGeminiApiKey,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [localRate, setLocalRate] = useState<number>(() => voiceRate ?? storageService.getSettings().voiceRate ?? 1.0);
  const [localVolume, setLocalVolume] = useState<number>(() => voiceVolume ?? storageService.getSettings().voiceVolume ?? 1.0);
  const [localProvider, setLocalProvider] = useState<AIProviderId>(() => aiProvider ?? storageService.getSettings().aiProvider ?? 'auto');

  if (!isOpen) return null;

  const activeApiKey = aiApiKey !== undefined ? aiApiKey : geminiApiKey;
  const handleKeyChange = (val: string) => {
    setAiApiKey?.(val);
    setGeminiApiKey?.(val);
    storageService.updateSetting('aiApiKey', val);
  };

  const handleProviderChange = (providerVal: AIProviderId) => {
    setLocalProvider(providerVal);
    setAiProvider?.(providerVal);
    storageService.updateSetting('aiProvider', providerVal);
  };

  const handleRateChange = (rateVal: number) => {
    setLocalRate(rateVal);
    setVoiceRate?.(rateVal);
    storageService.updateSetting('voiceRate', rateVal);
  };

  const handleVolumeChange = (volVal: number) => {
    setLocalVolume(volVal);
    setVoiceVolume?.(volVal);
    storageService.updateSetting('voiceVolume', volVal);
  };

  const detectedProvider = detectApiKeyProvider(activeApiKey, localProvider);

  const handleTestVoice = async () => {
    setIsTesting(true);
    try {
      await speak(
        "Hello! I am your chess coach. Let's analyze the board and find the strongest plan.",
        true,
        {
          ttsEngine,
          edgeVoice,
          rate: localRate,
          volume: localVolume,
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
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
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

        <div className="p-4 space-y-3.5 text-sm max-h-[82vh] overflow-y-auto">
          {/* 1. Coach Voice Output (Toggle Switch) */}
          <div className="flex items-center justify-between p-2.5 bg-slate-950/50 border border-slate-800 rounded-xl">
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

          {/* 2. Two-Column Grid: Coaching Mode & Coach Style / Persona */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Coaching Mode</span>
              </label>
              <select
                value={coachVerbosity}
                onChange={(e) => setCoachVerbosity?.(e.target.value as CoachVerbosity)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
              >
                <option value="silent">Silent — No Live Commentary</option>
                <option value="brief">Brief — Mistakes & Blunders Only</option>
                <option value="detailed">Detailed — Analyze & Suggest</option>
                <option value="verbose">Verbose — Deep Breakdown</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                <span>Coach Style / Persona</span>
              </label>
              <select
                value={coachPersonality}
                onChange={(e) => setCoachPersonality?.(e.target.value as CoachPersonality)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
              >
                <option value="strict">Strict Grandmaster — Direct precision</option>
                <option value="supportive">Supportive Mentor — Encouraging</option>
                <option value="aggressive">Tactical Attacker — Initiative & threats</option>
                <option value="professor">Positional Professor — Strategic plans</option>
              </select>
            </div>
          </div>

          {/* 3. Speech Engine & Coach Voice + Test Button */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Speech Engine</span>
              </label>
              <select
                value={ttsEngine}
                onChange={(e) => setTtsEngine(e.target.value as TTSEngineType)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
              >
                <option value="edge">Edge Neural TTS (Natural Coach Voice)</option>
                <option value="browser">Standard Device TTS (100% Offline)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Coach Voice
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={edgeVoice}
                  onChange={(e) => setEdgeVoice?.(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
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
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-semibold rounded-xl text-xs transition-colors shrink-0 flex items-center gap-1"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isTesting ? '...' : 'Test'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Compact Speed & Volume Sliders */}
          <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-xs">
            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Speed</span>
                <span className="font-mono text-slate-200">{localRate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={localRate}
                onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Volume</span>
                <span className="font-mono text-slate-200">{Math.round(localVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={localVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 5. AI Provider Dropdown + Universal AI API Key Input */}
          <div className="space-y-2.5 pt-2.5 border-t border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>AI Provider & Universal API Key</span>
              </label>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                  detectedProvider.provider !== 'none'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {detectedProvider.provider !== 'none'
                  ? `Active: ${detectedProvider.label}`
                  : 'Offline Heuristics / Built-in Key'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={localProvider}
                onChange={(e) => handleProviderChange(e.target.value as AIProviderId)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
                title="AI Provider"
              >
                <option value="auto">Auto-Detect (Smart)</option>
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq (Llama 3.3)</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="xai">xAI Grok</option>
              </select>

              <div className="relative sm:col-span-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={activeApiKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="Paste Gemini (AIza...), Groq (gsk_...), OpenAI (sk-...), Claude, or OpenRouter key"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 pr-9 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Supports Gemini, Groq, OpenAI, Claude, OpenRouter & xAI. Stored locally on device.</span>
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
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
