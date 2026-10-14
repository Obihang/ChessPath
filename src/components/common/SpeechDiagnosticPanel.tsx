import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../types/chess';
import { speechService, SpeechDiagnosticEntry, SpeechEngineStatus } from '../../services/speechService';
import { soundService } from '../../services/audioService';
import {
  Activity,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Sparkles,
  Radio,
} from 'lucide-react';

interface SpeechDiagnosticPanelProps {
  settings: AppSettings;
  onUpdateSettings?: (newSettings: AppSettings) => void;
  compact?: boolean;
}

export const SpeechDiagnosticPanel: React.FC<SpeechDiagnosticPanelProps> = ({
  settings,
  onUpdateSettings,
  compact = false,
}) => {
  const [logs, setLogs] = useState<SpeechDiagnosticEntry[]>(speechService.getDiagnosticLogs());
  const [status, setStatus] = useState<SpeechEngineStatus>(speechService.getEngineStatus());
  const [filter, setFilter] = useState<'all' | 'errors' | 'triggers'>('all');
  const [copied, setCopied] = useState(false);
  const [isTestingSpeech, setIsTestingSpeech] = useState(false);
  const [isTestingBeep, setIsTestingBeep] = useState(false);

  // Subscribe to live diagnostic updates
  useEffect(() => {
    const update = () => {
      setLogs([...speechService.getDiagnosticLogs()]);
      setStatus(speechService.getEngineStatus());
    };

    update();
    const unsubscribe = speechService.subscribeDiagnostics(update);
    const interval = setInterval(update, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleTestSpeech = () => {
    speechService.unlock();
    setIsTestingSpeech(true);

    speechService.logDiagnostic('info', 'Manual diagnostic test initiated by user click.');

    speechService.speak(
      'Diagnostic test. The ChessPath voice coach is active and speaking on your device.',
      {
        rate: settings.voiceRate,
        volume: settings.voiceVolume,
        voiceURI: settings.selectedVoiceURI,
        onStart: () => setIsTestingSpeech(true),
        onEnd: () => setIsTestingSpeech(false),
        onError: () => setIsTestingSpeech(false),
      }
    );
  };

  const handleTestBeep = async () => {
    setIsTestingBeep(true);
    speechService.logDiagnostic('info', 'Hardware speaker beep test triggered via Web Audio API.');
    const played = await soundService.playDiagnosticBeep();
    setIsTestingBeep(false);
    if (played) {
      speechService.logDiagnostic('info', 'Web Audio hardware chime played successfully.');
    } else {
      speechService.logDiagnostic('error', 'Web Audio hardware chime failed to play.');
    }
  };

  const handleToggleVoice = () => {
    if (!onUpdateSettings) return;
    const updated = { ...settings, voiceEnabled: !settings.voiceEnabled };
    onUpdateSettings(updated);
    speechService.logDiagnostic(
      'info',
      `Voice Coach toggle changed by user to: ${updated.voiceEnabled ? 'ENABLED' : 'MUTED'}`
    );
  };

  const handleClear = () => {
    speechService.clearDiagnosticLogs();
    setLogs([]);
  };

  const handleCopy = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.time}] [${l.type.toUpperCase()}] ${l.message}${
            l.details ? ' ' + JSON.stringify(l.details) : ''
          }`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((l) => {
    if (filter === 'errors') return l.type === 'error' || l.type === 'blocked' || l.type === 'warn';
    if (filter === 'triggers') return l.type === 'trigger' || l.type === 'start' || l.type === 'end';
    return true;
  });

  const hasNotAllowedError = logs.some((l) => l.message.includes('not-allowed'));
  const isMuted = !settings.voiceEnabled;
  const isVolumeZero = settings.voiceVolume <= 0;

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden text-xs">
      {/* Header & Status Summary */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-slate-200">Speech & Audio Diagnostics</span>
          </div>
          <div className="flex items-center gap-1.5">
            {onUpdateSettings && (
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[11px] transition-colors border ${
                  settings.voiceEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                }`}
                title={settings.voiceEnabled ? 'Click to Mute' : 'Click to Unmute'}
              >
                {settings.voiceEnabled ? (
                  <>
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                    <span>Voice ON</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3 h-3 text-rose-400" />
                    <span>MUTED</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Status Indicators Pill Bar */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span
            className={`px-2 py-0.5 rounded-full border font-medium ${
              status.isSupported
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            Web Speech: {status.isSupported ? 'Supported' : 'Not Supported'}
          </span>

          <span
            className={`px-2 py-0.5 rounded-full border font-medium ${
              status.isSpeaking
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                : status.isPaused
                ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            Synthesizer: {status.isSpeaking ? 'Speaking' : status.isPaused ? 'Paused' : 'Idle'}
          </span>

          <span className="px-2 py-0.5 rounded-full border bg-slate-800 border-slate-700 text-slate-300 font-medium">
            Voices: {status.voicesCount} loaded
          </span>

          <span
            className={`px-2 py-0.5 rounded-full border font-medium ${
              isVolumeZero
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            Volume: {Math.round(settings.voiceVolume * 100)}%
          </span>

          <span className="px-2 py-0.5 rounded-full border bg-slate-800 border-slate-700 text-slate-300 font-medium">
            AudioContext: {status.audioContextState}
          </span>
        </div>
      </div>

      {/* Troubleshooting Alert if Muted or Blocked */}
      {(isMuted || hasNotAllowedError || isVolumeZero) && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-[11px] space-y-1">
          {isMuted && (
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>Voice Coach is currently MUTED in settings. Speech synthesis calls will be skipped until enabled.</span>
            </div>
          )}
          {isVolumeZero && (
            <div className="flex items-center gap-1.5">
              <VolumeX className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span>Voice Volume is set to 0%. Increase the volume slider to hear sound.</span>
            </div>
          )}
          {hasNotAllowedError && (
            <div className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />
              <span>
                Browser autoplay policy blocked speech without user gesture. Tap <strong>Test Web Speech API</strong> below to grant permission.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-900/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleTestSpeech}
            disabled={isTestingSpeech}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isTestingSpeech ? (
              <>
                <Radio className="w-3 h-3 animate-spin text-amber-400" />
                <span>Speaking...</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>Test Web Speech API</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleTestBeep}
            disabled={isTestingBeep}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
            title="Plays a raw 3-tone chime through Web Audio API to verify physical speakers"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Test Hardware Beep</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filter === 'all' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('errors')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filter === 'errors' ? 'bg-slate-800 text-rose-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Errors
            </button>
            <button
              type="button"
              onClick={() => setFilter('triggers')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                filter === 'triggers' ? 'bg-slate-800 text-blue-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Triggers
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Clear logs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Entries View */}
      <div className={`overflow-y-auto p-2 space-y-1 font-mono text-[11px] ${compact ? 'max-h-48' : 'max-h-64'}`}>
        {filteredLogs.length === 0 ? (
          <div className="py-6 text-center text-slate-500 font-sans text-xs">
            No diagnostic events recorded yet. Click <strong>Test Web Speech API</strong> above to simulate speech output.
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const badgeColors: Record<SpeechDiagnosticEntry['type'], string> = {
              trigger: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
              start: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
              end: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
              error: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
              blocked: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
              warn: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
              info: 'bg-slate-800/80 border-slate-700/60 text-slate-300',
            };

            return (
              <div
                key={entry.id}
                className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/70 flex items-start gap-2 leading-snug"
              >
                <span className="text-[10px] text-slate-500 shrink-0 select-none pt-0.5">
                  {entry.time}
                </span>

                <span
                  className={`px-1.5 py-0.2 rounded border text-[9px] font-bold uppercase shrink-0 ${
                    badgeColors[entry.type]
                  }`}
                >
                  {entry.type}
                </span>

                <div className="flex-1 break-words">
                  <span className="text-slate-200">{entry.message}</span>
                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <div className="text-[10px] text-slate-400 mt-0.5 bg-black/40 p-1 rounded border border-slate-800/60">
                      {JSON.stringify(entry.details, null, 1)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
