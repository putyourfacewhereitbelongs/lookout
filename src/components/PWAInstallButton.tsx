import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running standalone, hide the button
  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 rounded-md">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        PWA INSTALLED
      </span>
    );
  }

  // Chromium / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 px-3.5 py-1.5 text-xs font-mono font-medium text-white shadow-md shadow-cyan-900/30 transition cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        INSTALL PWA
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-lg border border-cyan-800/60 bg-cyan-950/30 hover:bg-cyan-900/40 px-3 py-1.5 text-xs font-mono text-cyan-300 transition cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          INSTALL ON IOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-semibold">Install Lookout AI</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-4 text-sm text-slate-300 leading-relaxed">
                To install Lookout AI on your iPhone or iPad for low-latency full-screen DVR:
              </p>
              <div className="mt-3 space-y-2.5 text-xs font-mono text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="flex items-start gap-2">
                  <Share className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>1. Tap the <strong>Share</strong> icon in the Safari navigation bar.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Download className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span>2. Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 py-2 text-xs font-mono font-medium text-white transition"
              >
                GOT IT
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback indicator
  return (
    <button
      id="pwa-badge-btn"
      onClick={() => alert('Lookout AI is Progressive Web App ready! You can pin or install this app from your browser menu.')}
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-cyan-300 bg-slate-900/60 border border-slate-800 rounded-md transition"
    >
      <Download className="w-3 h-3 text-cyan-400" />
      PWA READY
    </button>
  );
};
