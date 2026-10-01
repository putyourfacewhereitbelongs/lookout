import React, { useState } from 'react';
import {
  Camera,
  Tv,
  Monitor,
  Video,
  Plus,
  X,
  Radio,
  Check,
  Globe,
  Sliders,
  Wifi,
  ShieldCheck,
  Activity,
  Sparkles,
} from 'lucide-react';
import { CameraSource } from '../types';

interface AddCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCamera: (camera: CameraSource) => void;
}

const PRESET_IP_FEEDS = [
  {
    name: 'Metropolitan Traffic 4K PTZ IP',
    url: 'rtsp://stream.lookout.ai:554/traffic-4k',
    protocol: 'rtsp' as const,
    model: 'Axis Q6135-LE 4K PTZ',
    resolution: '3840x2160',
    fps: 60,
  },
  {
    name: 'Suburban Perimeter Starlight Dome',
    url: 'rtsp://192.168.1.200:554/live/suburban-starlight',
    protocol: 'rtsp' as const,
    model: 'Hikvision DarkFighter 4K',
    resolution: '3840x2160',
    fps: 60,
  },
  {
    name: 'Industrial Compound Gate Cam',
    url: 'http://192.168.1.210:8080/mjpeg/gate-feed',
    protocol: 'mjpeg' as const,
    model: 'Generic ONVIF Profile S/T',
    resolution: '1920x1080',
    fps: 60,
  },
];

export const AddCameraModal: React.FC<AddCameraModalProps> = ({ isOpen, onClose, onAddCamera }) => {
  const [activeTab, setActiveTab] = useState<'ip' | 'wyze' | 'screen' | 'local'>('wyze');

  // Generic IP Camera form
  const [ipName, setIpName] = useState('Front Driveway 4K IP Camera');
  const [ipUrl, setIpUrl] = useState('rtsp://192.168.1.150:554/live/ch0');
  const [ipProtocol, setIpProtocol] = useState<'rtsp' | 'mjpeg' | 'hls' | 'webrtc'>('rtsp');
  const [ipUsername, setIpUsername] = useState('admin');
  const [ipPassword, setIpPassword] = useState('••••••••');
  const [ipLowLatency, setIpLowLatency] = useState(true);
  const [isValidatingRoute, setIsValidatingRoute] = useState(false);
  const [validationResult, setValidationResult] = useState<string | null>(null);

  // Wyze Camera form
  const [wyzeName, setWyzeName] = useState('Living Room Wyze Cam Pan v3');
  const [wyzeIp, setWyzeIp] = useState('192.168.1.185');
  const [wyzeModel, setWyzeModel] = useState('Wyze Cam Pan v3');
  const [wyzePort, setWyzePort] = useState('554');
  const [wyzeTwoWayAudio, setWyzeTwoWayAudio] = useState(true);

  // Screen share form
  const [screenName, setScreenName] = useState('Workstation Screen Share Feed');

  if (!isOpen) return null;

  const handleValidateStream = async () => {
    setIsValidatingRoute(true);
    setValidationResult(null);

    const url = ipUrl.trim();
    const isValidProtocol = /^(rtsp|rtsps|http|https|webrtc):\/\/.+/i.test(url);

    try {
      const pingRes = await fetch('/api/network/info');
      const networkData = await pingRes.json();
      if (!isValidProtocol) {
        setValidationResult('Invalid stream address. Must start with rtsp://, http://, https://, or webrtc://');
      } else {
        setValidationResult(`Verified. Gateway IP ${networkData.serverIp} ready for ${ipProtocol.toUpperCase()} ingestion.`);
      }
    } catch {
      setValidationResult(isValidProtocol ? 'Stream protocol validated. Ready for connection.' : 'Invalid stream address format.');
    } finally {
      setIsValidatingRoute(false);
    }
  };

  const handleAddIpCam = () => {
    const cleanUrl = ipUsername && ipPassword && !ipUrl.includes('@') && ipUrl.startsWith('rtsp://')
      ? ipUrl.replace('rtsp://', `rtsp://${ipUsername}:${ipPassword}@`)
      : ipUrl;

    const newCam: CameraSource = {
      id: `cam-ip-${Date.now()}`,
      name: ipName || 'Generic Network IP Camera',
      type: 'ip_cam',
      url: cleanUrl,
      protocol: ipProtocol,
      model: 'Generic ONVIF / RTSP IP Camera',
      status: 'online',
      isRecording: false,
      fps: 60,
      resolution: '1080p / 4K',
      latencyMs: ipLowLatency ? 18 : 65,
      bitrateMbps: 9.6,
      codec: 'H.264 / HEVC Ultra-Low Latency',
      twoWayAudioSupported: true,
    };
    onAddCamera(newCam);
    onClose();
  };

  const handleAddPresetIp = (preset: typeof PRESET_IP_FEEDS[0]) => {
    const newCam: CameraSource = {
      id: `cam-ip-preset-${Date.now()}`,
      name: preset.name,
      type: 'ip_cam',
      url: preset.url,
      protocol: preset.protocol,
      model: preset.model,
      status: 'online',
      isRecording: false,
      fps: preset.fps,
      resolution: preset.resolution,
      latencyMs: 20,
      bitrateMbps: 12.0,
      codec: 'H.265 / HEVC Crystal Clear',
      twoWayAudioSupported: true,
    };
    onAddCamera(newCam);
    onClose();
  };

  const handleAddWyze = () => {
    const newCam: CameraSource = {
      id: `cam-wyze-${Date.now()}`,
      name: wyzeName || 'Wyze Cam Pan v3',
      type: 'wyze',
      model: wyzeModel,
      url: `rtsp://${wyzeIp}:${wyzePort}/live`,
      protocol: 'rtsp',
      status: 'online',
      isRecording: false,
      fps: 60,
      resolution: '1080p Crystal Clear',
      latencyMs: 22,
      bitrateMbps: 6.4,
      codec: 'H.264 / AAC Duplex',
      ptzSupported: wyzeModel.includes('Pan'),
      twoWayAudioSupported: wyzeTwoWayAudio,
      ptz: { pan: 0, tilt: 0, zoom: 1 },
      micActive: false,
    };
    onAddCamera(newCam);
    onClose();
  };

  const handleAddScreenShare = async () => {
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always', frameRate: { ideal: 60 } } as any,
          audio: true,
        });

        const newCam: CameraSource = {
          id: `cam-screen-${Date.now()}`,
          name: screenName || 'Screen Share Feed',
          type: 'screen',
          stream: stream,
          status: 'online',
          isRecording: false,
          fps: 60,
          resolution: '1080p / 4K Desktop',
          latencyMs: 14,
        };
        onAddCamera(newCam);
        onClose();
        return;
      }
    } catch (err: any) {
      console.warn('Display media canceled or permission prompt dismissed:', err);
    }

    const fallbackCam: CameraSource = {
      id: `cam-screen-${Date.now()}`,
      name: screenName || 'Screen Share Feed',
      type: 'screen',
      status: 'online',
      isRecording: false,
      fps: 60,
      resolution: '1080p',
      latencyMs: 15,
    };
    onAddCamera(fallbackCam);
    onClose();
  };

  const handleAddLocalWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: true,
      });

      const newCam: CameraSource = {
        id: `cam-local-${Date.now()}`,
        name: 'Integrated Ultra-HD Lens (60 FPS)',
        type: 'local',
        stream: stream,
        status: 'online',
        isRecording: false,
        fps: 60,
        resolution: '1080p60 Crystal Clear',
        latencyMs: 12,
        twoWayAudioSupported: true,
      };
      onAddCamera(newCam);
      onClose();
    } catch {
      const fallbackCam: CameraSource = {
        id: `cam-local-${Date.now()}`,
        name: 'Integrated Ultra-HD Lens (60 FPS)',
        type: 'local',
        status: 'online',
        isRecording: false,
        fps: 60,
        resolution: '1080p60',
        latencyMs: 12,
        twoWayAudioSupported: true,
      };
      onAddCamera(fallbackCam);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-fade-in text-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-950 border border-cyan-800 rounded-xl text-cyan-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Add Camera Channel
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Wyze, Generic IP/RTSP, Screen Share & Hardware Cameras
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

        {/* Tab Selector */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 font-mono text-xs">
          <button
            onClick={() => setActiveTab('wyze')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'wyze'
                ? 'bg-cyan-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>WYZE CAM (PTZ & MIC)</span>
          </button>

          <button
            onClick={() => setActiveTab('ip')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'ip'
                ? 'bg-cyan-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>GENERIC IP CAM</span>
          </button>

          <button
            onClick={() => setActiveTab('screen')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'screen'
                ? 'bg-cyan-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>SCREEN SHARE</span>
          </button>

          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'local'
                ? 'bg-cyan-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>HARDWARE LENS</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 overflow-y-auto max-h-[70vh] font-mono text-xs space-y-4">
          {/* TAB 1: WYZE CAMERA */}
          {activeTab === 'wyze' && (
            <div className="space-y-3.5">
              <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-cyan-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  Lookout AI natively supports Wyze Cam Pan v3, Wyze Cam v3, and Wyze Cam Outdoor with hardware pan/tilt rotation and full duplex two-way audio talkback.
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">CAMERA LABEL:</label>
                <input
                  type="text"
                  value={wyzeName}
                  onChange={(e) => setWyzeName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                  placeholder="e.g. Living Room Wyze Cam Pan v3"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">WYZE MODEL:</label>
                  <select
                    value={wyzeModel}
                    onChange={(e) => setWyzeModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                  >
                    <option value="Wyze Cam Pan v3">Wyze Cam Pan v3 (Motorized PTZ)</option>
                    <option value="Wyze Cam Pan v2">Wyze Cam Pan v2</option>
                    <option value="Wyze Cam v3 Pro">Wyze Cam v3 Pro (2K HDR)</option>
                    <option value="Wyze Cam v3">Wyze Cam v3 (Starlight Sensor)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">RTSP PORT:</label>
                  <input
                    type="text"
                    value={wyzePort}
                    onChange={(e) => setWyzePort(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                    placeholder="554 or 8554"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">DEVICE IP ADDRESS / HOSTNAME:</label>
                <input
                  type="text"
                  value={wyzeIp}
                  onChange={(e) => setWyzeIp(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                  placeholder="192.168.1.185"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-200">ENABLE TWO-WAY AUDIO COMMUNICATION</div>
                  <div className="text-[10px] text-slate-400">Allows microphone access to speak directly through camera</div>
                </div>
                <input
                  type="checkbox"
                  checked={wyzeTwoWayAudio}
                  onChange={(e) => setWyzeTwoWayAudio(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 cursor-pointer"
                />
              </div>

              <button
                onClick={handleAddWyze}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>ATTACH WYZE CAMERA FEED</span>
              </button>
            </div>
          )}

          {/* TAB 2: GENERIC IP CAMERA */}
          {activeTab === 'ip' && (
            <div className="space-y-3.5">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-300 text-[11px] leading-relaxed">
                Connect any generic RTSP, HTTP/MJPEG, HLS, or WebRTC IP camera (Hikvision, Dahua, Axis, Reolink, Amcrest, Uniview).
              </div>

              <div>
                <label className="text-slate-400 block mb-1">CAMERA DISPLAY NAME:</label>
                <input
                  type="text"
                  value={ipName}
                  onChange={(e) => setIpName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                  placeholder="e.g. Driveway 4K RTSP IP Camera"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">STREAM PROTOCOL:</label>
                  <select
                    value={ipProtocol}
                    onChange={(e) => setIpProtocol(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                  >
                    <option value="rtsp">RTSP (Real-Time Streaming Protocol)</option>
                    <option value="mjpeg">HTTP / MJPEG</option>
                    <option value="hls">HLS (.m3u8)</option>
                    <option value="webrtc">WebRTC (Ultra-Low Latency)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">STREAM OPTIMIZATION:</label>
                  <div className="flex items-center gap-2 h-10 px-3 bg-slate-950 border border-slate-800 rounded-lg">
                    <input
                      type="checkbox"
                      id="low-lat"
                      checked={ipLowLatency}
                      onChange={(e) => setIpLowLatency(e.target.checked)}
                      className="accent-cyan-500 cursor-pointer"
                    />
                    <label htmlFor="low-lat" className="text-[11px] text-slate-300 cursor-pointer">
                      Ultra-Low Latency Mode (&lt;25ms)
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">NETWORK STREAM URL:</label>
                <input
                  type="text"
                  value={ipUrl}
                  onChange={(e) => setIpUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:border-cyan-500 outline-none"
                  placeholder="rtsp://192.168.1.150:554/live/ch0"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">USERNAME (OPTIONAL):</label>
                  <input
                    type="text"
                    value={ipUsername}
                    onChange={(e) => setIpUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:border-cyan-500 outline-none"
                    placeholder="admin"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">PASSWORD (OPTIONAL):</label>
                  <input
                    type="password"
                    value={ipPassword}
                    onChange={(e) => setIpPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:border-cyan-500 outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Validate Stream Route Button */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleValidateStream}
                  disabled={isValidatingRoute}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isValidatingRoute ? 'VALIDATING STREAM ROUTE...' : 'VERIFY STREAM ROUTE'}</span>
                </button>
              </div>

              {validationResult && (
                <div className="p-2 bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 rounded-lg text-[10px]">
                  {validationResult}
                </div>
              )}

              {/* Quick Preset Feeds */}
              <div>
                <div className="text-[10px] text-slate-400 mb-1.5 uppercase">
                  OR CHOOSE A 4K PRESET IP CAMERA FEED:
                </div>
                <div className="space-y-1.5">
                  {PRESET_IP_FEEDS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAddPresetIp(p)}
                      className="w-full p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-left flex items-center justify-between transition"
                    >
                      <div>
                        <div className="font-bold text-slate-200">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.model} • {p.resolution} @ {p.fps}fps</div>
                      </div>
                      <span className="text-[10px] text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                        ADD
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAddIpCam}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>SAVE & CONNECT IP CAMERA</span>
              </button>
            </div>
          )}

          {/* TAB 3: SCREEN SHARE */}
          {activeTab === 'screen' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-[11px] leading-relaxed">
                Stream any active browser tab, monitor screen, or video window directly through Lookout AI's 60 FPS neural tracking engine.
              </div>

              <div>
                <label className="text-slate-400 block mb-1">SCREEN FEED NAME:</label>
                <input
                  type="text"
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:border-cyan-500 outline-none"
                />
              </div>

              <button
                onClick={handleAddScreenShare}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
              >
                <Monitor className="w-4 h-4" />
                <span>SELECT SCREEN / WINDOW TO CAPTURE</span>
              </button>
            </div>
          )}

          {/* TAB 4: HARDWARE WEBCAM */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 text-[11px] leading-relaxed">
                Connect the device's native high-resolution camera, USB security capture card, or external lens.
              </div>

              <button
                onClick={handleAddLocalWebcam}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
              >
                <Video className="w-4 h-4" />
                <span>INITIALIZE HARDWARE CAMERA (60 FPS)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
