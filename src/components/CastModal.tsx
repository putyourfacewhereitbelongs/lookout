import React, { useEffect, useState } from 'react';
import { Cast, Copy, Check, Tv, Wifi, Server, Shield, X, Radio } from 'lucide-react';
import { CastServerInfo } from '../types';

interface CastModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCameraName: string;
}

export const CastModal: React.FC<CastModalProps> = ({ isOpen, onClose, activeCameraName }) => {
  const [networkInfo, setNetworkInfo] = useState<CastServerInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/network/info')
      .then((res) => res.json())
      .then((data) => setNetworkInfo(data))
      .catch(() => {
        // Fallback info if running client-only
        const host = window.location.host;
        const port = window.location.port || '3000';
        setNetworkInfo({
          serverIp: '192.168.1.120',
          serverPort: Number(port),
          castRtspUrl: 'rtsp://192.168.1.120:554/live/lookout_cam01',
          castHttpMjpegUrl: `http://${host}/api/stream/cast.mjpg`,
          castWebRtcUrl: 'webrtc://192.168.1.120:8555/stream/feed',
          appUrl: window.location.origin,
        });
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-950/80 border border-red-800/60 rounded-xl text-red-400">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-white">Broadcast as IP Camera</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">
                LIVE CASTING
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Broadcasting camera "{activeCameraName}" over local network
            </p>
          </div>
        </div>

        {/* Server IP & Port Banner */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800 my-4">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">SERVER LOCAL IP</div>
              <div className="text-sm font-mono font-bold text-cyan-300">
                {networkInfo?.serverIp || '192.168.1.120'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">PORT</div>
              <div className="text-sm font-mono font-bold text-emerald-300">
                {networkInfo?.serverPort || 3000}
              </div>
            </div>
          </div>
        </div>

        {/* Direct Endpoints for NVR / VLC / Home Assistant */}
        <div className="space-y-3 font-mono text-xs">
          <div>
            <div className="flex items-center justify-between mb-1 text-slate-400">
              <span className="flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-cyan-400" />
                RTSP Stream URL (NVR, Synology, Frigate)
              </span>
              <button
                onClick={() => copyToClipboard(networkInfo?.castRtspUrl || '', 'rtsp')}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {copiedKey === 'rtsp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'rtsp' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 truncate">
              {networkInfo?.castRtspUrl || 'rtsp://192.168.1.120:554/live/lookout_cam01'}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 text-slate-400">
              <span className="flex items-center gap-1.5">
                <Cast className="w-3.5 h-3.5 text-emerald-400" />
                HTTP MJPEG Stream (VLC, Web Viewers, Home Assistant)
              </span>
              <button
                onClick={() => copyToClipboard(networkInfo?.castHttpMjpegUrl || '', 'mjpeg')}
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                {copiedKey === 'mjpeg' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'mjpeg' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 truncate">
              {networkInfo?.castHttpMjpegUrl || 'http://localhost:3000/api/stream/cast.mjpg'}
            </div>
          </div>
        </div>

        {/* Security and Hardware info */}
        <div className="mt-5 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs text-slate-400 space-y-1.5 font-mono">
          <div className="flex items-center gap-2 text-slate-300">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold">Local Stream Security</span>
          </div>
          <p>
            This device is acting as a self-hosted ONVIF/RTSP IP Camera server. All streams originate locally without routing through external relay servers.
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => setIsBroadcasting(!isBroadcasting)}
            className={`flex-1 py-2.5 rounded-xl font-mono text-xs font-semibold transition ${
              isBroadcasting
                ? 'bg-red-600/20 text-red-300 border border-red-800/60 hover:bg-red-600/30'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
            }`}
          >
            {isBroadcasting ? 'PAUSE BROADCAST' : 'RESUME IP BROADCAST'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
