import React from 'react';
import {
  Moon,
  Sun,
  Monitor,
  Flame,
  Layers,
  Sparkles,
  Tv,
  CheckCircle,
  Eye,
  Sliders,
} from 'lucide-react';
import { UIThemeMode, VideoProcessingSettings, ImageProfileType } from '../../types';

interface ThemeDisplaySectionProps {
  currentTheme: UIThemeMode;
  onThemeChange: (theme: UIThemeMode) => void;
  videoProcessing: VideoProcessingSettings;
  onVideoProcessingChange: (v: VideoProcessingSettings) => void;
}

const THEME_OPTIONS: Array<{
  id: UIThemeMode;
  name: string;
  description: string;
  badge: string;
  previewBg: string;
  previewBorder: string;
  previewText: string;
}> = [
  {
    id: 'dark',
    name: 'Tactical Midnight Dark (Default)',
    description: 'Deep slate midnight interface optimized for low eye fatigue during long surveillance shifts.',
    badge: 'DEFAULT',
    previewBg: 'bg-slate-950',
    previewBorder: 'border-cyan-500',
    previewText: 'text-cyan-400',
  },
  {
    id: 'oled',
    name: 'OLED Pitch Black',
    description: 'Pure 100% black pixels (#000000) for zero backlight bleed and maximum battery efficiency on mobile/tablets.',
    badge: 'HIGH CONTRAST',
    previewBg: 'bg-black',
    previewBorder: 'border-emerald-500',
    previewText: 'text-emerald-400',
  },
  {
    id: 'tactical_nvg',
    name: 'Tactical NVG Red Spectrum',
    description: 'Preserves natural night vision adaptation for outdoor security guards and emergency response teams.',
    badge: 'MILITARY NVG',
    previewBg: 'bg-zinc-950',
    previewBorder: 'border-red-600',
    previewText: 'text-red-400',
  },
  {
    id: 'light',
    name: 'Daylight High-Clarity Light',
    description: 'High dynamic range light palette designed for bright sunlight monitoring on mobile or outdoor tablets.',
    badge: 'SUNLIGHT READY',
    previewBg: 'bg-slate-100',
    previewBorder: 'border-slate-400',
    previewText: 'text-slate-800',
  },
];

export const ThemeDisplaySection: React.FC<ThemeDisplaySectionProps> = ({
  currentTheme,
  onThemeChange,
  videoProcessing,
  onVideoProcessingChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/80 border border-blue-800/60 rounded-xl text-blue-400">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Display Theme & UI Calibration
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
                ACTIVE: {currentTheme.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Instant theme switching across mobile and desktop displays with responsive HUD styling
            </p>
          </div>
        </div>
      </div>

      {/* Theme Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-mono text-xs">
        {THEME_OPTIONS.map((theme) => {
          const isSelected = currentTheme === theme.id;
          return (
            <div
              key={theme.id}
              onClick={() => onThemeChange(theme.id)}
              className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-900 border-cyan-500 ring-2 ring-cyan-500/40 shadow-xl'
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full border ${theme.previewBg} ${theme.previewBorder}`}
                    />
                    <span className="font-bold text-white text-xs">{theme.name}</span>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {theme.badge}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {theme.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
                <span className={`text-[11px] font-bold ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`}>
                  {isSelected ? '✓ ACTIVE THEME' : 'TAP TO APPLY'}
                </span>
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border ${
                    isSelected ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-slate-700 bg-slate-900 text-transparent'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Neural Video Enhancement Overlays */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
        <h4 className="font-bold uppercase text-white flex items-center gap-2 text-xs">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          Optical Profiles & Neural Shaders
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Video Background Erase */}
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-200">Video Background Erase</span>
                <input
                  type="checkbox"
                  checked={videoProcessing.videoBackgroundErase}
                  onChange={(e) =>
                    onVideoProcessingChange({
                      ...videoProcessing,
                      videoBackgroundErase: e.target.checked,
                    })
                  }
                  className="accent-cyan-500 rounded"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                Isolates foreground subjects by dimming distracting background noise.
              </p>
            </div>
            <span
              className={`mt-2 text-[10px] font-bold ${
                videoProcessing.videoBackgroundErase ? 'text-cyan-400' : 'text-slate-500'
              }`}
            >
              {videoProcessing.videoBackgroundErase ? 'VIRTUAL STUDIO ACTIVE' : 'DISABLED'}
            </span>
          </div>

          {/* 8K Upscaling */}
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-200">8K Super-Res Upscaling</span>
                <input
                  type="checkbox"
                  checked={videoProcessing.upscaling8K}
                  onChange={(e) =>
                    onVideoProcessingChange({
                      ...videoProcessing,
                      upscaling8K: e.target.checked,
                    })
                  }
                  className="accent-purple-500 rounded"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                Multi-pass unsharp masking and micro-contrast enhancement for ultra-sharp clarity.
              </p>
            </div>
            <span
              className={`mt-2 text-[10px] font-bold ${
                videoProcessing.upscaling8K ? 'text-purple-400' : 'text-slate-500'
              }`}
            >
              {videoProcessing.upscaling8K ? '8K HIGH FREQUENCY BOOST' : 'OFF'}
            </span>
          </div>

          {/* Preset Image Profiles */}
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
            <span className="font-bold text-slate-200 block mb-1">Preset Image Profiles</span>
            <select
              value={videoProcessing.imageProfile}
              onChange={(e) =>
                onVideoProcessingChange({
                  ...videoProcessing,
                  imageProfile: e.target.value as ImageProfileType,
                })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-200 mt-1"
            >
              <option value="standard">Standard Natural</option>
              <option value="tactical_noir">Tactical Noir (Monochrome)</option>
              <option value="starlight_color">Starlight Vivid</option>
              <option value="vivid_surveillance">Vivid Surveillance</option>
              <option value="high_contrast_nir">High Contrast NIR</option>
              <option value="forensic_edge">Forensic Edge Inversion</option>
            </select>
            <span className="text-[9px] text-slate-500 block mt-1.5">
              Preset optical LUT for rapid incident identification.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
