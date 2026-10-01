import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Mic,
  MicOff,
  Volume2,
  Bell,
  Compass,
  Radio,
  Sliders,
  Send,
  Wifi,
  ShieldAlert,
  Disc,
} from 'lucide-react';
import { CameraSource } from '../types';
import { audioEngine } from '../services/audioEngine';

interface WyzeControlsProps {
  camera: CameraSource;
  onPtzChange: (pan: number, tilt: number, zoom: number) => void;
  onMicToggle: (active: boolean) => void;
  onTriggerSiren: () => void;
}

const PRESET_LOCATIONS = [
  { name: 'FRONT PORCH', pan: -45, tilt: 10, zoom: 1.5 },
  { name: 'DRIVEWAY', pan: 40, tilt: -10, zoom: 2.0 },
  { name: 'PERIMETER', pan: 0, tilt: 0, zoom: 1.0 },
  { name: 'BACKYARD GATE', pan: -90, tilt: 5, zoom: 1.8 },
  { name: 'ENTRANCE FOYER', pan: 75, tilt: -15, zoom: 1.2 },
  { name: 'MAILBOX / CURB', pan: -20, tilt: -25, zoom: 3.0 },
];

const QUICK_TALK_PHRASES = [
  'Security Alert: You are on a live monitored camera.',
  'Hello! Please leave the package on the front porch.',
  'Can I help you? I am speaking through the camera.',
  'Please step back from the property perimeter.',
];

export const WyzeControls: React.FC<WyzeControlsProps> = ({
  camera,
  onPtzChange,
  onMicToggle,
  onTriggerSiren,
}) => {
  const pan = camera.ptz?.pan || 0;
  const tilt = camera.ptz?.tilt || 0;
  const zoom = camera.ptz?.zoom || 1;
  const isMicActive = camera.micActive || false;

  const [isPatrolling, setIsPatrolling] = useState(false);
  const [stepSize, setStepSize] = useState<number>(15);
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);
  const [selectedPhrase, setSelectedPhrase] = useState<string>('');
  const [lastTransmittedPhrase, setLastTransmittedPhrase] = useState<string | null>(null);

  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-patrol loop
  useEffect(() => {
    if (!isPatrolling) return;
    let direction = 1;
    const interval = setInterval(() => {
      const currentPan = camera.ptz?.pan || 0;
      let nextPan = currentPan + direction * 20;
      if (nextPan >= 120) {
        nextPan = 120;
        direction = -1;
      } else if (nextPan <= -120) {
        nextPan = -120;
        direction = 1;
      }
      onPtzChange(nextPan, camera.ptz?.tilt || 0, camera.ptz?.zoom || 1);
    }, 2000);

    return () => clearInterval(interval);
  }, [isPatrolling, camera.ptz, onPtzChange]);

  // Real microphone stream acquisition and VU meter monitoring
  useEffect(() => {
    if (isMicActive) {
      const startMic = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          audioStreamRef.current = stream;

          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const buffer = new Uint8Array(analyser.frequencyBinCount);
          const updateVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) {
              sum += buffer[i];
            }
            const avg = sum / buffer.length;
            setMicVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animationFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        } catch (err) {
          console.warn('Microphone access for Wyze talkback denied or not supported:', err);
          setMicVolumeLevel(0);
        }
      };

      startMic();
    } else {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setMicVolumeLevel(0);
    }

    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isMicActive]);

  const handlePanTilt = (deltaPan: number, deltaTilt: number) => {
    const newPan = Math.max(-180, Math.min(180, pan + deltaPan));
    const newTilt = Math.max(-90, Math.min(90, tilt + deltaTilt));
    onPtzChange(newPan, newTilt, zoom);
  };

  const handleZoom = (deltaZoom: number) => {
    const newZoom = Math.max(1, Math.min(8, Number((zoom + deltaZoom).toFixed(1))));
    onPtzChange(pan, tilt, newZoom);
  };

  const handleReset = () => {
    onPtzChange(0, 0, 1);
  };

  const handleTransmitPhrase = (phrase: string) => {
    setLastTransmittedPhrase(phrase);
    audioEngine.speakSceneDescription(phrase);
    setTimeout(() => setLastTransmittedPhrase(null), 5000);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-slate-100 shadow-xl backdrop-blur-sm">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" />
            WYZE CAM v3 PRO // PTZ & TWO-WAY AUDIO DUPLEX
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
            PAN: {pan}° | TILT: {tilt}° | ZOOM: {zoom.toFixed(1)}x
          </span>
          <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
            RTSP 554 • 24ms LATENCY
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 items-start">
        {/* Column 1: Pan / Tilt Directional Controller */}
        <div className="flex flex-col items-center justify-center p-3 bg-slate-950/80 rounded-xl border border-slate-800/80">
          <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1">
              <Compass className="w-3 h-3 text-cyan-400" />
              PAN / TILT HEAD
            </span>
            {/* Step size selector */}
            <div className="flex items-center gap-1">
              <span>STEP:</span>
              {[5, 15, 45].map((s) => (
                <button
                  key={s}
                  onClick={() => setStepSize(s)}
                  className={`px-1.5 py-0.5 rounded ${
                    stepSize === s ? 'bg-cyan-600 text-white font-bold' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {s}°
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-32 h-32 flex items-center justify-center my-1">
            {/* Up */}
            <button
              onClick={() => handlePanTilt(0, stepSize)}
              className="absolute top-0 p-2.5 bg-slate-800 hover:bg-cyan-600 active:bg-cyan-700 text-slate-200 rounded-lg transition shadow-md"
              title={`Tilt Up ${stepSize}°`}
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            {/* Left */}
            <button
              onClick={() => handlePanTilt(-stepSize, 0)}
              className="absolute left-0 p-2.5 bg-slate-800 hover:bg-cyan-600 active:bg-cyan-700 text-slate-200 rounded-lg transition shadow-md"
              title={`Pan Left ${stepSize}°`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Center Recenter */}
            <button
              onClick={handleReset}
              className="p-3 bg-slate-900 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-300 rounded-full transition shadow-inner"
              title="Recenter to 0°, 0°"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Right */}
            <button
              onClick={() => handlePanTilt(stepSize, 0)}
              className="absolute right-0 p-2.5 bg-slate-800 hover:bg-cyan-600 active:bg-cyan-700 text-slate-200 rounded-lg transition shadow-md"
              title={`Pan Right ${stepSize}°`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Down */}
            <button
              onClick={() => handlePanTilt(0, -stepSize)}
              className="absolute bottom-0 p-2.5 bg-slate-800 hover:bg-cyan-600 active:bg-cyan-700 text-slate-200 rounded-lg transition shadow-md"
              title={`Tilt Down ${stepSize}°`}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Patrol / Auto Scan Toggle */}
          <div className="w-full mt-2 flex items-center justify-between gap-2">
            <button
              onClick={() => setIsPatrolling(!isPatrolling)}
              className={`flex-1 py-1.5 px-2 border rounded-lg font-mono text-[10px] font-bold flex items-center justify-center gap-1.5 transition ${
                isPatrolling
                  ? 'bg-amber-950 border-amber-500 text-amber-300 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Radio className="w-3 h-3" />
              {isPatrolling ? 'PATROLLING ACTIVE' : 'START AUTO-PATROL'}
            </button>
          </div>
        </div>

        {/* Column 2: Digital Zoom & Preset Locations */}
        <div className="space-y-3">
          {/* Zoom Slider / Controls */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1.5">
              <span>OPTICAL / DIGITAL ZOOM</span>
              <span className="text-cyan-400 font-bold">{zoom.toFixed(1)}x / 8.0x</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleZoom(-0.5)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <input
                type="range"
                min="1.0"
                max="8.0"
                step="0.1"
                value={zoom}
                onChange={(e) => onPtzChange(pan, tilt, parseFloat(e.target.value))}
                className="flex-1 accent-cyan-500 cursor-pointer"
              />
              <button
                onClick={() => handleZoom(0.5)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 transition"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Fast Preset Locations */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
            <div className="text-[10px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
              GUARD POSITION PRESETS
            </div>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
              {PRESET_LOCATIONS.map((loc) => (
                <button
                  key={loc.name}
                  onClick={() => onPtzChange(loc.pan, loc.tilt, loc.zoom)}
                  className="p-1.5 bg-slate-800/90 hover:bg-slate-700 rounded text-slate-300 hover:text-cyan-300 text-left truncate transition flex items-center justify-between"
                >
                  <span>{loc.name}</span>
                  <span className="text-[8px] text-slate-500">{loc.zoom}x</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Column 3: Microphone Access for Two-Way Audio Communication & Sirens */}
        <div className="space-y-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1 font-bold">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              TWO-WAY AUDIO DUPLEX
            </span>
            <span className={isMicActive ? 'text-red-400 animate-pulse font-bold' : 'text-slate-500'}>
              {isMicActive ? 'LIVE MIC ON' : 'MUTED'}
            </span>
          </div>

          {/* Master Push-To-Talk Button */}
          <button
            onClick={() => onMicToggle(!isMicActive)}
            className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 font-mono text-xs font-bold transition shadow-lg ${
              isMicActive
                ? 'bg-red-600 hover:bg-red-500 text-white ring-4 ring-red-500/30 animate-pulse'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isMicActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            <span>{isMicActive ? 'TRANSMITTING AUDIO TO WYZE...' : 'PUSH TO TALK OVER CAMERA'}</span>
          </button>

          {/* Real-time Voice Audio Meter */}
          {isMicActive && (
            <div className="p-2 bg-slate-900 rounded-lg border border-red-900/60">
              <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                <span>INPUT LEVEL:</span>
                <span className="text-red-400 font-bold">{micVolumeLevel}%</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-75"
                  style={{ width: `${micVolumeLevel}%` }}
                />
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-mono text-center">
                Speaking live through Wyze speaker (16kHz Full Duplex)
              </div>
            </div>
          )}

          {/* Quick Audio Intercom Broadcast Presets */}
          <div>
            <div className="text-[10px] font-mono text-slate-400 mb-1.5">QUICK INTERCOM TALKBACK:</div>
            <div className="space-y-1">
              {QUICK_TALK_PHRASES.map((phrase, idx) => (
                <button
                  key={idx}
                  onClick={() => handleTransmitPhrase(phrase)}
                  className="w-full p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded text-[10px] font-mono text-left truncate flex items-center justify-between transition"
                >
                  <span className="truncate">{phrase}</span>
                  <Send className="w-3 h-3 text-cyan-400 shrink-0 ml-1" />
                </button>
              ))}
            </div>
          </div>

          {lastTransmittedPhrase && (
            <div className="p-1.5 bg-cyan-950/60 border border-cyan-800 text-cyan-300 rounded text-[10px] font-mono text-center">
              Transmitted: "{lastTransmittedPhrase}"
            </div>
          )}

          {/* Emergency Siren Alert */}
          <button
            onClick={onTriggerSiren}
            className="w-full py-2 px-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 rounded-lg text-red-300 font-mono text-xs flex items-center justify-center gap-2 transition"
          >
            <Bell className="w-4 h-4 text-red-400" />
            <span>TRIGGER WYZE SIREN ALARM (95dB)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
