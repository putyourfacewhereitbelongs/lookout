import React from 'react';
import { Captions, Activity, Sparkles, Users, ScanEye } from 'lucide-react';
import { DetectionObject } from '../types';
import { SceneNarration } from '../services/sceneNarrator';

interface SceneDetailsPanelProps {
  details: string;
  narration?: SceneNarration;
  detections: DetectionObject[];
  overlayEnabled: boolean;
  onOverlayChange: (enabled: boolean) => void;
}

export const SceneDetailsPanel: React.FC<SceneDetailsPanelProps> = ({ details, narration, detections, overlayEnabled, onOverlayChange }) => (
  <section className="scene-details-panel rounded-2xl border border-fuchsia-500/30 bg-slate-950/95 p-4 shadow-xl" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-950/50 p-2 text-fuchsia-300"><Sparkles className="h-4 w-4" /></div>
        <div>
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-fuchsia-200">Live scene details</h2>
          <p className="text-[10px] text-slate-500">What is happening in the live view right now</p>
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

    {narration && (
      <>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/40 px-2 py-1 text-cyan-200">
            <ScanEye className="h-3 w-3" />{narration.census}
          </span>
          {narration.knownPeople.length > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 text-emerald-200">
              <Users className="h-3 w-3" />Identified: {narration.knownPeople.join(', ')}
            </span>
          )}
          {narration.unknownPeopleCount > 0 && (
            <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-amber-200">
              {narration.unknownPeopleCount} unidentified
            </span>
          )}
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-slate-400">{narration.environment}</span>
        </div>

        {narration.subjects.length > 0 && (
          <ul className="mt-3 space-y-2">
            {narration.subjects.map((subject) => (
              <li key={subject.id} className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-xs font-bold ${subject.identified ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {subject.who}
                  </span>
                  {subject.role && (
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400">
                      {subject.role}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{subject.phrase}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {subject.attributes.map((attribute, index) => (
                    <span key={`${subject.id}-${index}`} className="rounded border border-slate-800 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                      {attribute}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    )}

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
