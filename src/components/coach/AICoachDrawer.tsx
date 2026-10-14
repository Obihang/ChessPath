import React, { useState, useRef, useEffect } from 'react';
import { AppSettings } from '../../types/chess';
import { geminiService } from '../../services/geminiService';
import { speechService } from '../../services/speechService';
import { storageService } from '../../services/storageService';
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
  const [isListening, setIsListening] = useState(false);
  const [isSpeakingMessageId, setIsSpeakingMessageId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [conversationMode, setConversationMode] = useState<'learning' | 'criticizing' | 'simple' | 'competitive'>('learning');

  const recognitionRef = useRef<any>(null);
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
    }
  }, [isOpen]);

  const speakText = async (msgId: string, text: string) => {
    speechService.unlock();
    if (isSpeakingMessageId === msgId) {
      speechService.stop('User clicked to stop message audio');
      setIsSpeakingMessageId(null);
      return;
    }

    setIsSpeakingMessageId(msgId);

    await speechService.speakWithCoach(text, settings, {
      onStart: () => setIsSpeakingMessageId(msgId),
      onEnd: () => setIsSpeakingMessageId(null),
      onError: (err) => {
        setIsSpeakingMessageId(null);
      },
    });
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          systemInstruction: `You are a chess coach. Your conversation mode is: ${conversationMode}. Current FEN: ${currentFen}. Move History: ${moveHistory.join(' ')}`,
        }),
      });

      if (!response.ok) throw new Error('Failed to reach coaching service');
      const { text: replyText } = await response.json();

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
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'coach',
        text: "I couldn't reach the coaching service. Please check your network or Gemini API key in Settings.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Speech Recognition (Microphone)
  const toggleSpeechRecognition = () => {
    speechService.unlock();
    if (!speechService.isRecognitionAvailable()) return;

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
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

            {speechService.isRecognitionAvailable() && (
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`p-2 rounded-xl border transition-colors ${
                  isListening
                    ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={isListening ? 'Listening...' : 'Voice Input (Microphone)'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

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
