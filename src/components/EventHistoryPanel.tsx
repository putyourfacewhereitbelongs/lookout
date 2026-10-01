import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Trash2, UserRound, PawPrint, Bike, Bell } from 'lucide-react';
import { HistoryEvent } from '../types';
import { StorageService } from '../services/db';

interface EventHistoryPanelProps {
  events: HistoryEvent[];
  onChange: (events: HistoryEvent[]) => void;
}

const iconFor = (type: HistoryEvent['type']) => {
  if (type === 'bike_fell') return <Bike className="w-4 h-4" />;
  if (type === 'animal_detected') return <PawPrint className="w-4 h-4" />;
  if (type === 'person_recognized' || type === 'person_approached') return <UserRound className="w-4 h-4" />;
  if (type === 'scene_alert') return <AlertTriangle className="w-4 h-4" />;
  return <Activity className="w-4 h-4" />;
};

export const EventHistoryPanel: React.FC<EventHistoryPanelProps> = ({ events, onChange }) => {
  const [filter, setFilter] = useState<'all' | 'alerts' | 'people' | 'animals'>('all');
  const visibleEvents = useMemo(() => events.filter((event) => {
    if (filter === 'alerts') return event.severity !== 'info';
    if (filter === 'people') return event.type === 'person_recognized' || event.type === 'person_approached';
    if (filter === 'animals') return event.type === 'animal_detected';
    return true;
  }), [events, filter]);

  const clear = () => {
    if (events.length && window.confirm('Clear all saved event history?')) {
      StorageService.clearHistoryEvents();
      onChange([]);
    }
  };

  return <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-cyan-800/60 bg-cyan-950/80 p-2.5 text-cyan-400"><Clock className="h-5 w-5" /></div>
        <div><h2 className="font-mono text-sm font-bold uppercase tracking-wider text-white">Event History</h2>
          <p className="text-xs text-slate-400">Saved locally · newest first · {events.length} of 1,000 events</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'alerts', 'people', 'animals'] as const).map((value) => <button key={value} onClick={() => setFilter(value)}
          className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase ${filter === value ? 'border-cyan-600 bg-cyan-950 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>{value}</button>)}
        <button onClick={clear} disabled={!events.length} className="flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 font-mono text-[11px] text-slate-400 hover:text-red-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> CLEAR</button>
      </div>
    </header>
    <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
      {visibleEvents.length === 0 ? <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 py-14 text-center text-sm text-slate-400">No matching events yet. Recognition and alert activity will appear here.</div> : visibleEvents.map((event) => {
        const tone = event.severity === 'critical' ? 'border-red-500/40 bg-red-950/20 text-red-300' : event.severity === 'warning' ? 'border-amber-500/40 bg-amber-950/20 text-amber-300' : 'border-slate-800 bg-slate-950/60 text-cyan-300';
        return <article key={event.id} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone}`}>{iconFor(event.type)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold text-slate-100">{event.title}</h3>
              <time className="whitespace-nowrap font-mono text-[10px] text-slate-400">{new Date(event.timestamp).toLocaleString()}</time>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{event.details}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase text-slate-500"><span>{event.cameraName}</span>{typeof event.confidence === 'number' && <span>Confidence {Math.round(event.confidence * 100)}%</span>}{event.severity !== 'info' && <span className="flex items-center gap-1 text-amber-400"><Bell className="h-3 w-3" /> alert event</span>}</div>
          </div>
        </article>;
      })}
    </div>
  </section>;
};
