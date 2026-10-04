import React, { useEffect, useState } from 'react';
import { Ear, Eye, Vibrate, Volume2, Footprints, AlertTriangle, Activity } from 'lucide-react';
import { AccessibilitySettings, AudioVisualCue } from '../../types';
import { audioCueService } from '../../services/audioCueService';

interface AccessibilitySectionProps {
  settings: AccessibilitySettings;
  onChange: (settings: AccessibilitySettings) => void;
  recentCues: AudioVisualCue[];
}

const TOGGLES: Array<{
  key: keyof AccessibilitySettings;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'audioVisualCues',
    label: 'Audio-visual sound cues',
    description:
      'Listens to the microphone and shows on-screen cues for glass breaking, alarms, impacts, barking, footsteps, and speech. Audio is analysed locally and never recorded or uploaded.',
    icon: <Ear className="h-4 w-4 text-cyan-400" />,
  },
  {
    key: 'visuallyImpairedObstacleOverlay',
    label: 'High-contrast obstacle overlay',
    description: 'Outlines every detected subject in high-visibility magenta with a large obstacle label.',
    icon: <Eye className="h-4 w-4 text-rose-400" />,
  },
  {
    key: 'floorElevationSensor',
    label: 'Floor elevation indicator',
    description: 'Marks the ground plane and flags curbs, steps, and drop-offs near the bottom of frame.',
    icon: <Footprints className="h-4 w-4 text-amber-400" />,
  },
  {
    key: 'hapticFeedback',
    label: 'Haptic alert feedback',
    description: 'Vibrates this device when an alert is raised, with a stronger pattern for critical events.',
    icon: <Vibrate className="h-4 w-4 text-purple-400" />,
  },
  {
    key: 'voiceCommandsAndNarration',
    label: 'Spoken alert narration',
    description: 'Reads each alert aloud as it is raised.',
    icon: <Volume2 className="h-4 w-4 text-emerald-400" />,
  },
];

const CUE_STYLES: Record<AudioVisualCue['type'], string> = {
  glass: 'border-rose-500/50 bg-rose-950/40 text-rose-200',
  alarm: 'border-rose-500/50 bg-rose-950/40 text-rose-200',
  impact: 'border-amber-500/50 bg-amber-950/40 text-amber-200',
  bark: 'border-amber-500/50 bg-amber-950/40 text-amber-200',
  footsteps: 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200',
  speech: 'border-slate-600 bg-slate-900 text-slate-200',
  status: 'border-slate-700 bg-slate-900 text-slate-400',
};

export const AccessibilitySection: React.FC<AccessibilitySectionProps> = ({ settings, onChange, recentCues }) => {
  const [meter, setMeter] = useState<{ dbfs: number; label: string } | null>(null);

  // Live input meter so the user can confirm the microphone is actually being
  // heard, rather than having to trust a silent toggle.
  useEffect(() => {
    if (!settings.audioVisualCues) {
      setMeter(null);
      return;
    }
    return audioCueService.onLevel(({ dbfs, result }) => {
      setMeter({ dbfs, label: result.type === 'status' ? 'ambient' : result.type });
    });
  }, [settings.audioVisualCues]);

  const meterPercent = meter ? Math.max(0, Math.min(100, ((meter.dbfs + 70) / 70) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-cyan-300">Accessibility & Sound Awareness</h3>
        <p className="mt-1 text-xs text-slate-400">
          Assistive overlays and acoustic event detection for users who are blind, low-vision, Deaf, or hard of hearing.
        </p>
      </div>

      <div className="space-y-2">
        {TOGGLES.map((toggle) => (
          <label
            key={toggle.key}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 transition hover:border-slate-700"
          >
            <input
              type="checkbox"
              checked={Boolean(settings[toggle.key])}
              onChange={(event) => onChange({ ...settings, [toggle.key]: event.target.checked })}
              className="mt-1 h-4 w-4 accent-cyan-500"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {toggle.icon}
                <span className="font-mono text-xs font-bold uppercase tracking-wide text-slate-100">{toggle.label}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{toggle.description}</p>
            </div>
          </label>
        ))}
      </div>

      {settings.audioVisualCues && (
        <div className="rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-300">
              <Activity className="h-3.5 w-3.5" />Live acoustic analysis
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {audioCueService.isRunning ? `${meter ? meter.dbfs.toFixed(0) : '—'} dBFS • ${meter?.label ?? 'listening'}` : 'starting…'}
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 transition-all duration-100"
              style={{ width: `${meterPercent}%` }}
            />
          </div>

          {audioCueService.error && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{audioCueService.error}
            </p>
          )}

          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Recent sound events</p>
            {recentCues.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">No sound events detected yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {recentCues.slice(0, 6).map((cue) => (
                  <li
                    key={cue.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${CUE_STYLES[cue.type]}`}
                  >
                    <span className="font-semibold">{cue.label}</span>
                    <span className="font-mono text-[10px] opacity-80">
                      {new Date(cue.timestamp).toLocaleTimeString()} • {Math.round(cue.confidence * 100)}% • {cue.dbLevel.toFixed(0)} dBFS
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
