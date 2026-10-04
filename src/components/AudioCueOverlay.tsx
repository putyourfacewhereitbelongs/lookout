import React, { useEffect, useState } from 'react';
import { Ear, AlertOctagon, Volume2, Footprints, Dog, Hammer, MessageSquare } from 'lucide-react';
import { AudioVisualCue } from '../types';

const ICONS: Record<AudioVisualCue['type'], React.ReactNode> = {
  glass: <AlertOctagon className="h-4 w-4" />,
  alarm: <Volume2 className="h-4 w-4" />,
  impact: <Hammer className="h-4 w-4" />,
  bark: <Dog className="h-4 w-4" />,
  footsteps: <Footprints className="h-4 w-4" />,
  speech: <MessageSquare className="h-4 w-4" />,
  status: <Ear className="h-4 w-4" />,
};

const STYLES: Record<AudioVisualCue['type'], string> = {
  glass: 'border-rose-400 bg-rose-950/90 text-rose-100',
  alarm: 'border-rose-400 bg-rose-950/90 text-rose-100',
  impact: 'border-amber-400 bg-amber-950/90 text-amber-100',
  bark: 'border-amber-400 bg-amber-950/90 text-amber-100',
  footsteps: 'border-cyan-400 bg-cyan-950/90 text-cyan-100',
  speech: 'border-slate-400 bg-slate-900/90 text-slate-100',
  status: 'border-slate-600 bg-slate-900/90 text-slate-300',
};

/**
 * On-screen captions for sound events, so a user who cannot hear the camera
 * audio still sees that glass broke or an alarm is sounding. Cues fade out a
 * few seconds after they arrive.
 */
export const AudioCueOverlay: React.FC<{ cues: AudioVisualCue[]; enabled: boolean }> = ({ cues, enabled }) => {
  const [visible, setVisible] = useState<AudioVisualCue[]>([]);

  useEffect(() => {
    if (!enabled) {
      setVisible([]);
      return;
    }
    const fresh = cues.filter((cue) => Date.now() - cue.timestamp < 6000).slice(0, 3);
    setVisible(fresh);
    if (fresh.length === 0) return;
    const timer = window.setInterval(() => {
      setVisible((prev) => prev.filter((cue) => Date.now() - cue.timestamp < 6000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [cues, enabled]);

  if (!enabled || visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[70%] flex-col items-end gap-1.5" aria-live="assertive">
      {visible.map((cue) => (
        <div
          key={cue.id}
          className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-bold shadow-xl backdrop-blur-sm ${STYLES[cue.type]}`}
        >
          {ICONS[cue.type]}
          <span>{cue.label}</span>
          <span className="font-mono text-[10px] opacity-75">{cue.dbLevel.toFixed(0)} dB</span>
        </div>
      ))}
    </div>
  );
};
