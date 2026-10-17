import React, { useState, useEffect } from 'react';
import { AppSettings, AIProviderId, BoardThemeId } from '../../types/chess';
import { speechService } from '../../services/speechService';
import { soundService } from '../../services/audioService';
import { storageService } from '../../services/storageService';
import { geminiService } from '../../services/geminiService';
import { GEMINI_PREBUILT_VOICES } from '../../constants/aiModels';
import { SpeechDiagnosticPanel } from '../common/SpeechDiagnosticPanel';
import {
  X,
  Volume2,
  VolumeX,
  Key,
  Palette,
  Mic,
  Download,
  Upload,
  Info,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Activity,
  Cpu,
  Bot,
} from 'lucide-react';
import { engineService, EngineStatusInfo, EngineTestResult } from '../../services/engineService';
import { PIECE_SETS, preloadPieceSet } from '../../config/pieceSets';
import { PieceIcon } from '../board/PieceIcon';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isTestingChat, setIsTestingChat] = useState(false);
  const [voiceTestStatus, setVoiceTestStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatusInfo>(() => engineService.getStatus());
  const [isTestingEngine, setIsTestingEngine] = useState(false);
  const [engineTestResult, setEngineTestResult] = useState<EngineTestResult | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
    if (isOpen) {
      const refreshStatus = () => setEngineStatus(engineService.getStatus());
      refreshStatus();
      const interval = setInterval(refreshStatus, 1000);
      return () => clearInterval(interval);
    }
  }, [settings, isOpen]);

  // Clean up speech on close and listen for Escape key
  useEffect(() => {
    if (!isOpen) {
      speechService.stop();
      setIsSpeaking(false);
      setVoiceTestStatus(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);

    if (key === 'soundEnabled') {
      soundService.setEnabled(value as boolean);
    }
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(storageService.exportAllData());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `chesspath-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        const content = event.target?.result as string;
        const success = storageService.importAllData(content);
        if (success) {
          const fresh = storageService.getSettings();
          setLocalSettings(fresh);
          onUpdateSettings(fresh);
          setImportStatus('Data imported successfully!');
          setTimeout(() => setImportStatus(null), 3000);
        } else {
          setImportStatus('Failed to import backup file.');
          setTimeout(() => setImportStatus(null), 3000);
        }
      };
    }
  };

  const handleProviderChange = (provider: AIProviderId) => {
    let defaultBaseUrl = '';
    let defaultModel = '';
    if (provider === 'groq') {
      defaultBaseUrl = 'https://api.groq.com/openai/v1';
      defaultModel = 'llama-3.3-70b-versatile';
    } else if (provider === 'openrouter') {
      defaultBaseUrl = 'https://openrouter.ai/api/v1';
      defaultModel = 'anthropic/claude-3.5-sonnet';
    } else if (provider === 'openai') {
      defaultBaseUrl = 'https://api.openai.com/v1';
      defaultModel = 'gpt-4o-mini';
    } else if (provider === 'bytez') {
      defaultBaseUrl = 'https://api.bytez.com/v1';
      defaultModel = 'Qwen/Qwen2.5-72B-Instruct';
    } else if (provider === 'custom') {
      defaultBaseUrl = 'https://api.openai.com/v1';
      defaultModel = 'gpt-3.5-turbo';
    }

    const updated: AppSettings = {
      ...localSettings,
      aiProvider: provider,
      aiBaseUrl: defaultBaseUrl,
      aiModelName: defaultModel,
    };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
    setVoiceTestStatus(null);
  };

  const handleApiKeyChange = (newKey: string) => {
    const trimmed = newKey.trim();
    const autoEnableNatural = trimmed.length > 0 && !localSettings.useNaturalVoice && localSettings.aiProvider === 'gemini';
    const updated: AppSettings = {
      ...localSettings,
      aiApiKey: trimmed,
      geminiApiKey: trimmed,
      useNaturalVoice: autoEnableNatural ? true : localSettings.useNaturalVoice,
    };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
    setVoiceTestStatus(null);
  };

  const handleTestEngine = async () => {
    setIsTestingEngine(true);
    setEngineTestResult(null);
    try {
      const res = await engineService.testEngine();
      setEngineTestResult(res);
      setEngineStatus(engineService.getStatus());
    } finally {
      setIsTestingEngine(false);
    }
  };

  const handleTestGeminiVoice = async () => {
    if (isSpeaking) {
      speechService.stop();
      setIsSpeaking(false);
      setVoiceTestStatus(null);
      return;
    }

    const keyToTest = (localSettings.geminiApiKey || localSettings.aiApiKey)?.trim();
    if (!keyToTest) {
      setVoiceTestStatus({
        type: 'error',
        message: 'No Gemini API key set. Please enter your key in the AI API Key section below.',
      });
      return;
    }

    setIsTestingVoice(true);
    setVoiceTestStatus({
      type: 'info',
      message: 'Connecting to Gemini to generate TTS speech...',
    });

    try {
      const res = await geminiService.testVoiceConnection(keyToTest);
      setIsTestingVoice(false);
      if (res.success && res.audioBuffer) {
        setIsSpeaking(true);
        setVoiceTestStatus({
          type: 'success',
          message: 'Gemini TTS working! Playing sample voice...',
        });

        const played = await soundService.playAudioArrayBuffer(
          res.audioBuffer,
          localSettings.voiceVolume,
          () => {
            setIsSpeaking(false);
          },
          localSettings.voiceRate
        );

        if (!played) {
          setIsSpeaking(false);
          setVoiceTestStatus({
            type: 'error',
            message: 'Web Audio playback failed on this device.',
          });
        }
      } else {
        const errText = res.error || 'Failed to generate audio.';
        setVoiceTestStatus({
          type: 'error',
          message: `Gemini TTS Error: ${errText}`,
        });
      }
    } catch (err: any) {
      setIsTestingVoice(false);
      setVoiceTestStatus({
        type: 'error',
        message: `Error connecting to Gemini TTS: ${err?.message || 'Check connection'}`,
      });
    }
  };

  const handleTestMicrophone = async () => {
    setIsTestingMic(true);
    setVoiceTestStatus({
      type: 'info',
      message: 'Recording 3 seconds from microphone to test Gemini STT...',
    });
    try {
      const res = await speechService.testMicrophone(localSettings.geminiApiKey || localSettings.aiApiKey);
      if (res.success) {
        setVoiceTestStatus({
          type: 'success',
          message: `Microphone test succeeded! Transcript: "${res.transcript || '(silence)'}"`,
        });
      } else {
        setVoiceTestStatus({
          type: 'error',
          message: res.error || 'Microphone test failed.',
        });
      }
    } catch (e: any) {
      setVoiceTestStatus({
        type: 'error',
        message: e?.message || 'Microphone test failed.',
      });
    } finally {
      setIsTestingMic(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>Settings & Preferences</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-6 overflow-y-auto flex-1 text-slate-200 text-sm">
          {/* Board & Piece Theme Section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Palette className="w-4 h-4" />
              <span>Board & Piece Appearance</span>
            </div>

            <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
              {/* Board Theme */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Board Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['walnut', 'green', 'blue', 'iceland', 'glass', 'dark'] as BoardThemeId[]).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => handleChange('boardTheme', theme)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all cursor-pointer ${
                        localSettings.boardTheme === theme
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              {/* Piece Set Selection */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <label className="text-xs font-medium text-slate-400">Piece Set Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {PIECE_SETS.map((pset) => (
                    <button
                      key={pset.id}
                      type="button"
                      onClick={() => {
                        preloadPieceSet(pset.id);
                        handleChange('pieceSet', pset.id);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all cursor-pointer ${
                        (localSettings.pieceSet || 'cburnett') === pset.id
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <PieceIcon type="n" color="w" className="w-5 h-5" pieceSet={pset.id} />
                        <PieceIcon type="q" color="b" className="w-5 h-5" pieceSet={pset.id} />
                      </div>
                      <span className="text-[11px] font-medium leading-none">{pset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Sound Effects Section */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Volume2 className="w-4 h-4" />
                <span>Move Sound Effects</span>
              </div>
              <button
                type="button"
                onClick={() => handleChange('soundEnabled', !localSettings.soundEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  localSettings.soundEnabled
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {localSettings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                {localSettings.soundEnabled ? 'Enabled' : 'Muted'}
              </button>
            </div>
          </section>

          {/* Voice Coach Settings */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Mic className="w-4 h-4" />
                <span>AI Voice Coach (Gemini TTS & STT)</span>
              </div>
              <input
                type="checkbox"
                checked={localSettings.voiceEnabled}
                onChange={(e) => handleChange('voiceEnabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            <div className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg leading-relaxed">
              💡 Voice features (TTS audio playback & microphone transcription) always use your Gemini API key, even if another provider is selected for text chat.
            </div>

            {localSettings.voiceEnabled && (
              <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-xs">
                {/* Gemini Voice Picker */}
                <div className="space-y-1">
                  <label className="text-slate-400 font-medium">Gemini Voice Persona</label>
                  <select
                    value={localSettings.geminiVoice || 'Kore'}
                    onChange={(e) => handleChange('geminiVoice', e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-hidden focus:border-amber-500"
                  >
                    {GEMINI_PREBUILT_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} — {v.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rate & Volume Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Speed</span>
                      <span>{localSettings.voiceRate}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={localSettings.voiceRate}
                      onChange={(e) => handleChange('voiceRate', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Volume</span>
                      <span>{Math.round(localSettings.voiceVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={localSettings.voiceVolume}
                      onChange={(e) => handleChange('voiceVolume', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Additional Settings */}
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Reveal better move names</span>
                    <input
                      type="checkbox"
                      checked={localSettings.revealBetterMoveNames ?? true}
                      onChange={(e) => handleChange('revealBetterMoveNames', e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Send automatically after transcribing</span>
                    <input
                      type="checkbox"
                      checked={localSettings.autoSendTranscribed ?? false}
                      onChange={(e) => handleChange('autoSendTranscribed', e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Voice & Microphone Test Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestGeminiVoice}
                    disabled={isTestingVoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    {isTestingVoice ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : isSpeaking ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Test Gemini Voice</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestMicrophone}
                    disabled={isTestingMic}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                  >
                    {isTestingMic ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        <span>Recording 3s...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-amber-400" />
                        <span>Test Microphone (3s)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Test Result Toast */}
                {voiceTestStatus && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-start gap-2 border ${
                      voiceTestStatus.type === 'error'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : voiceTestStatus.type === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    {voiceTestStatus.type === 'error' ? (
                      <span className="font-bold">⚠️</span>
                    ) : voiceTestStatus.type === 'success' ? (
                      <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    ) : (
                      <Loader2 className="w-4 h-4 shrink-0 animate-spin text-amber-400 mt-0.5" />
                    )}
                    <div className="flex-1 leading-snug">{voiceTestStatus.message}</div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* AI Provider & API Key Section */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Key className="w-4 h-4" />
                <span>AI Service Provider & Key</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-xs">
              {/* Provider Radio Selector */}
              <div className="space-y-1.5">
                <label className="text-slate-400 font-medium">Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['gemini', 'groq', 'openrouter', 'openai', 'bytez', 'custom'] as AIProviderId[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleProviderChange(p)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all cursor-pointer ${
                        (localSettings.aiProvider || 'gemini') === p
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {p === 'gemini' ? 'Google Gemini' : p === 'openrouter' ? 'OpenRouter' : p === 'groq' ? 'GroqCloud' : p === 'bytez' ? 'Bytez' : p === 'openai' ? 'OpenAI' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium">
                  {localSettings.aiProvider === 'gemini'
                    ? 'Gemini API Key'
                    : `${localSettings.aiProvider.toUpperCase()} API Key`}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={localSettings.aiApiKey || localSettings.geminiApiKey || ''}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={
                      localSettings.aiProvider === 'gemini'
                        ? 'AIzaSy...'
                        : localSettings.aiProvider === 'groq'
                        ? 'gsk_...'
                        : 'sk-...'
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-hidden focus:border-amber-500"
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

              {/* Custom Base URL & Model Name for non-Gemini providers */}
              {localSettings.aiProvider !== 'gemini' && (
                <div className="space-y-2 pt-2 border-t border-slate-800/80">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Base URL</label>
                    <input
                      type="text"
                      value={localSettings.aiBaseUrl || ''}
                      onChange={(e) => handleChange('aiBaseUrl', e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Model Name</label>
                    <input
                      type="text"
                      value={localSettings.aiModelName || ''}
                      onChange={(e) => handleChange('aiModelName', e.target.value)}
                      placeholder="gpt-4o-mini"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Data Backup & Restore */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Download className="w-4 h-4" />
              <span>Data Backup & Restore</span>
            </div>

            <p className="text-xs text-slate-400">
              Export your training progress and preferences to a JSON file to transfer between devices.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Export JSON</span>
              </button>

              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-amber-400" />
                <span>Import JSON</span>
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>

            {importStatus && <p className="text-xs text-amber-400">{importStatus}</p>}
          </section>

          {/* Expandable Audio Diagnostics */}
          <section className="border-t border-slate-800/80 pt-4">
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 text-slate-300 border border-slate-800 text-xs font-medium transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Audio & Speech Diagnostics Log</span>
              </div>
              <span className="text-slate-400">{showDiagnostics ? '▲ Hide' : '▼ Show'}</span>
            </button>

            {showDiagnostics && (
              <div className="mt-2">
                <SpeechDiagnosticPanel
                  settings={localSettings}
                  onUpdateSettings={(updated) => {
                    setLocalSettings(updated);
                    storageService.saveSettings(updated);
                    onUpdateSettings(updated);
                  }}
                />
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-xl text-xs shadow-md transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
