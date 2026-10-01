import React, { useState } from 'react';
import {
  Sliders,
  Shield,
  User,
  AlertTriangle,
  Dog,
  Car,
  CloudRain,
  Package,
  RotateCcw,
  Zap,
  Sparkles,
  CheckCircle,
  Eye,
  Volume2,
} from 'lucide-react';
import { DetectionSensitivities, CategorySensitivity, SubjectCategory } from '../../types';
import { DEFAULT_SENSITIVITIES } from '../../services/db';

interface AiSensitivitiesSectionProps {
  sensitivities: DetectionSensitivities;
  onChange: (s: DetectionSensitivities) => void;
}

type DetectionCategoryKey = Exclude<keyof DetectionSensitivities, 'fixedCameraGuard'>;

interface CategoryConfig {
  key: DetectionCategoryKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultColor: string;
  subcategories: string[];
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: 'people',
    label: 'People & Intruders',
    description: 'Human detection, loitering detection, perimeter breaches, and known vs unknown faces',
    icon: <User className="w-4 h-4 text-red-400" />,
    defaultColor: '#ef4444',
    subcategories: ['Pedestrians', 'Loitering', 'Front Door Approach', 'Unrecognized Persons'],
  },
  {
    key: 'threats',
    label: 'Threats & Perimeter Breach',
    description: 'Aggressive movement, suspicious postures, tools/objects, and critical boundary breaches',
    icon: <AlertTriangle className="w-4 h-4 text-rose-500" />,
    defaultColor: '#dc2626',
    subcategories: ['Perimeter Ingress', 'Rapid Approach', 'Aggressive Gesture', 'Boundary Breach'],
  },
  {
    key: 'animals',
    label: 'Animals & Pets',
    description: 'Detects animals by visible species or breed and recognizes enrolled pets by their assigned names',
    icon: <Dog className="w-4 h-4 text-emerald-400" />,
    defaultColor: '#10b981',
    subcategories: ['Dogs by breed', 'Cats by breed', 'Wildlife species', 'Enrolled pet names'],
  },
  {
    key: 'cars',
    label: 'Vehicles & Traffic',
    description: 'Automobiles, delivery trucks, motorcycles, driveway entry, and speed monitoring',
    icon: <Car className="w-4 h-4 text-amber-400" />,
    defaultColor: '#f59e0b',
    subcategories: ['Driveway Ingress', 'Delivery Vans', 'License Plate Zone', 'Speed Velocity'],
  },
  {
    key: 'objects',
    label: 'Objects & Deliveries',
    description: 'Packages on doorsteps, abandoned luggage, tools, and stationary obstacles',
    icon: <Package className="w-4 h-4 text-cyan-400" />,
    defaultColor: '#06b6d4',
    subcategories: ['Doorstep Deliveries', 'Abandoned Baggage', 'Bicycles / Tools', 'Obstacle Hazards'],
  },
  {
    key: 'weather',
    label: 'Weather & Optical Scatter',
    description: 'Dense fog, torrential precipitation, snow scatter, and camera lens obstruction',
    icon: <CloudRain className="w-4 h-4 text-purple-400" />,
    defaultColor: '#8b5cf6',
    subcategories: ['Dense Fog Penetration', 'Rain Streaks', 'Snow Scatter', 'Optical Smudge'],
  },
];

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

export const AiSensitivitiesSection: React.FC<AiSensitivitiesSectionProps> = ({
  sensitivities,
  onChange,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<DetectionCategoryKey>('people');
  const [saveToast, setSaveToast] = useState(false);

  const handleUpdateCategory = (
    key: DetectionCategoryKey,
    patch: Partial<CategorySensitivity>
  ) => {
    const updated = {
      ...sensitivities,
      [key]: {
        ...sensitivities[key],
        ...patch,
      },
    };
    onChange(updated);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleApplyPreset = (preset: 'high_security' | 'low_false_positive' | 'pet_friendly') => {
    let updated: DetectionSensitivities = { ...sensitivities };
    if (preset === 'high_security') {
      updated = {
        fixedCameraGuard: sensitivities.fixedCameraGuard,
        people: { ...sensitivities.people, sensitivity: 98, confidenceThreshold: 0.5, triggerAlert: true, audibleChime: true },
        threats: { ...sensitivities.threats, sensitivity: 100, confidenceThreshold: 0.5, triggerAlert: true, audibleChime: true },
        animals: { ...sensitivities.animals, sensitivity: 80, confidenceThreshold: 0.65 },
        cars: { ...sensitivities.cars, sensitivity: 90, confidenceThreshold: 0.6, triggerAlert: true },
        objects: { ...sensitivities.objects, sensitivity: 85, confidenceThreshold: 0.6, triggerAlert: true },
        weather: { ...sensitivities.weather, sensitivity: 75, confidenceThreshold: 0.65 },
      };
    } else if (preset === 'low_false_positive') {
      updated = {
        fixedCameraGuard: sensitivities.fixedCameraGuard,
        people: { ...sensitivities.people, sensitivity: 75, confidenceThreshold: 0.8, triggerAlert: true, audibleChime: true },
        threats: { ...sensitivities.threats, sensitivity: 85, confidenceThreshold: 0.75, triggerAlert: true, audibleChime: true },
        animals: { ...sensitivities.animals, sensitivity: 60, confidenceThreshold: 0.85 },
        cars: { ...sensitivities.cars, sensitivity: 65, confidenceThreshold: 0.85 },
        objects: { ...sensitivities.objects, sensitivity: 65, confidenceThreshold: 0.8 },
        weather: { ...sensitivities.weather, sensitivity: 50, confidenceThreshold: 0.85 },
      };
    } else if (preset === 'pet_friendly') {
      updated = {
        fixedCameraGuard: sensitivities.fixedCameraGuard,
        people: { ...sensitivities.people, sensitivity: 85, confidenceThreshold: 0.65 },
        threats: { ...sensitivities.threats, sensitivity: 90, confidenceThreshold: 0.7 },
        animals: { ...sensitivities.animals, sensitivity: 95, confidenceThreshold: 0.55, triggerAlert: true, audibleChime: false },
        cars: { ...sensitivities.cars, sensitivity: 70, confidenceThreshold: 0.75 },
        objects: { ...sensitivities.objects, sensitivity: 80, confidenceThreshold: 0.7 },
        weather: { ...sensitivities.weather, sensitivity: 60, confidenceThreshold: 0.7 },
      };
    }
    onChange(updated);
  };

  const currentConfig = CATEGORIES.find((c) => c.key === selectedCategory) || CATEGORIES[0];
  const currentSetting = sensitivities[selectedCategory] || DEFAULT_SENSITIVITIES[selectedCategory];

  return (
    <div className="space-y-6">
      {/* Header Info & Presets */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              AI Detection Sensitivities Matrix
            </h3>
            {saveToast && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 animate-fade-in">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                SAVED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Fine-tune neural vision thresholds for all 7 subject categories with sub-pixel bounding precision.
          </p>
        </div>

        {/* Global Preset Profiles */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <button
            onClick={() => handleApplyPreset('high_security')}
            className="px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-800 text-red-300 font-bold transition flex items-center gap-1"
            title="Max sensitivity across all categories"
          >
            <Shield className="w-3.5 h-3.5" />
            MAX SECURITY
          </button>
          <button
            onClick={() => handleApplyPreset('low_false_positive')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
            title="High confidence filtering to prevent false alarms"
          >
            FILTER FALSE ALARMS
          </button>
          <button
            onClick={() => handleApplyPreset('pet_friendly')}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800 text-emerald-300 transition flex items-center gap-1"
          >
            <Dog className="w-3.5 h-3.5" />
            PET SAFE
          </button>
          <button
            onClick={() => onChange(DEFAULT_SENSITIVITIES)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            title="Reset to factory defaults"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-100">Fixed camera false-positive guard</div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">Turn this on only for a camera that stays in one position. It pauses detections briefly when most of the image shifts together, which can prevent camera shake or movement from looking like people or objects.</p>
        </div>
        <button type="button" role="switch" aria-checked={sensitivities.fixedCameraGuard}
          onClick={() => onChange({ ...sensitivities, fixedCameraGuard: !sensitivities.fixedCameraGuard })}
          className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs font-bold transition ${sensitivities.fixedCameraGuard ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${sensitivities.fixedCameraGuard ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          {sensitivities.fixedCameraGuard ? 'ON · FIXED CAMERA' : 'OFF · MOVING CAMERA'}
        </button>
      </div>

      {/* Category Pills Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {CATEGORIES.map((cat) => {
          const setting = sensitivities[cat.key];
          const isSelected = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`p-3 rounded-xl border transition text-left flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-800 border-cyan-500/80 ring-1 ring-cyan-500/30 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                  {cat.icon}
                </div>
                <span
                  className={`w-2 h-2 rounded-full ${
                    setting?.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
              </div>
              <div className="font-mono text-xs font-bold truncate">{cat.label}</div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
                <span>{setting?.sensitivity}% SENS</span>
                <span
                  className="w-2.5 h-2.5 rounded-full border border-slate-700"
                  style={{ backgroundColor: setting?.highlightColor || cat.defaultColor }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Category Deep Tuning Panel */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-6">
        {/* Category Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 border border-slate-700 rounded-xl">
              {currentConfig.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white font-mono uppercase">
                  {currentConfig.label} Configuration
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-400 border border-slate-800">
                  CATEGORY: {currentConfig.key.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {currentConfig.description}
              </p>
            </div>
          </div>

          {/* Master Enable Toggle */}
          <button
            onClick={() =>
              handleUpdateCategory(selectedCategory, { enabled: !currentSetting.enabled })
            }
            className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition flex items-center gap-2 ${
              currentSetting.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{currentSetting.enabled ? 'CATEGORY ACTIVE' : 'DISABLED'}</span>
          </button>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-mono text-xs">
          {/* Slider 1: AI Detection Sensitivity */}
          <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold">DETECTION SENSITIVITY</span>
              <span className="text-cyan-400 font-bold text-sm">{currentSetting.sensitivity}%</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Higher values detect subtle motions and partially occluded subjects. Lower values ignore transient noise.
            </p>
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              value={currentSetting.sensitivity}
              onChange={(e) =>
                handleUpdateCategory(selectedCategory, { sensitivity: parseInt(e.target.value) })
              }
              className="w-full accent-cyan-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>10% (Strict Focus)</span>
              <span>50% (Balanced)</span>
              <span>100% (Ultra High-Sensitivity)</span>
            </div>
          </div>

          {/* Slider 2: Minimum Confidence Threshold */}
          <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold">MINIMUM CONFIDENCE TRIGGER</span>
              <span className="text-amber-400 font-bold text-sm">
                {(currentSetting.confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Subjects with neural confidence below this threshold will be silently filtered out.
            </p>
            <input
              type="range"
              min="0.30"
              max="0.95"
              step="0.05"
              value={currentSetting.confidenceThreshold}
              onChange={(e) =>
                handleUpdateCategory(selectedCategory, {
                  confidenceThreshold: parseFloat(e.target.value),
                })
              }
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-950 rounded-lg"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>30% (Catch All)</span>
              <span>65% (Recommended)</span>
              <span>95% (Zero Margin)</span>
            </div>
          </div>

          {/* Detection Zone Focus */}
          <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
            <span className="text-slate-300 font-bold block">MONITORED ZONE TARGETING</span>
            <p className="text-[10px] text-slate-400">
              Restrict detections to specific regions of the video field of view.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { id: 'full_frame', label: 'Full Frame' },
                { id: 'central_zone', label: 'Center Focus' },
                { id: 'perimeter_only', label: 'Perimeter Only' },
              ].map((zone) => (
                <button
                  key={zone.id}
                  onClick={() =>
                    handleUpdateCategory(selectedCategory, {
                      detectionZone: zone.id as CategorySensitivity['detectionZone'],
                    })
                  }
                  className={`py-2 px-2 rounded-lg font-mono text-[11px] border transition text-center ${
                    currentSetting.detectionZone === zone.id
                      ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {zone.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Highlight & Bounding Box Tone */}
          <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-2">
            <span className="text-slate-300 font-bold block">HUD BOUNDING BOX COLOR</span>
            <p className="text-[10px] text-slate-400">
              Select visual telemetry color for silhouettes and bounding brackets.
            </p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => handleUpdateCategory(selectedCategory, { highlightColor: col })}
                  className={`w-7 h-7 rounded-lg border transition ${
                    currentSetting.highlightColor === col
                      ? 'ring-2 ring-white scale-110'
                      : 'border-slate-700 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: col }}
                  title={col}
                />
              ))}
              <input
                type="color"
                value={currentSetting.highlightColor}
                onChange={(e) =>
                  handleUpdateCategory(selectedCategory, { highlightColor: e.target.value })
                }
                className="w-7 h-7 rounded-lg bg-transparent cursor-pointer border border-slate-700"
                title="Custom Color"
              />
            </div>
          </div>
        </div>

        {/* Action Triggers Checkboxes */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 mb-3 uppercase tracking-wider">
            AUTOMATIC INCIDENT RESPONSE WHEN {currentConfig.label.toUpperCase()} DETECTED:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:bg-slate-900">
              <input
                type="checkbox"
                checked={currentSetting.triggerAlert}
                onChange={(e) =>
                  handleUpdateCategory(selectedCategory, { triggerAlert: e.target.checked })
                }
                className="accent-cyan-500 rounded w-4 h-4"
              />
              <div>
                <span className="font-bold text-slate-200 block">Trigger HUD Banner Alert</span>
                <span className="text-[10px] text-slate-400">
                  Displays instant on-screen alert banner with bounding tracking coordinates
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 cursor-pointer hover:bg-slate-900">
              <input
                type="checkbox"
                checked={currentSetting.audibleChime}
                onChange={(e) =>
                  handleUpdateCategory(selectedCategory, { audibleChime: e.target.checked })
                }
                className="accent-purple-500 rounded w-4 h-4"
              />
              <div>
                <span className="font-bold text-slate-200 block">Play Audible Alert Chime</span>
                <span className="text-[10px] text-slate-400">
                  Emits selected acoustic tone when this entity enters monitored perimeter
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
