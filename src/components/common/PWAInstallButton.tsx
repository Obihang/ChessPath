import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide
  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-all shadow-sm"
        title="Install ChessPath App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium hover:border-slate-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-amber-400" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in zoom-in-95 duration-150">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">Install on iPhone / iPad</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                <p>1. Tap the <span className="font-semibold text-amber-400">Share</span> icon in Safari’s bottom toolbar.</p>
                <p>2. Scroll down and tap <span className="font-semibold text-amber-400">Add to Home Screen</span>.</p>
                <p>3. Enjoy offline play, zero ads, and instant full-screen access!</p>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors mt-2"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
