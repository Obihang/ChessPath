import React, { useState, useEffect } from 'react';
import { AppSettings, AIProviderId, BoardThemeId } from '../../types/chess';
import { speechService } from '../../services/speechService';
import { soundService } from '../../services/audioService';
import { storageService } from '../../services/storageService';
import { geminiService } from '../../services/geminiService';
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
  Play,
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [saveToast, setSaveToast] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [testingType, setTestingType] = useState<'gemini' | 'browser' | null>(null);
  const [isTestingChat, setIsTestingChat] = useState(false);
  const [voiceTestStatus, setVoiceTestStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatusInfo>(() => engineService.getStatus());
  const [isTestingEngine, setIsTestingEngine] = useState(false);
  const [engineTestResult, setEngineTestResult] = useState<EngineTestResult | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
    if (speechService.isAvailable()) {
      setVoices(speechService.getVoices());
    }
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
    }

    const updated: AppSettings = {
      ...localSettings,
      aiProvider: provider,
      aiBaseUrl: localSettings.aiBaseUrl || defaultBaseUrl,
      aiModelName: localSettings.aiModelName || defaultModel,
    };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
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

  const handleBaseUrlChange = (url: string) => {
    const updated: AppSettings = {
      ...localSettings,
      aiBaseUrl: url.trim(),
    };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
  };

  const handleModelNameChange = (model: string) => {
    const updated: AppSettings = {
      ...localSettings,
      aiModelName: model.trim(),
    };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
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

    const keyToTest = localSettings.geminiApiKey?.trim();
    if (!keyToTest) {
      setVoiceTestStatus({
        type: 'error',
        message: 'Please paste your Gemini API key in the field below first.',
      });
      return;
    }

    setIsTestingVoice(true);
    setTestingType('gemini');
    setVoiceTestStatus({
      type: 'info',
      message: 'Connecting to Gemini to generate natural voice...',
    });

    try {
      const res = await geminiService.testVoiceConnection(keyToTest);
      if (res.success && res.audioBuffer) {
        setIsSpeaking(true);
        setVoiceTestStatus({
          type: 'success',
          message: 'Gemini Natural Voice is working! Playing greeting audio...',
        });

        const played = await soundService.playAudioArrayBuffer(
          res.audioBuffer,
          localSettings.voiceVolume,
          () => {
            setIsSpeaking(false);
            setIsTestingVoice(false);
            setTestingType(null);
          }
        );

        if (!played) {
          setVoiceTestStatus({
            type: 'info',
            message: 'Web Audio playback had an issue. Playing browser voice fallback...',
          });
          handleTestBrowserVoice();
        }
      } else {
        setIsTestingVoice(false);
        setTestingType(null);
        const errText = res.error || 'Failed to generate audio';
        setVoiceTestStatus({
          type: 'error',
          message: `Gemini API: ${errText}. Playing offline browser voice fallback...`,
        });
        speechService.speak('Welcome to ChessPath! Gemini key noted, offline voice active.', {
          rate: localSettings.voiceRate,
          volume: localSettings.voiceVolume,
          voiceURI: localSettings.selectedVoiceURI,
        });
      }
    } catch (err: any) {
      setIsTestingVoice(false);
      setTestingType(null);
      setVoiceTestStatus({
        type: 'error',
        message: `Error connecting to Gemini: ${err?.message || 'Check network'}. Playing offline browser voice fallback...`,
      });
      speechService.speak('Welcome to ChessPath! Offline voice active.', {
        rate: localSettings.voiceRate,
        volume: localSettings.voiceVolume,
        voiceURI: localSettings.selectedVoiceURI,
      });
    }
  };

  const handleTestBrowserVoice = () => {
    if (isSpeaking) {
      speechService.stop();
      setIsSpeaking(false);
      setVoiceTestStatus(null);
      return;
    }

    setIsSpeaking(true);
    setTestingType('browser');
    setVoiceTestStatus({
      type: 'info',
      message: 'Speaking with browser offline text-to-speech...',
    });

    speechService.speak('Welcome to ChessPath! Knight to f3. King safety is key.', {
      rate: localSettings.voiceRate,
      volume: localSettings.voiceVolume,
      voiceURI: localSettings.selectedVoiceURI,
      onStart: () => {
        setIsSpeaking(true);
      },
      onEnd: () => {
        setIsSpeaking(false);
        setTestingType(null);
      },
      onError: (err: any) => {
        setIsSpeaking(false);
        setTestingType(null);
        setVoiceTestStatus({
          type: 'error',
          message: 'Browser SpeechSynthesis error. Check your device volume or permissions.',
        });
      },
    });
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-100">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Board Appearance */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Palette className="w-4 h-4" />
              <span>Board Appearance</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'walnut', name: 'Warm Walnut', light: '#f0d9b5', dark: '#b58863' },
                  { id: 'green', name: 'Forest Green', light: '#eeeed2', dark: '#769656' },
                  { id: 'slate', name: 'Slate Blue', light: '#c3cdd7', dark: '#4a6886' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleChange('boardTheme', t.id as BoardThemeId)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                    localSettings.boardTheme === t.id
                      ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <div className="w-12 h-12 rounded-md grid grid-cols-2 grid-rows-2 overflow-hidden border border-black/30 shadow-xs">
                    <div style={{ backgroundColor: t.light }} />
                    <div style={{ backgroundColor: t.dark }} />
                    <div style={{ backgroundColor: t.dark }} />
                    <div style={{ backgroundColor: t.light }} />
                  </div>
                  <span className="text-xs font-medium text-slate-300">{t.name}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label htmlFor="coords-toggle" className="text-xs text-slate-300">
                Show board coordinates (1-8, a-h)
              </label>
              <input
                id="coords-toggle"
                type="checkbox"
                checked={localSettings.showCoordinates}
                onChange={(e) => handleChange('showCoordinates', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </section>

          {/* Piece Sets & Styling */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Palette className="w-4 h-4" />
                <span>Chess Piece Sets & Contrast</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Choose professional vector piece sets. Each set is preloaded to avoid flicker and runs fully offline.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PIECE_SETS.map((set) => {
                const isSelected = (localSettings.pieceSet || 'cburnett') === set.id;
                return (
                  <button
                    key={set.id}
                    onClick={() => {
                      handleChange('pieceSet', set.id);
                      preloadPieceSet(set.id);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-xs text-slate-200">{set.name}</div>
                        <div className="text-[10px] text-slate-400">By {set.author}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {set.license}
                      </span>
                    </div>

                    {/* Live Preview of 12 Pieces */}
                    <div className="grid grid-cols-6 gap-1 p-1.5 bg-slate-900/80 rounded-lg border border-slate-800">
                      {(['k', 'q', 'r', 'b', 'n', 'p'] as const).map((t) => (
                        <div key={`w-${t}`} className="w-6 h-6 flex items-center justify-center">
                          <PieceIcon type={t} color="w" pieceSet={set.id} pieceShadow={localSettings.pieceShadow} />
                        </div>
                      ))}
                      {(['k', 'q', 'r', 'b', 'n', 'p'] as const).map((t) => (
                        <div key={`b-${t}`} className="w-6 h-6 flex items-center justify-center">
                          <PieceIcon type={t} color="b" pieceSet={set.id} pieceShadow={localSettings.pieceShadow} />
                        </div>
                      ))}
                    </div>

                    <div className="text-[10px] text-slate-500 leading-tight">{set.description}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <div>
                <label htmlFor="shadow-toggle" className="text-xs font-medium text-slate-200 cursor-pointer">
                  Subtle Piece Drop-Shadow
                </label>
                <div className="text-[10px] text-slate-400">Enhances contrast and depth on wooden board squares</div>
              </div>
              <input
                id="shadow-toggle"
                type="checkbox"
                checked={localSettings.pieceShadow ?? true}
                onChange={(e) => handleChange('pieceShadow', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </section>

          {/* Sound & Audio */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Volume2 className="w-4 h-4" />
              <span>Audio & Move Sounds</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Sound effects (moves, captures, checks)</span>
              <button
                onClick={() => {
                  const next = !localSettings.soundEnabled;
                  handleChange('soundEnabled', next);
                  if (next) soundService.playMove();
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  localSettings.soundEnabled
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
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
                <span>AI Voice Coach (Text-to-Speech)</span>
              </div>
              <input
                type="checkbox"
                checked={localSettings.voiceEnabled}
                onChange={(e) => handleChange('voiceEnabled', e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>

            {localSettings.voiceEnabled && (
              <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-xs">
                {/* Voice Selection */}
                {voices.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-slate-400">Offline Voice (Web Speech)</label>
                    <select
                      value={localSettings.selectedVoiceURI}
                      onChange={(e) => handleChange('selectedVoiceURI', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-hidden focus:border-amber-500"
                    >
                      <option value="">Default System Voice</option>
                      {voices
                        .filter((v) => v.lang.startsWith('en'))
                        .map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Rate & Volume Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Speed</span>
                      <span>{localSettings.voiceRate}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.7"
                      max="1.4"
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

                {/* Natural Voice Switch */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-medium text-slate-300">
                      <span>Natural Voice (Gemini TTS)</span>
                      {localSettings.geminiApiKey && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-md font-semibold">
                          Key Connected
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {localSettings.geminiApiKey
                        ? 'High-fidelity AI voice via your Gemini key'
                        : 'Requires Gemini API key (paste below)'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.useNaturalVoice}
                    onChange={(e) => handleChange('useNaturalVoice', e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </div>

                {/* Voice Test Actions */}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  {localSettings.useNaturalVoice && localSettings.geminiApiKey ? (
                    <button
                      type="button"
                      onClick={handleTestGeminiVoice}
                      disabled={isTestingVoice && testingType !== 'gemini'}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      {isTestingVoice && testingType === 'gemini' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating Voice...</span>
                        </>
                      ) : isSpeaking && testingType === 'gemini' ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" />
                          <span>Stop Gemini Audio</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Test Gemini Voice</span>
                        </>
                      )}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleTestBrowserVoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                  >
                    {isSpeaking && testingType === 'browser' ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                        <span>Stop Browser Voice</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Test Offline Browser Voice</span>
                      </>
                    )}
                  </button>
                  
                  {localSettings.geminiApiKey && (
                    <button
                      type="button"
                      disabled={isTestingChat || isTestingVoice}
                      onClick={async () => {
                        setIsTestingChat(true);
                        setVoiceTestStatus({ type: 'info', message: 'Testing Coach Chat with Gemini API...' });
                        try {
                          const reply = await geminiService.chat(
                            [{ role: 'user', parts: [{ text: 'Say hello in one sentence.' }] }],
                            'You are ChessPath AI Coach. Say hello in one friendly sentence.'
                          );
                          setVoiceTestStatus({ type: 'success', message: `Coach reply: "${reply}"` });
                          speechService.logDiagnostic('info', `Coach chat test succeeded: ${reply}`);
                          if (localSettings.voiceEnabled) {
                            speechService.speakWithCoach(reply, localSettings);
                          }
                        } catch (e: any) {
                          const msg = e?.message || '';
                          let formattedError = '';
                          if (msg === 'NO_KEY') {
                            formattedError = 'No API key set. Please paste your Gemini API key above.';
                          } else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
                            formattedError = 'Invalid API key (401/403). Please verify your Gemini API key in Settings.';
                          } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
                            formattedError = 'Gemini quota or rate limit reached (429). Please wait a minute and try again.';
                          } else if (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound')) {
                            formattedError = 'Gemini model error: model not found.';
                          } else if (msg.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
                            formattedError = 'Network error: you appear to be offline.';
                          } else {
                            formattedError = `Coach service error: ${msg}`;
                          }
                          speechService.logDiagnostic('error', `Coach chat test failed: ${formattedError}`, { error: e });
                          setVoiceTestStatus({ type: 'error', message: formattedError });
                        } finally {
                          setIsTestingChat(false);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {isTestingChat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                      <span>Test Coach Chat</span>
                    </button>
                  )}
                </div>

                {/* Status or Troubleshooting Toast */}
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

                <div className="text-[10px] text-slate-500 pt-0.5 leading-relaxed">
                  💡 Can't hear anything? Check your device volume, verify this browser tab isn't muted, and tap "Test Voice" to ensure browser audio permission is active.
                </div>

                {/* Expandable Audio Diagnostics */}
                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-medium">Audio & Speech Diagnostics Log</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {showDiagnostics ? '▲ Hide Log' : '▼ Live Log & Verification'}
                    </span>
                  </button>

                  {showDiagnostics && (
                    <div className="mt-2.5">
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
                </div>
              </div>
            )}
          </section>

          {/* Chess Engine Diagnostics */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Cpu className="w-4 h-4" />
                <span>Chess Engine Diagnostics</span>
              </div>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                  engineStatus.isStockfishReady
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                }`}
              >
                {engineStatus.statusLabel}
              </span>
            </div>

            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Engine status:</span>
                <span className="font-semibold text-slate-200">
                  {engineStatus.statusLabel}
                </span>
              </div>

              {engineStatus.lastError && (
                <div className="p-2 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-300 text-[11px] leading-relaxed">
                  <span className="font-semibold">Last load error: </span>
                  {engineStatus.lastError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <p className="text-[11px] text-slate-400 leading-tight">
                  Single-threaded WASM Stockfish 19 Lite with embedded NNUE network.
                </p>
                <button
                  type="button"
                  onClick={handleTestEngine}
                  disabled={isTestingEngine}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors shrink-0"
                >
                  {isTestingEngine ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Calculating...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-amber-400" />
                      <span>Test engine</span>
                    </>
                  )}
                </button>
              </div>

              {engineTestResult && (
                <div
                  className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                    engineTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div>
                    <span className="font-semibold">Move: </span>
                    <span className="font-mono text-slate-100">{engineTestResult.san || engineTestResult.bestMove}</span>
                    <span className="text-slate-400 ml-2">({engineTestResult.timeTakenMs}ms)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-850 border border-slate-700 text-slate-300">
                    {engineTestResult.engineUsed === 'stockfish' ? 'Stockfish 19 Lite' : 'Minimax Fallback'}
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* AI Provider & API Key */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Key className="w-4 h-4" />
              <span>AI Coach & Provider Settings</span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Use Google Gemini, GroqCloud, OpenRouter, OpenAI, Bytez, or any OpenAI-compatible API for AI position analysis, tactical hints, and live coaching.
            </p>

            <div className="space-y-3">
              {/* Provider Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">AI Provider</label>
                <select
                  value={localSettings.aiProvider || 'gemini'}
                  onChange={(e) => handleProviderChange(e.target.value as AIProviderId)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 cursor-pointer"
                >
                  <option value="gemini">Google Gemini (Default)</option>
                  <option value="groq">Groq Cloud (Fast LLMs)</option>
                  <option value="openrouter">OpenRouter (Claude, Llama, etc.)</option>
                  <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                  <option value="bytez">Bytez API</option>
                  <option value="custom">Custom OpenAI-Compatible API</option>
                </select>
              </div>

              {/* API Key Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder={
                      localSettings.aiProvider === 'groq'
                        ? 'Paste Groq API key (gsk_...)'
                        : localSettings.aiProvider === 'openrouter'
                        ? 'Paste OpenRouter API key (sk-or-...)'
                        : localSettings.aiProvider === 'openai'
                        ? 'Paste OpenAI API key (sk-...)'
                        : 'Paste API Key / Gemini Key (AIzaSy...)'
                    }
                    value={localSettings.aiApiKey || localSettings.geminiApiKey || ''}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 pr-10 text-xs text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Base URL & Model Name for non-gemini or custom */}
              {localSettings.aiProvider && localSettings.aiProvider !== 'gemini' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">API Base URL</label>
                    <input
                      type="text"
                      placeholder="https://api.groq.com/openai/v1"
                      value={localSettings.aiBaseUrl || ''}
                      onChange={(e) => handleBaseUrlChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Model Name</label>
                    <input
                      type="text"
                      placeholder={
                        localSettings.aiProvider === 'groq'
                          ? 'llama-3.3-70b-versatile'
                          : localSettings.aiProvider === 'openrouter'
                          ? 'anthropic/claude-3.5-sonnet'
                          : localSettings.aiProvider === 'openai'
                          ? 'gpt-4o-mini'
                          : 'model-name'
                      }
                      value={localSettings.aiModelName || ''}
                      onChange={(e) => handleModelNameChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              {(localSettings.aiApiKey || localSettings.geminiApiKey) ? (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                      <Check className="w-3.5 h-3.5" />
                      <span>API Key saved locally & ready</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTestGeminiVoice}
                        disabled={isTestingVoice && testingType !== 'gemini'}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-semibold shadow-xs transition-colors"
                      >
                        {isTestingVoice && testingType === 'gemini' ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : isSpeaking && testingType === 'gemini' ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5" />
                            <span>Stop Voice</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Test Voice with Key</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleTestBrowserVoice}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Test Offline</span>
                      </button>
                    </div>
                  </div>

                  {/* Immediate live status right under API Key input */}
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
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <div className="text-[11px] text-slate-500">
                    No key set. All non-AI features work 100% free offline.
                  </div>
                  <button
                    type="button"
                    onClick={handleTestBrowserVoice}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Test Offline Voice</span>
                  </button>
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

            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>

              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Import JSON</span>
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>

            {importStatus && (
              <div className="text-xs text-emerald-400 font-medium">{importStatus}</div>
            )}
          </section>

          {/* Licensing & Attribution */}
          <section className="border-t border-slate-800/80 pt-4 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center gap-1 text-slate-400 font-medium">
              <Info className="w-3.5 h-3.5" />
              <span>Credits & Attribution</span>
            </div>
            <p>
              Chess pieces designed by Colin M.L. Burnett (Cburnett) under CC-BY-SA 3.0. Stockfish engine licensed under GNU GPL v3.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
