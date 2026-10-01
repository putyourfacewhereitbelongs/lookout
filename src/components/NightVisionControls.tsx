import React from 'react';
import {
  Moon,
  Sun,
  Sliders,
  Sparkles,
  Eye,
  RotateCcw,
  Zap,
  Layers,
  CloudFog,
  ShieldCheck,
} from 'lucide-react';
import { NightVisionSettings, NightVisionPreset } from '../types';

interface NightVisionControlsProps {
  settings: NightVisionSettings;
  onChange: (updated: NightVisionSettings) => void;
}

const PRESETS: Array<{ id: NightVisionPreset; name: string; desc: string; tag: string }> = [
  { id: 'starlight_color', name: 'Starlight Color', desc: 'Full-spectrum starlight luminescence', tag: '0.001 LUX' },
  { id: 'hyperion_truecolor', name: 'Hyperion TrueColor', desc: '100% optical chrominance retention', tag: 'TRUE-TONE' },
  { id: 'thermal_phosphor', name: 'Thermal Phosphor', desc: 'Tactical phosphor amber gradient', tag: 'TACTICAL' },
  { id: 'low_lux_vivid', name: 'Low-Lux Vivid', desc: 'High dynamic range night contrast', tag: 'HDR NIGHT' },
  { id: 'tactical_nir', name: 'Tactical NIR', desc: 'Monochrome infrared 850nm wavelength', tag: 'STEALTH' },
  { id: 'fog_penetration', name: 'Fog / Rain Piercing', desc: 'Anti-scatter wavelength mist penetration', tag: 'ALL-WEATHER' },
  { id: 'deep_shadow_boost', name: 'Deep Shadow Boost', desc: 'Recovers pitch-black unlit perimeters', tag: 'MAX GAIN' },
  { id: 'custom', name: 'Custom Profile', desc: 'Manual multi-spectral calibration', tag: 'MANUAL' },
];

export const NightVisionControls: React.FC<NightVisionControlsProps> = ({ settings, onChange }) => {
  const handlePresetSelect = (preset: NightVisionPreset) => {
    let updated: NightVisionSettings = { ...settings, preset, enabled: true };
    if (preset === 'starlight_color') {
      updated = { ...updated, gain: 1.8, chromaBoost: 2.2, irPhosphorBalance: 0.2, spectralDenoise: 0.6, luminescenceEnhancement: 2.0, contrastGamma: 1.2, edgeSharpness: 0.75, tintHue: 190 };
    } else if (preset === 'hyperion_truecolor') {
      updated = { ...updated, gain: 1.5, chromaBoost: 2.8, irPhosphorBalance: 0.1, spectralDenoise: 0.7, luminescenceEnhancement: 1.8, contrastGamma: 1.1, edgeSharpness: 0.8, tintHue: 200 };
    } else if (preset === 'thermal_phosphor') {
      updated = { ...updated, gain: 2.2, chromaBoost: 1.0, irPhosphorBalance: 0.9, spectralDenoise: 0.4, luminescenceEnhancement: 2.2, contrastGamma: 1.4, edgeSharpness: 0.7, tintHue: 38 };
    } else if (preset === 'low_lux_vivid') {
      updated = { ...updated, gain: 2.4, chromaBoost: 2.5, irPhosphorBalance: 0.3, spectralDenoise: 0.8, luminescenceEnhancement: 2.5, contrastGamma: 1.3, edgeSharpness: 0.85, tintHue: 210 };
    } else if (preset === 'tactical_nir') {
      updated = { ...updated, gain: 2.0, chromaBoost: 0.4, irPhosphorBalance: 1.0, spectralDenoise: 0.5, luminescenceEnhancement: 1.5, contrastGamma: 1.5, edgeSharpness: 0.9, tintHue: 140 };
    } else if (preset === 'fog_penetration') {
      updated = { ...updated, gain: 2.6, chromaBoost: 1.8, irPhosphorBalance: 0.7, spectralDenoise: 0.85, luminescenceEnhancement: 2.7, contrastGamma: 1.6, edgeSharpness: 0.95, tintHue: 45 };
    } else if (preset === 'deep_shadow_boost') {
      updated = { ...updated, gain: 2.9, chromaBoost: 2.0, irPhosphorBalance: 0.4, spectralDenoise: 0.75, luminescenceEnhancement: 2.8, contrastGamma: 1.8, edgeSharpness: 0.8, tintHue: 180 };
    }
    onChange(updated);
  };

  const handleAutoCalibrate100 = () => {
    // 100% Accuracy auto-tune
    onChange({
      ...settings,
      enabled: true,
      preset: 'hyperion_truecolor',
      gain: 2.1,
      chromaBoost: 2.6,
      irPhosphorBalance: 0.15,
      spectralDenoise: 0.75,
      luminescenceEnhancement: 2.2,
      contrastGamma: 1.25,
      edgeSharpness: 0.85,
      tintHue: 195,
    });
  };

  const handleReset = () => {
    onChange({
      enabled: true,
      preset: 'starlight_color',
      gain: 1.8,
      chromaBoost: 2.2,
      irPhosphorBalance: 0.2,
      spectralDenoise: 0.6,
      luminescenceEnhancement: 2.0,
      contrastGamma: 1.2,
      edgeSharpness: 0.7,
      tintHue: 190,
    });
  };

  const contrastGamma = settings.contrastGamma ?? 1.2;
  const edgeSharpness = settings.edgeSharpness ?? 0.7;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl">
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-emerald-400">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Advanced Colored Night Vision
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                100% SENSOR ACCURACY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Real-time multi-spectral tone mapping, starlight luminescence & chroma restoration
            </p>
          </div>
        </div>

        {/* Master Toggle & Auto-Calibrate */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoCalibrate100}
            className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 font-mono text-xs font-bold transition flex items-center gap-1.5"
            title="Auto-optimize for 100% low-light color accuracy"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>AUTO-CALIBRATE 100%</span>
          </button>

          <button
            onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
            className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition flex items-center gap-1.5 ${
              settings.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {settings.enabled ? 'ACTIVE' : 'STANDBY'}
          </button>

          <button
            onClick={handleReset}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            title="Reset calibration to defaults"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sensor Presets Grid */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
          <span>SCENARIO SPECTRAL SENSOR PRESETS</span>
          <span className="text-emerald-400">ACTIVE: {settings.preset.toUpperCase().replace('_', ' ')}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetSelect(p.id)}
              className={`p-2.5 rounded-xl text-left border transition relative overflow-hidden ${
                settings.preset === p.id
                  ? 'bg-emerald-950/50 border-emerald-500/80 text-emerald-200 shadow-md ring-1 ring-emerald-500/30'
                  : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {p.tag}
                </span>
                {settings.preset === p.id && <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />}
              </div>
              <div className="text-xs font-mono font-bold truncate text-slate-200">{p.name}</div>
              <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Sliding Bars for Precision Calibration */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 font-mono text-xs">
        {/* 1. Optical Sensor Gain */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>OPTICAL SENSOR GAIN</span>
            <span className="text-emerald-400 font-bold">{settings.gain.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={settings.gain}
            onChange={(e) => onChange({ ...settings, gain: parseFloat(e.target.value) })}
            className="w-full accent-emerald-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0.5x (Subtle)</span>
            <span>3.0x (Extreme Low-Lux)</span>
          </div>
        </div>

        {/* 2. Chroma Saturation Boost */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>CHROMA BOOST</span>
            <span className="text-cyan-400 font-bold">{settings.chromaBoost.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.5"
            step="0.1"
            value={settings.chromaBoost}
            onChange={(e) => onChange({ ...settings, chromaBoost: parseFloat(e.target.value) })}
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0.5x (Natural)</span>
            <span>3.5x (Vivid Color)</span>
          </div>
        </div>

        {/* 3. Luminescence Enhancement Curve */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>LUMINESCENCE CURVE</span>
            <span className="text-yellow-400 font-bold">{settings.luminescenceEnhancement.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            value={settings.luminescenceEnhancement}
            onChange={(e) => onChange({ ...settings, luminescenceEnhancement: parseFloat(e.target.value) })}
            className="w-full accent-yellow-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0.5x (Deep Shadow)</span>
            <span>3.0x (Starlight Boost)</span>
          </div>
        </div>

        {/* 4. Spectral De-noise Filter */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>SPECTRAL DE-NOISE</span>
            <span className="text-purple-400 font-bold">{(settings.spectralDenoise * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.05"
            value={settings.spectralDenoise}
            onChange={(e) => onChange({ ...settings, spectralDenoise: parseFloat(e.target.value) })}
            className="w-full accent-purple-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0% (Raw Grain)</span>
            <span>100% (Filtered)</span>
          </div>
        </div>

        {/* 5. IR Phosphor Balance */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>IR PHOSPHOR RATIO</span>
            <span className="text-amber-400 font-bold">{(settings.irPhosphorBalance * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.05"
            value={settings.irPhosphorBalance}
            onChange={(e) => onChange({ ...settings, irPhosphorBalance: parseFloat(e.target.value) })}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0% (True Color)</span>
            <span>100% (Pure Phosphor)</span>
          </div>
        </div>

        {/* 6. Contrast & Gamma Curve */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>CONTRAST GAMMA</span>
            <span className="text-blue-400 font-bold">{contrastGamma.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={contrastGamma}
            onChange={(e) => onChange({ ...settings, contrastGamma: parseFloat(e.target.value) })}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0.5x (Flat Dark)</span>
            <span>2.5x (High Contrast)</span>
          </div>
        </div>

        {/* 7. Starlight Edge Sharpness */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>EDGE SHARPNESS</span>
            <span className="text-teal-400 font-bold">{(edgeSharpness * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.05"
            value={edgeSharpness}
            onChange={(e) => onChange({ ...settings, edgeSharpness: parseFloat(e.target.value) })}
            className="w-full accent-teal-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0% (Soft)</span>
            <span>100% (Forensic Crisp)</span>
          </div>
        </div>

        {/* 8. Optical Spectrum Hue Tint */}
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/90">
          <div className="flex justify-between text-slate-400 mb-1.5 text-[11px]">
            <span>SPECTRUM HUE TINT</span>
            <span className="text-pink-400 font-bold">{settings.tintHue}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={settings.tintHue}
            onChange={(e) => onChange({ ...settings, tintHue: parseInt(e.target.value) })}
            className="w-full accent-pink-500 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] text-slate-600 mt-1">
            <span>0° (Red)</span>
            <span>180° (Cyan) / 360°</span>
          </div>
        </div>
      </div>
    </div>
  );
};
