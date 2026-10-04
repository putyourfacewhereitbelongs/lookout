import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Bell, BellOff, Download, Loader2, UserRound, Volume2, X } from 'lucide-react';
import { alertCenter, LookoutAlert, buildSpeechText } from '../services/alertCenter';
import { audioEngine } from '../services/audioEngine';

/** Subscribe a component to the shared alert store. */
export function useAlerts(): LookoutAlert[] {
  const [alerts, setAlerts] = useState<LookoutAlert[]>(() => alertCenter.getAlerts());
  useEffect(() => alertCenter.subscribe(setAlerts), []);
  return alerts;
}

const severityStyles: Record<LookoutAlert['severity'], { ring: string; chip: string; bar: string; label: string }> = {
  info: {
    ring: 'border-cyan-500/50 shadow-cyan-950/50',
    chip: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60',
    bar: 'bg-cyan-400',
    label: 'Recognition',
  },
  warning: {
    ring: 'border-amber-500/60 shadow-amber-950/50',
    chip: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
    bar: 'bg-amber-400',
    label: 'Alert',
  },
  critical: {
    ring: 'border-red-500/70 shadow-red-950/60',
    chip: 'bg-red-950/80 text-red-300 border-red-700/70',
    bar: 'bg-red-400',
    label: 'Critical',
  },
};

const timeLabel = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const AlertToast: React.FC<{ alert: LookoutAlert; onDismiss: () => void }> = ({ alert, onDismiss }) => {
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(alert.durationMs);
  const lastTickRef = useRef(Date.now());

  // Auto-dismiss with a visible countdown that pauses while the operator is
  // hovering, focusing, or still waiting for the GIF preview to finish.
  useEffect(() => {
    if (alert.durationMs <= 0) return;
    const hold = paused || alert.gifPending;
    lastTickRef.current = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      if (hold) return;
      setRemaining((value) => {
        const next = value - elapsed;
        if (next <= 0) {
          window.clearInterval(interval);
          onDismiss();
          return 0;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [alert.durationMs, alert.gifPending, paused, onDismiss]);

  const styles = severityStyles[alert.severity];
  const progress = alert.durationMs > 0 ? Math.max(0, Math.min(1, remaining / alert.durationMs)) : 1;
  const preview = alert.gifUrl || alert.faceImage;

  const downloadGif = () => {
    if (!alert.gifUrl) return;
    const link = document.createElement('a');
    link.href = alert.gifUrl;
    link.download = `LOOKOUT_ALERT_${alert.subjectName ? `${alert.subjectName.replace(/\s+/g, '_')}_` : ''}${alert.timestamp}.gif`;
    link.click();
  };

  const replaySpeech = () => {
    audioEngine.speak(
      buildSpeechText({
        title: alert.title,
        message: alert.message,
        subjectName: alert.subjectName,
        cameraName: alert.cameraName,
        confidence: alert.confidence,
        severity: alert.severity,
      }),
      alertCenter.getSettings().ttsVoiceRate,
      alertCenter.getSettings().ttsVoicePitch
    );
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: 48, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 48, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto w-full overflow-hidden rounded-xl border bg-slate-950/95 shadow-xl backdrop-blur-md sm:w-[22rem] ${styles.ring}`}
    >
      <div className="flex gap-3 p-3">
        {/* Face / animated feed preview */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          {preview ? (
            <img
              src={preview}
              alt={alert.subjectName ? `${alert.subjectName} detected by ${alert.cameraName || 'camera'}` : 'Detected face preview'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-600">
              {alert.severity === 'info' ? <UserRound className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
            </div>
          )}
          {alert.gifPending && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 font-mono text-[9px] text-slate-200">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> GIF
            </div>
          )}
          {alert.gifUrl && !alert.gifPending && (
            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[8px] font-bold tracking-wider text-emerald-300">
              GIF
            </span>
          )}
        </div>

        {/* Alert copy */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${styles.chip}`}>
              <Bell className="h-2.5 w-2.5" /> {styles.label}
            </span>
            <button
              onClick={onDismiss}
              className="-mr-1 -mt-1 rounded p-1 text-slate-500 transition hover:bg-slate-900 hover:text-white"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <h3 className="mt-1 truncate text-sm font-bold text-white">{alert.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-300">{alert.message}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase text-slate-500">
            {alert.cameraName && <span className="truncate max-w-[9rem]">{alert.cameraName}</span>}
            <span>{timeLabel(alert.timestamp)}</span>
            {typeof alert.confidence === 'number' && <span>{Math.round(alert.confidence * 100)}% match</span>}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              onClick={replaySpeech}
              className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[9px] uppercase text-slate-300 transition hover:text-white"
              title="Say this alert again"
            >
              <Volume2 className="h-3 w-3" /> Say
            </button>
            <button
              onClick={downloadGif}
              disabled={!alert.gifUrl}
              className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[9px] uppercase text-slate-300 transition hover:text-white disabled:opacity-40"
              title={alert.gifUrl ? 'Save the animated alert clip' : 'Animated clip is still encoding'}
            >
              <Download className="h-3 w-3" /> GIF
            </button>
          </div>
        </div>
      </div>
      {alert.durationMs > 0 && (
        <div className="h-0.5 w-full bg-slate-900">
          <div className={`h-full transition-[width] duration-100 ease-linear ${styles.bar}`} style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </motion.article>
  );
};

/**
 * Corner notification stack. Replaces the old full-screen alert takeover so the
 * live feed stays visible while alerts arrive.
 */
export const AlertToastStack: React.FC = () => {
  const alerts = useAlerts();
  const [muted, setMuted] = useState(() => alertCenter.isMuted());

  // Escape clears the stack, matching the dialogs elsewhere in the app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && alertCenter.getAlerts().length > 0) alertCenter.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end">
      <AnimatePresence initial={false}>
        {alerts.map((alert) => (
          <AlertToast key={alert.id} alert={alert} onDismiss={() => alertCenter.dismiss(alert.id)} />
        ))}
      </AnimatePresence>
      {alerts.length > 1 && (
        <div className="pointer-events-auto flex items-center justify-end gap-2">
          <button
            onClick={() => { const next = !muted; setMuted(next); alertCenter.setMuted(next); }}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[10px] uppercase text-slate-300 shadow-lg transition hover:text-white"
            title={muted ? 'Unmute alert sound and voice' : 'Mute alert sound and voice'}
          >
            {muted ? <BellOff className="h-3 w-3 text-red-400" /> : <Bell className="h-3 w-3 text-emerald-400" />}
            {muted ? 'Muted' : 'Sound on'}
          </button>
          <button
            onClick={() => alertCenter.clear()}
            className="rounded-lg border border-slate-700 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[10px] uppercase text-slate-300 shadow-lg transition hover:text-white"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
