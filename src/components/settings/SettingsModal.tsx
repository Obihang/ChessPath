import React, { useState, useEffect } from 'react';
import { AppSettings, AIProviderId, BoardThemeId, TTSEngineType } from '../../types/chess';
import { speechService } from '../../services/speechService';
import { soundService } from '../../services/audioService';
import { storageService } from '../../services/storageService';
import { getMoveTimingLogs, coachCommentaryService } from '../../services/coachCommentaryService';
import { EDGE_NEURAL_VOICES } from '../../constants/aiModels';
import { speak } from '../../utils/voice';
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
  Check,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  Activity,
  Bot,
} from 'lucide-react';
import { engineService, EngineStatusInfo } from '../../services/engineService';
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
  const [voiceTestStatus, setVoiceTestStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [, setEngineStatus] = useState<EngineStatusInfo>(() => engineService.getStatus());
  const [isTestingSampleMove, setIsTestingSampleMove] = useState(false);
  const [sampleMoveResult, setSampleMoveResult] = useState<{
    engineFacts?: string;
    generatedText?: string;
    timeToFirstAudioMs?: number;
    error?: string;
  } | null>(null);

  const handleTestCoachSampleMove = async () => {
    setIsTestingSampleMove(true);
    setSampleMoveResult(null);
    try {
      const fenBefore = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
      const fenAfter = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
      const move = { from: 'g1', to: 'f3', san: 'Nf3', color: 'w' as const, piece: 'n' as const, fen: fenAfter };

      const facts = await coachCommentaryService.computeMoveFacts(fenBefore, fenAfter, move, 'w');
      const commentary = await coachCommentaryService.generateCommentary(facts, ['e4', 'e5', 'Nf3'], localSettings.coachMode, true);

      let timeToFirst = 0;
      let errStr: string | undefined;

      const tStart = Date.now();
      const res = await speechService.speakWithCoach(commentary?.comment || 'Good move.', localSettings, {
        onFirstAudio: (ms) => {
          timeToFirst = ms;
        },
      });
      if (!timeToFirst) {
        timeToFirst = Date.now() - tStart;
      }
      if (!res.success) {
        errStr = res.error || 'TTS failed';
      }

      const fmtEval = (cp: number | null) => (cp !== null ? `${cp > 0 ? '+' : ''}${cp} cp` : 'N/A');
      setSampleMoveResult({
        engineFacts: `Eval before: ${fmtEval(facts.evalBefore)}, eval after: ${fmtEval(facts.evalAfter)}, class: ${facts.classification}, bestMove: ${facts.bestMoveSan || 'N/A'}`,
        generatedText: commentary?.comment || 'Good move.',
        timeToFirstAudioMs: timeToFirst,
        error: errStr,
      });
    } catch (e: any) {
      setSampleMoveResult({ error: e?.message || 'Sample test failed' });
    } finally {
      setIsTestingSampleMove(false);
    }
  };

  useEffect(() => {
    setLocalSettings(settings);
    if (isOpen) {
      const refreshStatus = () => setEngineStatus(engineService.getStatus());
      refreshStatus();
      const interval = setInterval(refreshStatus, 1000);
      return () => clearInterval(interval);
    }
  }, [settings, isOpen]);

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
    const updated: AppSettings = { ...localSettings, [key]: value };
    if (key === 'ttsEngine') {
      updated.useNaturalVoice = value === 'edge';
    } else if (key === 'useNaturalVoice') {
      updated.ttsEngine = value ? 'edge' : 'browser';
    } else if (key === 'edgeVoice') {
      updated.geminiVoice = value as string;
    } else if (key === 'geminiVoice') {
      updated.edgeVoice = value as string;
    }

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
    const updated: AppSettings =
      localSettings.aiProvider === 'gemini'
        ? {
            ...localSettings,
            geminiApiKey: trimmed,
            aiApiKey: trimmed,
          }
        : {
            ...localSettings,
            aiApiKey: trimmed,
          };
    setLocalSettings(updated);
    storageService.saveSettings(updated);
    onUpdateSettings(updated);
    setVoiceTestStatus(null);
  };

  const handleTestEdgeVoice = async () => {
    if (isSpeaking) {
      speechService.stop();
      setIsSpeaking(false);
      setVoiceTestStatus(null);
      return;
    }

    setIsTestingVoice(true);
    setVoiceTestStatus({
      type: 'info',
      message: 'Synthesizing coach voice sample...',
    });

    try {
      const currentEngine: TTSEngineType =
        localSettings.ttsEngine || (localSettings.useNaturalVoice === false ? 'browser' : 'edge');
      const currentVoice = localSettings.edgeVoice || 'en-US-AndrewNeural';

      const res = await speak(
        "Hello! I am your chess coach. Let's find the best move together.",
        true,
        {
          ttsEngine: currentEngine,
          edgeVoice: currentVoice,
          rate: localSettings.voiceRate,
          volume: localSettings.voiceVolume,
          onStart: () => {
            setIsTestingVoice(false);
            setIsSpeaking(true);
            setVoiceTestStatus({
              type: 'success',
              message:
                currentEngine === 'edge'
                  ? `Playing Edge Neural Voice (${currentVoice})...`
                  : 'Playing Standard Device TTS...',
            });
          },
          onEnd: () => {
            setIsSpeaking(false);
          },
          onError: (err) => {
            setIsSpeaking(false);
            setVoiceTestStatus({
              type: 'error',
              message: err.message || 'Voice playback failed on this device.',
            });
          },
        }
      );

      setIsTestingVoice(false);
      if (!res.success) {
        setIsSpeaking(false);
        setVoiceTestStatus({
          type: 'error',
          message: 'Speech playback unavailable on this device.',
        });
      }
    } catch (err: any) {
      setIsTestingVoice(false);
      setIsSpeaking(false);
      setVoiceTestStatus({
        type: 'error',
        message: `Voice test error: ${err?.message || 'Check audio settings'}`,
      });
    }
  };

  const handleTestMicrophone = async () => {
    setIsTestingMic(true);
    setVoiceTestStatus({
      type: 'info',
      message: 'Recording 3 seconds from microphone to test STT...',
    });
    try {
      const res = await speechService.testMicrophone(localSettings.geminiApiKey);
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

  const activeTtsEngine: TTSEngineType =
    localSettings.ttsEngine || (localSettings.useNaturalVoice === false ? 'browser' : 'edge');

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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Board Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['walnut', 'green', 'slate'] as BoardThemeId[]).map((theme) => (
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

          {/* Voice Coach Settings (Edge Neural TTS & Standard Device TTS) */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Mic className="w-4 h-4" />
                <span>AI Voice Coach (Edge Neural TTS)</span>
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
                {/* TTS Engine Toggle: Edge Neural vs Standard Device */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-medium">Coach Voice Engine</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleChange('ttsEngine', 'edge')}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        activeTtsEngine === 'edge'
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-semibold">Edge Neural TTS (Natural Coach Voice)</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Expressive neural coach voices</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChange('ttsEngine', 'browser')}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        activeTtsEngine === 'browser'
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="font-semibold">Standard Device TTS (100% Offline)</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Built-in device speech synthesis</div>
                    </button>
                  </div>
                </div>

                {/* Curated Edge Neural Voice Persona Picker */}
                {activeTtsEngine === 'edge' && (
                  <div className="space-y-1">
                    <label className="text-slate-400 font-medium">Coach Voice Persona</label>
                    <select
                      value={localSettings.edgeVoice || 'en-US-AndrewNeural'}
                      onChange={(e) => handleChange('edgeVoice', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-hidden focus:border-amber-500"
                    >
                      {EDGE_NEURAL_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
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
                    onClick={handleTestEdgeVoice}
                    disabled={isTestingVoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {isTestingVoice ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Synthesizing...</span>
                      </>
                    ) : isSpeaking ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Test Voice</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestMicrophone}
                    disabled={isTestingMic}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
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

                  <button
                    type="button"
                    onClick={handleTestCoachSampleMove}
                    disabled={isTestingSampleMove}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {isTestingSampleMove ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Testing Coach...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3.5 h-3.5" />
                        <span>Test coach on sample move</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Sample Move Test Readout */}
                {sampleMoveResult && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-xs space-y-1.5">
                    <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Bot className="w-4 h-4" />
                      <span>Live Coach Sample Move Test Result:</span>
                    </div>
                    {sampleMoveResult.error ? (
                      <div className="text-rose-400">Error: {sampleMoveResult.error}</div>
                    ) : (
                      <>
                        <div className="text-slate-300"><span className="text-slate-400 font-medium">Engine facts:</span> {sampleMoveResult.engineFacts}</div>
                        <div className="text-slate-300"><span className="text-slate-400 font-medium">Generated text:</span> "{sampleMoveResult.generatedText}"</div>
                        <div className="text-slate-300"><span className="text-slate-400 font-medium">Time to first audio:</span> {sampleMoveResult.timeToFirstAudioMs} ms</div>
                      </>
                    )}
                  </div>
                )}

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
                <span>Gemini AI Text Coach Key (Optional)</span>
              </div>
            </div>

            <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800 text-xs">
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

              <div className="space-y-1">
                <label className="text-slate-400 font-medium">
                  {localSettings.aiProvider === 'gemini'
                    ? 'Gemini AI Text Coach Key (Optional)'
                    : `${localSettings.aiProvider.toUpperCase()} API Key`}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={localSettings.aiProvider === 'gemini' ? (localSettings.geminiApiKey || localSettings.aiApiKey || '') : (localSettings.aiApiKey || '')}
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
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Local credential: Your key is stored solely on your device in your browser's private localStorage for AI text coaching.
                </p>
              </div>

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

          {/* Timing Diagnostics Section */}
          <section className="space-y-3 border-t border-slate-800/80 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
              <Activity className="w-4 h-4" />
              <span>Coach Timing Diagnostics (Last 5 Moves)</span>
            </div>

            <div className="bg-slate-950/60 rounded-xl border border-slate-800 p-3 text-xs space-y-2">
              {getMoveTimingLogs().length === 0 ? (
                <p className="text-slate-400 text-xs italic">No moves recorded yet in this session. Play a move in a game to see Stockfish, text generation, and Edge Neural TTS latencies.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-1.5 font-medium">Move</th>
                        <th className="pb-1.5 font-medium">Engine</th>
                        <th className="pb-1.5 font-medium">Text Gen</th>
                        <th className="pb-1.5 font-medium">First Audio</th>
                        <th className="pb-1.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {getMoveTimingLogs().map((entry, idx) => (
                        <tr key={idx} className="text-slate-200">
                          <td className="py-1.5 font-semibold text-amber-300">
                            {entry.moveSan} <span className="text-[10px] text-slate-400">({entry.mover})</span>
                          </td>
                          <td className="py-1.5 text-emerald-400">{entry.engineMs} ms</td>
                          <td className="py-1.5 text-sky-400">{entry.textGenMs} ms</td>
                          <td className="py-1.5 text-indigo-400">{entry.timeToFirstAudioMs ? `${entry.timeToFirstAudioMs} ms` : '-'}</td>
                          <td className="py-1.5 font-bold text-amber-400">{entry.totalMs} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
