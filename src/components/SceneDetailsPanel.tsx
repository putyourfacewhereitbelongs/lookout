import React from 'react';
import { Captions, Eye, EyeOff, Activity, Sparkles } from 'lucide-react';
import { DetectionObject } from '../types';

interface SceneDetailsPanelProps {
  details: string;
  detections: DetectionObject[];
  overlayEnabled: boolean;
  onOverlayChange: (enabled: boolean) => void;
}

export const SceneDetailsPanel: React.FC<SceneDetailsPanelProps> = ({ details, detections, overlayEnabled, onOverlayChange }) => (
  <section className="scene-details-panel rounded-2xl border border-fuchsia-500/30 bg-slate-950/95 p-4 shadow-xl" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/50 p-2 text-fuchsia-300"><Sparkles className="h-4 w-4" /></div>
        <div>
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-fuchsia-200">Live scene details</h2>
          <p className="text-[10px] text-slate-500">Updates from the active camera and recognition pipeline</p>
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-200">
        <input type="checkbox" checked={overlayEnabled} onChange={(event) => onOverlayChange(event.target.checked)} className="accent-fuchsia-500" />
        <Captions className="h-3.5 w-3.5 text-fuchsia-300" />
        Caption overlay
      </label>
    </div>
    <div className="mt-3 rounded-xl border border-slate-800 bg-black/50 px-3 py-3 text-sm leading-relaxed text-slate-100 transition-all duration-300">
      <div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-lime-300" /><span>{details}</span></div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {detections.length === 0 ? <span className="text-[10px] font-mono text-slate-500">No active subjects</span> : detections.map((detection) => (
        <span key={detection.id} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-300">
          {detection.label}{detection.posture ? ` • ${detection.posture}` : ''}
        </span>
      ))}
    </div>
  </section>
);

export const SceneCaptionOverlay: React.FC<{ details: string; enabled: boolean }> = ({ details, enabled }) => enabled ? (
  <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 w-[min(92%,720px)] -translate-x-1/2 rounded-lg border border-white/20 bg-black/75 px-4 py-2 text-center text-sm font-semibold text-white shadow-xl backdrop-blur-sm">
    <Captions className="mr-2 inline-block h-4 w-4 text-fuchsia-300" />{details}
  </div>
) : null;
