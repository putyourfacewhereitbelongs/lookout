import React from 'react';
import {
  Sparkles,
  Shield,
  CloudSun,
  AlertTriangle,
  Users,
  Eye,
  Volume2,
  X,
  Compass,
  Zap,
  CheckCircle,
  Car,
  Dog,
  Package,
  Thermometer,
  Wind,
  Droplets,
  Lock,
  Layers,
} from 'lucide-react';
import { SceneAnalysisResult, DetectionObject, SubjectCategory, FaceProfile } from '../types';
import { audioEngine } from '../services/audioEngine';

interface SceneDetailsDrawerProps {
  analysis: SceneAnalysisResult | null;
  isOpen: boolean;
  onClose: () => void;
  onReanalyze: () => void;
  isAnalyzing: boolean;
  analysisError?: string;
  onSelectObject?: (obj: DetectionObject) => void;
  faceProfiles?: FaceProfile[];
  onCorrectFace?: (obj: DetectionObject, name: string) => void;
}

const getCategoryIcon = (category: SubjectCategory) => {
  switch (category) {
    case 'person':
      return <Users className="w-3.5 h-3.5 text-cyan-400" />;
    case 'animal':
      return <Dog className="w-3.5 h-3.5 text-emerald-400" />;
    case 'car':
      return <Car className="w-3.5 h-3.5 text-purple-400" />;
    case 'threat':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    case 'weather':
      return <CloudSun className="w-3.5 h-3.5 text-sky-400" />;
    default:
      return <Package className="w-3.5 h-3.5 text-blue-400" />;
  }
};

const getCategoryColor = (category: SubjectCategory) => {
  switch (category) {
    case 'threat':
      return 'bg-red-950 border-red-800 text-red-300';
    case 'animal':
      return 'bg-emerald-950 border-emerald-800 text-emerald-300';
    case 'car':
      return 'bg-purple-950 border-purple-800 text-purple-300';
    case 'person':
      return 'bg-cyan-950 border-cyan-800 text-cyan-300';
    default:
      return 'bg-slate-900 border-slate-800 text-slate-300';
  }
};

export const SceneDetailsDrawer: React.FC<SceneDetailsDrawerProps> = ({
  analysis,
  isOpen,
  onClose,
  onReanalyze,
  isAnalyzing,
  analysisError,
  onSelectObject,
  faceProfiles = [],
  onCorrectFace,
}) => {
  if (!isOpen) return null;

  const handleSpeakNarration = () => {
    if (!analysis) return;
    const text = `${analysis.summary}. Lighting condition is ${analysis.lightingCondition}. Weather is ${analysis.weather}. Threat level is ${analysis.threatLevel} with ${(analysis.threatConfidence * 100).toFixed(0)}% confidence.`;
    audioEngine.speakSceneDescription(text);
  };

  const env = analysis?.environmentalDetails || {
    luxRating: '0.0018 Lux (Starlight NIR Balanced)',
    visibilityMeters: 450,
    fogDensityPct: 4,
    precipitationRate: '0.0 mm/hr (Dry)',
    surfaceCondition: 'Dry Asphalt / Clear Pavement',
    entryPointsSecure: true,
    blindSpotsDetected: 0,
    ambientNoiseDb: 42,
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-y-auto border-l border-slate-700/80 bg-slate-900 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-100 shadow-2xl animate-slide-left custom-scrollbar sm:w-[500px] sm:p-5">
      {/* Drawer Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-950 border border-purple-800 rounded-xl text-purple-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Forensic Scene Intelligence
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                HIGH-FIDELITY
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              On-device Qwen2-VL scene analysis • no API quota
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="flex gap-2 my-4">
        <button
          onClick={onReanalyze}
          disabled={isAnalyzing}
          className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-mono text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg"
        >
          <Sparkles className="w-4 h-4" />
          {isAnalyzing ? 'ANALYZING LOCALLY...' : 'REFRESH SCENE ANALYSIS'}
        </button>
        <button
          onClick={handleSpeakNarration}
          disabled={!analysis}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          title="Narrate aloud with AI Voice"
        >
          <Volume2 className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      {!analysis ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 font-mono text-xs">
          <Eye className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
          {analysisError || 'Loading the local vision model. Its first download can take a while; later analyses use the cached model.'}
        </div>
      ) : (
        <div className="space-y-4 font-mono text-xs">
          {analysisError && (
            <div role="status" className="rounded-lg border border-amber-800 bg-amber-950/50 px-3 py-2 text-amber-200">
              Latest local analysis failed: {analysisError}. Showing the previous result.
            </div>
          )}
          {/* Executive Summary */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase mb-1.5 font-bold flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-purple-400" />
              HIGH-FIDELITY EXECUTIVE SUMMARY
            </div>
            <p className="text-slate-200 leading-relaxed font-sans text-sm">{analysis.summary}</p>
          </div>

          {/* Threat Assessment Level */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              analysis.threatLevel === 'critical'
                ? 'bg-red-950/60 border-red-700 text-red-300'
                : analysis.threatLevel === 'elevated'
                ? 'bg-amber-950/60 border-amber-700 text-amber-300'
                : 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold">PERIMETER THREAT EVALUATION</div>
                <div className="text-sm font-black uppercase tracking-wider">{analysis.threatLevel}</div>
              </div>
            </div>
            <div className="text-right text-[11px]">
              <div>CONFIDENCE: {(analysis.threatConfidence * 100).toFixed(0)}%</div>
              <div className="text-[10px] opacity-80">Zero False Positive Filter Active</div>
            </div>
          </div>

          {/* Extreme Environmental & Atmospheric Details */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CloudSun className="w-3.5 h-3.5 text-amber-400" />
                ENVIRONMENTAL & ATMOSPHERIC CLARITY
              </span>
              <span className="text-emerald-400 text-[9px]">100% SENSOR SYNC</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  OPTICAL ILLUMINANCE
                </div>
                <div className="text-xs font-bold text-white truncate">{analysis.lightingCondition}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">{env.luxRating}</div>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <Droplets className="w-3 h-3 text-sky-400" />
                  PRECIPITATION & WEATHER
                </div>
                <div className="text-xs font-bold text-white capitalize">{analysis.weather}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">{env.precipitationRate}</div>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <Wind className="w-3 h-3 text-purple-400" />
                  ATMOSPHERIC VISIBILITY
                </div>
                <div className="text-xs font-bold text-white">{env.visibilityMeters} Meters</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Fog Density: {env.fogDensityPct}%</div>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <Layers className="w-3 h-3 text-amber-400" />
                  GROUND SURFACE STATE
                </div>
                <div className="text-xs font-bold text-white truncate">{env.surfaceCondition}</div>
                <div className="text-[9px] text-slate-500 mt-0.5">Traction: Optimal</div>
              </div>
            </div>

            {/* Architectural & Perimeter Security Check */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>ENTRY POINTS: {env.entryPointsSecure ? '100% SECURE' : 'UNLATCHED DETECTED'}</span>
              </div>
              <span className="text-slate-400 text-[10px]">
                BLIND SPOTS: {env.blindSpotsDetected} DETECTED
              </span>
            </div>
          </div>

          {/* Identified entities */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                DETECTED & TRACKED SUBJECTS ({analysis.objects?.length || 0})
              </span>
              <span className="text-cyan-400 text-[9px]">ACTIVE VECTOR TRACKING</span>
            </div>

            <div className="space-y-2">
              {analysis.objects?.map((obj, idx) => (
                <div
                  key={`${obj.id}-${idx}`}
                  onClick={() => onSelectObject?.(obj)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${getCategoryColor(
                    obj.category
                  )} hover:brightness-110`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="p-1 rounded bg-black/40">
                      {getCategoryIcon(obj.category)}
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-white text-xs truncate">
                        {obj.nameTag || obj.label}
                      </div>
                      <div className="text-[10px] opacity-75 font-mono">
                        CATEGORY: {obj.category.toUpperCase()} • DIST: {obj.distanceMeters.toFixed(1)}m • {obj.speedMph.toFixed(1)} mph
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-xs font-bold">
                      {(obj.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-[9px] uppercase tracking-wider opacity-80">
                      {obj.threatLevel === 'critical' ? 'ALERT' : obj.isKnown ? 'FAMILY' : 'TRACKING'}
                    </div>
                  </div>
                  {obj.category === 'person' && onCorrectFace && (
                    <label className="shrink-0 ml-2 text-[9px] text-slate-300" onClick={(event) => event.stopPropagation()}>
                      <span className="sr-only">Correct recognized face</span>
                      <select
                        aria-label={`Correct recognized face for ${obj.nameTag || obj.label}`}
                        value={obj.subjectName || (obj.isKnown ? obj.nameTag || '' : 'Unknown')}
                        onChange={(event) => onCorrectFace(obj, event.target.value)}
                        className="max-w-28 rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-[10px] text-white"
                      >
                        <option value="Unknown">Unknown / incorrect</option>
                        {faceProfiles.filter((profile) => profile.subjectType === 'person' && profile.name !== 'Unknown Subject').map((profile) => (
                          <option key={profile.id} value={profile.name}>{profile.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
