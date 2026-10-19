import React, { useState, useRef, useEffect } from 'react';
import { AppSettings, CoachMode } from '../../types/chess';
import { geminiService } from '../../services/geminiService';
import { speechService } from '../../services/speechService';
import { storageService } from '../../services/storageService';
import { engineService } from '../../services/engineService';
import { coachCommentaryService } from '../../services/coachCommentaryService';
import { SpeechDiagnosticPanel } from '../common/SpeechDiagnosticPanel';
import {
  Sparkles,
  X,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RotateCcw,
  Key,
  Bot,
  User,
  Activity,
  Radio,
  Loader2,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'coach';
  text: string;
  timestamp: Date;
}

interface AICoachDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentFen: string;
  moveHistory: string[];
  settings: AppSettings;
  onOpenSettings: () => void;
  onUpdateSettings?: (settings: AppSettings) => void;
}

export const AICoachDrawer: React.FC<AICoachDrawerProps> = ({
  isOpen,
  onClose,
  currentFen,
  moveHistory,
  settings,
  onOpenSettings,
  onUpdateSettings,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'coach',
      text: "Hello! I am your ChessPath AI Coach. Ask me anything about the current board position, strategic ideas, or tactical threats!",
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeakingMessageId, setIsSpeakingMessageId] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [conversationMode, setConversationMode] = useState<CoachMode>(settings.coachMode || 'learning');

  useEffect(() => {
    if (settings.coachMode && settings.coachMode !== conversationMode) {
      setConversationMode(settings.coachMode);
    }
  }, [settings.coachMode]);

  const handleModeChange = (newMode: CoachMode) => {
    setConversationMode(newMode);
    const updated = { ...settings, coachMode: newMode };
    onUpdateSettings?.(updated);
    storageService.saveSettings(updated);
  };

  // Keep full history of live coach comments in the Coach Drawer
  useEffect(() => {
    const unsubscribe = coachCommentaryService.subscribeToCommentary((res) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: 'coach',
          text: `[Live Move Commentary - ${res.facts.moveSan}]: ${res.comment}`,
          timestamp: res.timestamp || new Date(),
        },
      ]);
    });
    return unsubscribe;
  }, []);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Stop active speech when drawer closes
  useEffect(() => {
    if (!isOpen) {
      speechService.stop();
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      setIsSpeakingMessageId(null);
      setSpeechError(null);
    }
  }, [isOpen]);

  const speakText = async (msgId: string, text: string) => {
    speechService.unlock();
    setSpeechError(null);
    if (isSpeakingMessageId === msgId) {
      speechService.stop('User clicked to stop message audio');
      setIsSpeakingMessageId(null);
      return;
    }

    setIsSpeakingMessageId(msgId);

    const res = await speechService.speakWithCoach(text, settings, {
      onStart: () => setIsSpeakingMessageId(msgId),
      onEnd: () => setIsSpeakingMessageId(null),
      onError: (err: any) => {
        setIsSpeakingMessageId(null);
        setSpeechError(err?.message || 'Speech playback failed');
      },
    });

    if (!res.success && res.error) {
      setIsSpeakingMessageId(null);
      setSpeechError(res.error);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    speechService.unlock();
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      // Fetch engine analysis for current position to ground advice in truth
      let evalContext = '';
      try {
        const evalInfo = await engineService.evaluate(currentFen, 300);
        if (evalInfo && evalInfo.bestMove) {
          const evalStr = evalInfo.mate !== null
            ? `mate in ${Math.abs(evalInfo.mate)}`
            : evalInfo.score !== null
            ? `${evalInfo.score >= 0 ? '+' : ''}${evalInfo.score} cp`
            : 'unrated';
          evalContext = ` Engine analysis: evaluation is ${evalStr}, best move is ${evalInfo.bestMoveSan || evalInfo.bestMove}.`;
        }
      } catch {
        // Continue if evaluation times out
      }

      // Build conversation history (last 12 messages)
      const history = messages
        .slice(-12)
        .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));

      // Append current user message
      history.push({ role: 'user', parts: [{ text: textToSend.trim() }] });

      const systemInstruction = `You are an expert chess coach.
Coach Mode: ${conversationMode}.
Current FEN: "${currentFen}".
Last 10 moves: ${moveHistory.slice(-10).join(' ') || 'Starting position'}.${evalContext}

Strict instructions:
- Only suggest or analyze moves that are strictly legal in the given FEN or provided by the engine. Never hallucinate illegal moves.
- If you are unsure about an evaluation or tactical line, state so honestly.
- Do not write verbose essays or lists. Keep your reply concise, constructive, and helpful for the player.`;

      const replyText = await geminiService.chat(history as any, systemInstruction);

      const coachMsg: ChatMessage = {
        id: `coach-${Date.now()}`,
        sender: 'coach',
        text: replyText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, coachMsg]);

      if (settings.voiceEnabled) {
        speakText(coachMsg.id, replyText);
      }
    } catch (e: any) {
      let errorMessage = 'An unexpected error occurred.';
      const msg = e?.message || '';

      if (msg === 'NO_KEY') {
        let engineSuggestion = '';
        try {
          const evalInfo = await engineService.evaluate(currentFen, 400);
          if (evalInfo && evalInfo.bestMove) {
            const engineName = evalInfo.source === 'stockfish' && evalInfo.isAvailable ? 'Stockfish 19' : 'Engine';
            const evalStr = evalInfo.mate !== null
              ? `mate in ${Math.abs(evalInfo.mate)}`
              : evalInfo.score !== null
              ? `eval: ${evalInfo.score >= 0 ? '+' : ''}${evalInfo.score} cp`
              : 'tactical assessment';
            engineSuggestion = `${engineName} Analysis: Recommended move is ${evalInfo.bestMoveSan || evalInfo.bestMove} (${evalStr}).\n\n💡 Tip: Paste your API key (Groq, OpenRouter, Bytez, or Gemini) in Settings for conversational AI chat!`;
          } else {
            engineSuggestion = 'No API key set. Paste your Groq, OpenRouter, Bytez, or Gemini API key in Settings to unlock conversational AI chat!';
          }
        } catch {
          engineSuggestion = 'No API key set. Paste your Groq, OpenRouter, Bytez, or Gemini API key in Settings for conversational AI chat!';
        }
        errorMessage = engineSuggestion;
      } else if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
        errorMessage = `Invalid API key for ${settings.aiProvider || 'AI Provider'} (401/403). Please verify your key in Settings.`;
      } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = `Quota or rate limit reached on ${settings.aiProvider || 'AI Provider'} (429). Please wait about a minute and try again.`;
      } else if (msg.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        errorMessage = 'You appear to be offline or network connection was lost.';
      } else if (msg.includes('404') || msg.includes('not found') || msg.includes('NotFound')) {
        errorMessage = `Model or endpoint not found on ${settings.aiProvider || 'AI Provider'}. Check Base URL and Model Name in Settings.`;
      } else {
        errorMessage = `Coach service error: ${msg}`;
      }

      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'coach',
        text: errorMessage,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      speechService.logDiagnostic('error', `Chat error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // MediaRecorder Gemini STT (Microphone)
  const toggleRecording = async () => {
    speechService.unlock();

    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      try {
        const audioBlob = await speechService.stopRecording();
        if (audioBlob && audioBlob.size > 0) {
          const res = await geminiService.transcribeAudio(
            audioBlob,
            audioBlob.type,
            settings.geminiApiKey || settings.aiApiKey
          );
          if (res.success && res.transcript) {
            setInputText(res.transcript);
            if (settings.autoSendTranscribed) {
              handleSendMessage(res.transcript);
            }
          } else if (res.error) {
            const errMsg: ChatMessage = {
              id: `err-${Date.now()}`,
              sender: 'coach',
              text: `STT error: ${res.error}`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errMsg]);
          }
        }
      } catch (err: any) {
        console.warn('STT transcription error:', err);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    try {
      await speechService.startRecording(30000);
      setIsRecording(true);
    } catch (err: any) {
      setIsRecording(false);
      let errMsg = 'Failed to start recording.';
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission denied')) {
        errMsg = 'Microphone permission denied. Please allow microphone access in your browser/app settings.';
      } else if (err?.name === 'NotFoundError') {
        errMsg = 'No microphone device found on this system.';
      }
      const chatErr: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'coach',
        text: errMsg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, chatErr]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">Gemini AI Coach</h3>
                {isSpeakingMessageId && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold px-1.5 py-0.2 rounded-full bg-amber-500/15 border border-amber-500/30 animate-pulse">
                    <Radio className="w-2.5 h-2.5" />
                    <span>Speaking</span>
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">Position & Strategy Mentor</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <select
              value={conversationMode}
              onChange={(e) => setConversationMode(e.target.value as any)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px] rounded-lg px-2 py-1.5 focus:outline-hidden focus:border-amber-500"
            >
              <option value="learning">Full Learning</option>
              <option value="criticizing">Full Criticizing</option>
              <option value="simple">Simple Conversation</option>
              <option value="competitive">Competitive</option>
            </select>

            {/* Always-visible Voice Coach Mute button */}
            <button
              type="button"
              onClick={() => {
                speechService.unlock();
                const nextVal = !settings.voiceEnabled;
                const updated = { ...settings, voiceEnabled: nextVal };
                if (onUpdateSettings) {
                  onUpdateSettings(updated);
                }
                storageService.saveSettings(updated);
                if (!nextVal) {
                  speechService.stop('Muted by user in Coach header');
                  setIsSpeakingMessageId(null);
                } else {
                  speechService.logDiagnostic('info', 'Voice Coach unmuted in Coach header.');
                }
              }}
              className={`p-1.5 rounded-lg border transition-colors ${
                settings.voiceEnabled
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
              }`}
              title={
                settings.voiceEnabled
                  ? 'Voice Coach is Enabled (Click to Mute)'
                  : 'Voice Coach is Muted (Click to Unmute)'
              }
            >
              {settings.voiceEnabled ? (
                <Volume2 className="w-4 h-4 text-amber-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-rose-400" />
              )}
            </button>

            {/* Diagnostics Panel Toggle button */}
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className={`p-1.5 rounded-lg border transition-colors ${
                showDiagnostics
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Toggle Audio & Speech Diagnostics"
            >
              <Activity className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Diagnostics Drawer Panel */}
        {showDiagnostics && (
          <div className="p-3 border-b border-slate-800 bg-slate-950/90 animate-in fade-in duration-150">
            <SpeechDiagnosticPanel
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              compact
            />
          </div>
        )}

        {/* API Key Reminder if missing */}
        {!geminiService.hasKey() && (
          <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span>Add your Gemini key for live coaching</span>
            </div>
            <button
              onClick={onOpenSettings}
              className="text-[11px] font-bold underline hover:text-amber-200"
            >
              Settings
            </button>
          </div>
        )}

        {/* Speech Error Banner */}
        {speechError && (
          <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between text-xs text-rose-300 animate-in fade-in duration-150">
            <span className="truncate">⚠️ Voice failed: {speechError}</span>
            <button
              onClick={() => setSpeechError(null)}
              className="p-1 hover:text-rose-100 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick Action Chips */}
        <div className="px-3 py-2 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px]">
          <button
            onClick={() => handleSendMessage('Explain the current position and who has the advantage.')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0 transition-colors"
          >
            Explain position
          </button>
          <button
            onClick={() => handleSendMessage('What is the best plan for White here?')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0 transition-colors"
          >
            White's plan
          </button>
          <button
            onClick={() => handleSendMessage('What is the best plan for Black here?')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0 transition-colors"
          >
            Black's plan
          </button>
          <button
            onClick={() => handleSendMessage('Give me a subtle tactical hint without spoiling the exact move.')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 whitespace-nowrap shrink-0 transition-colors"
          >
            Tactical hint
          </button>
        </div>

        {/* Messages Container */}
        <div ref={messagesEndRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => {
            const isCoach = m.sender === 'coach';
            const isSpeakingThis = isSpeakingMessageId === m.id;

            return (
              <div
                key={m.id}
                className={`flex gap-2.5 text-xs ${isCoach ? 'justify-start' : 'justify-end'}`}
              >
                {isCoach && (
                  <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3 space-y-1.5 ${
                    isCoach
                      ? 'bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-tl-sm'
                      : 'bg-amber-500 text-slate-950 font-medium rounded-tr-sm'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>

                  {isCoach && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => speakText(m.id, m.text)}
                        className={`p-1 rounded text-slate-400 hover:text-slate-200 ${
                          isSpeakingThis ? 'text-amber-400 animate-pulse' : ''
                        }`}
                        title={isSpeakingThis ? 'Stop speaking' : 'Read message aloud'}
                      >
                        {isSpeakingThis ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>

                {!isCoach && (
                  <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-2.5 items-center text-xs text-slate-400 animate-pulse">
              <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700/60 text-slate-300">
                <span>Analyzing current board position...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              placeholder="Ask anything about this position..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-500"
            />

            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              className={`p-2 rounded-xl border transition-colors ${
                isRecording
                  ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                  : isTranscribing
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title={isRecording ? 'Tap to stop recording' : isTranscribing ? 'Transcribing...' : 'Voice Input (Microphone)'}
            >
              {isTranscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className="p-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
