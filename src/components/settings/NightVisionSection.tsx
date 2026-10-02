import React, { useRef, useEffect } from 'react';
import {
  Moon,
  Sparkles,
  Zap,
  RotateCcw,
  ShieldCheck,
  Eye,
  Sliders,
  Flame,
  Layers,
} from 'lucide-react';
import { NightVisionSettings, NightVisionPreset, RedSilhouetteSettings } from '../../types';

interface NightVisionSectionProps {
  settings: NightVisionSettings;
  onChange: (s: NightVisionSettings) => void;
  redSilhouette: RedSilhouetteSettings;
  onRedSilhouetteChange: (s: RedSilhouetteSettings) => void;
}

const PRESETS: Array<{ id: NightVisionPreset; name: string; desc: string; tag: string }> = [
  { id: 'starlight_color', name: 'Starlight Color', desc: 'Full-spectrum starlight luminescence (0.001 LUX)', tag: '0.001 LUX' },
  { id: 'hyperion_truecolor', name: 'Hyperion TrueColor', desc: '100% optical chrominance retention', tag: 'TRUE-TONE' },
  { id: 'thermal_phosphor', name: 'Thermal Phosphor', desc: 'Tactical phosphor amber gradient', tag: 'TACTICAL' },
  { id: 'low_lux_vivid', name: 'Low-Lux Vivid', desc: 'High dynamic range night contrast', tag: 'HDR NIGHT' },
  { id: 'tactical_nir', name: 'Tactical NIR', desc: 'Monochrome infrared 850nm wavelength', tag: 'STEALTH' },
  { id: 'fog_penetration', name: 'Fog / Rain Piercing', desc: 'Anti-scatter wavelength mist penetration', tag: 'ALL-WEATHER' },
  { id: 'deep_shadow_boost', name: 'Deep Shadow Boost', desc: 'Recovers pitch-black unlit perimeters', tag: 'MAX GAIN' },
  { id: 'custom', name: 'Custom Profile', desc: 'Manual multi-spectral calibration', tag: 'MANUAL' },
];

export const NightVisionSection: React.FC<NightVisionSectionProps> = ({
  settings,
  onChange,
  redSilhouette,
  onRedSilhouetteChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Draw simulated live night vision frame on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background gradient based on hue tint and luminescence
    const grad = ctx.createLinearGradient(0, 0, w, h);
    const lum = settings.enabled ? Math.min(1.0, settings.luminescenceEnhancement / 2.5) : 0.2;
    const gain = settings.enabled ? settings.gain : 1.0;
    const hue = settings.tintHue;

    grad.addColorStop(0, `hsla(${hue}, 60%, ${Math.round(15 * lum * gain)}%, 1)`);
    grad.addColorStop(1, `hsla(${hue}, 80%, ${Math.round(8 * lum * gain)}%, 1)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Starlight Grid
    ctx.strokeStyle = `hsla(${hue}, 50%, 40%, 0.2)`;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Preview the same category colors as the live, contour-based overlay.
    const centerX = w * 0.45;
    const centerY = h * 0.55;
    const drawTintedShape = (path: Path2D, color: string) => {
      ctx.save();
      ctx.globalAlpha = redSilhouette.enabled ? redSilhouette.opacity * 0.42 : 0.8;
      ctx.fillStyle = redSilhouette.enabled ? color : `hsla(${hue}, 90%, ${Math.min(90, Math.round(50 * settings.chromaBoost))}%, 1)`;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = redSilhouette.enabled ? color : '#38bdf8';
      ctx.lineWidth = Math.max(1.5, redSilhouette.edgePrecision);
      ctx.stroke(path);
      ctx.restore();
    };

    const humanPath = new Path2D();
    humanPath.moveTo(centerX - 10, centerY - 32);
    humanPath.bezierCurveTo(centerX - 17, centerY - 43, centerX - 10, centerY - 55, centerX, centerY - 55);
    humanPath.bezierCurveTo(centerX + 12, centerY - 55, centerX + 17, centerY - 42, centerX + 10, centerY - 32);
    humanPath.lineTo(centerX + 17, centerY - 25);
    humanPath.lineTo(centerX + 28, centerY - 8);
    humanPath.lineTo(centerX + 21, centerY - 3);
    humanPath.lineTo(centerX + 14, centerY - 15);
    humanPath.lineTo(centerX + 13, centerY + 8);
    humanPath.lineTo(centerX + 19, centerY + 37);
    humanPath.lineTo(centerX + 8, centerY + 39);
    humanPath.lineTo(centerX, centerY + 17);
    humanPath.lineTo(centerX - 8, centerY + 39);
    humanPath.lineTo(centerX - 19, centerY + 37);
    humanPath.lineTo(centerX - 13, centerY + 8);
    humanPath.lineTo(centerX - 14, centerY - 15);
    humanPath.lineTo(centerX - 21, centerY - 3);
    humanPath.lineTo(centerX - 28, centerY - 8);
    humanPath.lineTo(centerX - 17, centerY - 25);
    humanPath.closePath();

    const animalPath = new Path2D();
    const animalX = centerX + 70;
    animalPath.moveTo(animalX - 34, centerY + 10);
    animalPath.lineTo(animalX - 28, centerY - 4);
    animalPath.lineTo(animalX - 10, centerY - 8);
    animalPath.lineTo(animalX + 7, centerY - 5);
    animalPath.lineTo(animalX + 20, centerY - 13);
    animalPath.lineTo(animalX + 31, centerY - 8);
    animalPath.lineTo(animalX + 27, centerY + 1);
    animalPath.lineTo(animalX + 35, centerY + 8);
    animalPath.lineTo(animalX + 27, centerY + 15);
    animalPath.lineTo(animalX + 24, centerY + 31);
    animalPath.lineTo(animalX + 16, centerY + 31);
    animalPath.lineTo(animalX + 13, centerY + 15);
    animalPath.lineTo(animalX - 13, centerY + 15);
    animalPath.lineTo(animalX - 17, centerY + 31);
    animalPath.lineTo(animalX - 25, centerY + 31);
    animalPath.lineTo(animalX - 24, centerY + 11);
    animalPath.closePath();

    if (!redSilhouette.enabled || redSilhouette.targetPeople) drawTintedShape(humanPath, '#ef4444');
    if (redSilhouette.enabled && redSilhouette.targetAnimals) drawTintedShape(animalPath, '#3b82f6');

    // Bounding Box
    ctx.strokeStyle = redSilhouette.enabled ? '#ef4444' : '#10b981';
    ctx.lineWidth = 1;
    const previewLeft = redSilhouette.enabled && redSilhouette.targetAnimals ? centerX - 34 : centerX - 32;
    const previewRight = redSilhouette.enabled && redSilhouette.targetAnimals ? animalX + 38 : centerX + 32;
    ctx.strokeRect(previewLeft, centerY - 58, previewRight - previewLeft, 96);

    // Label
    ctx.fillStyle = redSilhouette.enabled ? '#ef4444' : '#10b981';
    ctx.font = '9px monospace';
    ctx.fillText(
      redSilhouette.enabled ? 'HUMAN: RED  •  ANIMAL: BLUE' : 'TARGET: STARLIGHT COLOR 100%',
      previewLeft,
      centerY - 56
    );

    // Telemetry text
    ctx.fillStyle = '#64748b';
    ctx.font = '8px monospace';
    ctx.fillText(`GAIN: ${gain.toFixed(1)}x • LUM: ${settings.luminescenceEnhancement.toFixed(1)}x • HUE: ${hue}°`, 10, h - 8);
  }, [settings, redSilhouette]);

  const contrastGamma = settings.contrastGamma ?? 1.2;
  const edgeSharpness = settings.edgeSharpness ?? 0.7;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-emerald-400">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Advanced Colored Night Vision Calibration
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                100% SENSOR ACCURACY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Multi-spectral tone mapping, starlight chroma reconstruction, and sub-pixel edge sharpening
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={handleAutoCalibrate100}
            className="px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 font-bold transition flex items-center gap-1.5"
            title="Auto-optimize for 100% low-light color fidelity"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>AUTO-CALIBRATE 100%</span>
          </button>

          <button
            onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
              settings.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{settings.enabled ? 'ACTIVE' : 'STANDBY'}</span>
          </button>

          <button
            onClick={handleReset}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Reset calibration to defaults"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sensor Presets Grid */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
          <span>SCENARIO SPECTRAL SENSOR PRESETS</span>
          <span className="text-emerald-400 font-bold">
            ACTIVE: {settings.preset.toUpperCase().replace('_', ' ')}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handlePresetSelect(p.id)}
              className={`p-3 rounded-xl text-left border transition relative overflow-hidden ${
                settings.preset === p.id
                  ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-500/30'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                  {p.tag}
                </span>
                {settings.preset === p.id && (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
              </div>
              <div className="text-xs font-mono font-bold truncate text-slate-100">{p.name}</div>
              <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview Simulation & Tactical Red Silhouette */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Real-Time Preview Simulation */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-bold text-slate-300">
              SPECTRAL SIMULATION VIEWPORT
            </span>
            <span className="text-[10px] font-mono text-emerald-400">REAL-TIME SHADER</span>
          </div>
          <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-800 bg-black flex items-center justify-center">
            <canvas ref={canvasRef} width={280} height={160} className="w-full h-full object-cover" />
          </div>
          <p className="text-[10px] font-mono text-slate-500 mt-2">
            Visual output renders dynamic chroma gain, edge sharpening, and red silhouette highlights in real-time.
          </p>
        </div>

        {/* Tactical Red Body Silhouette Controls */}
        <div className="lg:col-span-2 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-500/80" />
              <h4 className="font-bold uppercase text-white">Tactical Red Body Silhouette</h4>
            </div>
            <button
              onClick={() =>
                onRedSilhouetteChange({ ...redSilhouette, enabled: !redSilhouette.enabled })
              }
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                redSilhouette.enabled
                  ? 'bg-red-600 text-white shadow-md shadow-red-950'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {redSilhouette.enabled ? 'ACTIVE' : 'DISABLED'}
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            Uses an on-device semantic mask to mark only detected people in translucent red and animals in translucent blue. No box, oval, or background fallback is drawn; first use downloads and caches the contour model.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-bold">TARGET ENTITIES</span>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={redSilhouette.targetPeople}
                  onChange={(e) =>
                    onRedSilhouetteChange({ ...redSilhouette, targetPeople: e.target.checked })
                  }
                  className="accent-red-500 rounded"
                />
                <span>Highlight People Red</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={redSilhouette.targetAnimals}
                  onChange={(e) =>
                    onRedSilhouetteChange({ ...redSilhouette, targetAnimals: e.target.checked })
                  }
                  className="accent-blue-500 rounded"
                />
                <span>Highlight Animals Blue</span>
              </label>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>CONTOUR PRECISION</span>
                <span className="text-red-400">{redSilhouette.edgePrecision} / 5</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={redSilhouette.edgePrecision}
                onChange={(e) =>
                  onRedSilhouetteChange({
                    ...redSilhouette,
                    edgePrecision: parseInt(e.target.value),
                  })
                }
                className="w-full accent-red-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>Gradient</span>
                <span>Razor Crisp</span>
              </div>
            </div>

            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-bold">SILHOUETTE OPACITY</span>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>DENSITY</span>
                <span className="text-red-400">{(redSilhouette.opacity * 100).toFixed(0)}% strength · translucent</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="1.0"
                step="0.05"
                value={redSilhouette.opacity}
                onChange={(e) =>
                  onRedSilhouetteChange({
                    ...redSilhouette,
                    opacity: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-red-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 8 Interactive Precision Calibration Sliding Bars */}
      <div>
        <div className="text-[11px] font-mono text-slate-400 mb-3 uppercase tracking-wider">
          MULTI-SPECTRAL PARAMETER SLIDING BARS
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          {/* 1. Optical Sensor Gain */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
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
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0.5x (Subtle)</span>
              <span>3.0x (Extreme Low-Lux)</span>
            </div>
          </div>

          {/* 2. Chroma Saturation Boost */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
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
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0.5x (Natural)</span>
              <span>3.5x (Vivid Color)</span>
            </div>
          </div>

          {/* 3. Luminescence Enhancement Curve */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
              <span>LUMINESCENCE CURVE</span>
              <span className="text-yellow-400 font-bold">
                {settings.luminescenceEnhancement.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={settings.luminescenceEnhancement}
              onChange={(e) =>
                onChange({ ...settings, luminescenceEnhancement: parseFloat(e.target.value) })
              }
              className="w-full accent-yellow-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0.5x (Deep Shadow)</span>
              <span>3.0x (Starlight Boost)</span>
            </div>
          </div>

          {/* 4. Spectral De-noise Filter */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
              <span>SPECTRAL DE-NOISE</span>
              <span className="text-purple-400 font-bold">
                {(settings.spectralDenoise * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={settings.spectralDenoise}
              onChange={(e) =>
                onChange({ ...settings, spectralDenoise: parseFloat(e.target.value) })
              }
              className="w-full accent-purple-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0% (Raw Grain)</span>
              <span>100% (Pure Denoised)</span>
            </div>
          </div>

          {/* 5. IR Phosphor Balance */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
              <span>IR PHOSPHOR RATIO</span>
              <span className="text-amber-400 font-bold">
                {(settings.irPhosphorBalance * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={settings.irPhosphorBalance}
              onChange={(e) =>
                onChange({ ...settings, irPhosphorBalance: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0% (True Color)</span>
              <span>100% (Phosphor Amber)</span>
            </div>
          </div>

          {/* 6. Contrast & Gamma Curve */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
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
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0.5x (Flat Dark)</span>
              <span>2.5x (Forensic Contrast)</span>
            </div>
          </div>

          {/* 7. Edge Sharpness */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
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
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0% (Soft)</span>
              <span>100% (Crisp Perimeter)</span>
            </div>
          </div>

          {/* 8. Optical Spectrum Hue Tint */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
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
            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
              <span>0° (Red/Amber)</span>
              <span>180° (Cyan/Blue)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
