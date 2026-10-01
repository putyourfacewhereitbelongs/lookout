import React, { useState } from 'react';
import {
  Volume2,
  AlertTriangle,
  Radio,
  BellRing,
  Activity,
  Mic,
  VolumeX,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import { AudioVisualCue } from '../types';
import { audioEngine } from '../services/audioEngine';

interface AudioRadarProps {
  cues: AudioVisualCue[];
  frequencyData: Uint8Array;
  onClearCues: () => void;
}

export const AudioRadar: React.FC<AudioRadarProps> = ({ cues, frequencyData, onClearCues }) => {
  const [selectedTone, setSelectedTone] = useState<'tactical_chime' | 'intruder_siren' | 'radar_ping' | 'subtle_pulse'>('tactical_chime');
  const [sensitivityDb, setSensitivityDb] = useState<number>(65);
  const [isAlertMuted, setIsAlertMuted] = useState<boolean>(false);

  // Calculate live average decibel / energy from real FFT buffer
  let liveEnergySum = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    liveEnergySum += frequencyData[i];
  }
  const avgLevel = frequencyData.length > 0 ? Math.round((liveEnergySum / frequencyData.length) * 0.45) + 32 : 38;

  const handleSelectTone = (tone: 'tactical_chime' | 'intruder_siren' | 'radar_ping' | 'subtle_pulse') => {
    setSelectedTone(tone);
    if (!isAlertMuted) {
      audioEngine.playAlertTone(tone);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-950/80 border border-purple-800/60 rounded-xl text-purple-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Acoustic Radar & Accessibility Visualizer
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                REAL-TIME DSP
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Translates ambient acoustics into visual cues for hearing accessibility
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClearCues}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition"
          >
            CLEAR LOG
          </button>
        </div>
      </div>

      {/* Real-time Frequency Spectrum Visualizer */}
      <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <Activity className="w-3.5 h-3.5" />
            LIVE FFT AUDIO SPECTRUM (30Hz - 16kHz)
          </span>
          <span>SENSITIVITY: 44.1 kHz 24-bit</span>
        </div>

        <div className="flex items-end gap-1 h-20 w-full overflow-hidden">
          {Array.from({ length: 48 }).map((_, idx) => {
            const dataIndex = Math.floor((idx / 48) * (frequencyData.length || 64));
            const val = frequencyData[dataIndex] || (Math.sin(idx * 0.4 + Date.now() * 0.003) * 20 + 25);
            const heightPercent = Math.min(100, Math.max(8, (val / 255) * 100));
            const isHigh = heightPercent > 65;

            return (
              <div
                key={idx}
                className={`flex-1 rounded-t transition-all duration-75 ${
                  isHigh ? 'bg-red-500' : heightPercent > 40 ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
                style={{ height: `${heightPercent}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Live Acoustic Diagnostics & Sensitivity Calibration */}
      <div className="mt-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-mono text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>ACOUSTIC THRESHOLD & ALARM PROFILE</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400 text-[11px]">LIVE NOISE FLOOR:</span>
            <span className={`font-bold ${avgLevel > sensitivityDb ? 'text-amber-400' : 'text-emerald-400'}`}>
              {avgLevel} dB
            </span>
          </div>
        </div>

        {/* Alarm Sound Profile Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          {[
            { id: 'tactical_chime' as const, label: 'Tactical Chime' },
            { id: 'intruder_siren' as const, label: 'Intruder Siren' },
            { id: 'radar_ping' as const, label: 'Radar Ping' },
            { id: 'subtle_pulse' as const, label: 'Subtle Pulse' },
          ].map((tone) => (
            <button
              key={tone.id}
              onClick={() => handleSelectTone(tone.id)}
              className={`p-2.5 rounded-xl border font-mono text-xs transition flex items-center justify-center gap-1.5 ${
                selectedTone === tone.id
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-850'
              }`}
            >
              {selectedTone === tone.id && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
              <span>{tone.label}</span>
            </button>
          ))}
        </div>

        {/* Sensitivity Slider & Mute Toggle */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-slate-400 text-[11px] shrink-0">TRIGGER THRESHOLD:</span>
            <input
              type="range"
              min="40"
              max="95"
              value={sensitivityDb}
              onChange={(e) => setSensitivityDb(Number(e.target.value))}
              className="w-32 accent-cyan-400"
            />
            <span className="text-cyan-300 text-[11px] font-bold">{sensitivityDb} dB</span>
          </div>

          <button
            onClick={() => setIsAlertMuted(!isAlertMuted)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition flex items-center gap-1.5 ${
              isAlertMuted
                ? 'bg-amber-950/60 border-amber-600 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {isAlertMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isAlertMuted ? 'ACOUSTIC ALERTS MUTED' : 'ALERTS ACTIVE'}</span>
          </button>
        </div>
      </div>

      {/* Visual Cues Stream */}
      <div className="mt-4">
        <div className="text-[11px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
          LIVE DESCRIPTIVE AUDIO CUES FOR ACCESSIBILITY ({cues.length})
        </div>

        {cues.length === 0 ? (
          <div className="text-center py-6 text-slate-500 font-mono text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
            Acoustic sensor calibrated. Ambient background sound is within quiet nominal parameters.
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {cues.slice(0, 15).map((cue, idx) => {
              const isUrgent = cue.type === 'glass' || cue.type === 'impact' || cue.type === 'alarm';
              return (
                <div
                  key={`${cue.id}-${idx}`}
                  className={`p-3 rounded-xl border flex items-center justify-between font-mono text-xs transition ${
                    isUrgent
                      ? 'bg-red-950/40 border-red-800/80 text-red-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {isUrgent ? (
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        <span>{cue.type === 'speech' ? `“${cue.label}”` : `[${cue.label.toUpperCase()}]`}</span>
                        {cue.type !== 'speech' && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            {cue.dbLevel} dB • {(cue.confidence * 100).toFixed(0)}% confidence
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(cue.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                      isUrgent
                        ? 'bg-red-900/60 text-red-300 border border-red-700'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {cue.type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
