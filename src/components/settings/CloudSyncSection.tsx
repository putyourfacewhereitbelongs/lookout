import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle,
  RefreshCw,
  Lock,
  Radio,
  Clock,
  Shield,
  UploadCloud,
  DownloadCloud,
  Server,
  Zap,
} from 'lucide-react';
import { CloudSyncSettings } from '../../types';
import { StorageService } from '../../services/db';

interface CloudSyncSectionProps {
  settings: CloudSyncSettings;
  onChange: (s: CloudSyncSettings) => void;
}

export const CloudSyncSection: React.FC<CloudSyncSectionProps> = ({
  settings,
  onChange,
}) => {
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const handleForcePush = async () => {
    setIsPushing(true);
    setSyncStatusMsg('Encrypting state & transmitting to sync node...');
    const fullState = {
      faces: StorageService.getFaceProfiles(),
      contacts: StorageService.getEmergencyContacts(),
      settings: StorageService.getSavedSettings(),
      timestamp: Date.now(),
    };
    const ok = await StorageService.pushToCloudSync(fullState);
    setIsPushing(false);
    if (ok) {
      onChange({ ...settings, lastSyncTime: Date.now() });
      setSyncStatusMsg('Push Complete: Encrypted snapshot propagated to cloud node.');
    } else {
      setSyncStatusMsg('Offline: Sync queued locally in background sync queue.');
    }
    setTimeout(() => setSyncStatusMsg(null), 3500);
  };

  const handleForcePull = async () => {
    setIsPulling(true);
    setSyncStatusMsg('Contacting cloud sync station for updates...');
    const remote = await StorageService.pullFromCloudSync();
    setIsPulling(false);
    if (remote) {
      if (remote.faces) StorageService.saveFaceProfiles(remote.faces);
      if (remote.contacts) StorageService.saveEmergencyContacts(remote.contacts);
      if (remote.settings) StorageService.saveSettings(remote.settings);
      onChange({ ...settings, lastSyncTime: Date.now() });
      setSyncStatusMsg('Pull Complete: System calibrated with latest cloud station snapshot.');
    } else {
      setSyncStatusMsg('No newer snapshot found on cloud station.');
    }
    setTimeout(() => setSyncStatusMsg(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/80 border border-blue-800/60 rounded-xl text-blue-400">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Multi-Device Cloud Sync & Station Mesh
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
                AES-256 ENCRYPTED
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Securely synchronize cameras, face databases, emergency contacts, and calibration across phones, tablets, and desktop hubs
            </p>
          </div>
        </div>

        {/* Master Enable Toggle */}
        <button
          onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
          className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition flex items-center gap-2 ${
            settings.enabled
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-950'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{settings.enabled ? 'CLOUD SYNC ON' : 'ZERO-CLOUD LOCAL ONLY'}</span>
        </button>
      </div>

      {syncStatusMsg && (
        <div className="p-3 bg-blue-950/40 border border-blue-800 text-blue-300 rounded-xl font-mono text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* Sync Status Banner */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 font-mono text-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white uppercase">Sync Relay Station Status</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              ENDPOINT: {settings.endpointUrl} (Local & Mesh Gateway)
            </p>
          </div>

          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">LAST SYNCHRONIZED</span>
            <span className="text-cyan-400 font-bold">
              {settings.lastSyncTime
                ? new Date(settings.lastSyncTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'Never Synced (Local Master)'}
            </span>
          </div>
        </div>

        {/* Action Buttons: Force Push & Pull */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleForcePush}
            disabled={isPushing}
            className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-xl transition flex items-center justify-center gap-2 font-bold text-blue-300"
          >
            <UploadCloud className={`w-4 h-4 ${isPushing ? 'animate-bounce' : ''}`} />
            <span>{isPushing ? 'UPLOADING...' : 'FORCE PUSH TO CLOUD NODE'}</span>
          </button>

          <button
            onClick={handleForcePull}
            disabled={isPulling}
            className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500 rounded-xl transition flex items-center justify-center gap-2 font-bold text-cyan-300"
          >
            <DownloadCloud className={`w-4 h-4 ${isPulling ? 'animate-bounce' : ''}`} />
            <span>{isPulling ? 'DOWNLOADING...' : 'PULL LATEST FROM CLOUD NODE'}</span>
          </button>
        </div>
      </div>

      {/* Sync Parameters & Privacy Safeguards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        {/* Sync Frequency / Schedule */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h4 className="font-bold uppercase text-white">Synchronization Frequency</h4>
          </div>
          <p className="text-[10px] text-slate-400">
            Determine how frequently state modifications are broadcast across paired surveillance devices.
          </p>

          <div className="space-y-1.5 pt-1">
            {[
              { sec: 0, label: 'Real-Time Immediate (On Every Calibration Change)' },
              { sec: 30, label: 'Periodic Interval: Every 30 Seconds' },
              { sec: 60, label: 'Periodic Interval: Every 1 Minute (Recommended)' },
              { sec: 300, label: 'Periodic Interval: Every 5 Minutes' },
              { sec: -1, label: 'Manual Only (Strict Air-Gapped Battery Conservation)' },
            ].map((opt) => (
              <label
                key={opt.sec}
                className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:bg-slate-900"
              >
                <input
                  type="radio"
                  name="syncFreq"
                  checked={settings.autoSyncIntervalSec === opt.sec}
                  onChange={() => onChange({ ...settings, autoSyncIntervalSec: opt.sec })}
                  className="accent-blue-500"
                />
                <span className="text-slate-300 text-[11px]">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Encryption & Security Fingerprint */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <h4 className="font-bold uppercase text-white">Cryptographic Encryption & P2P Mesh</h4>
          </div>

          <label className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.p2pSync}
              onChange={(e) => onChange({ ...settings, p2pSync: e.target.checked })}
              className="accent-emerald-500 rounded mt-0.5"
            />
            <div>
              <span className="font-bold text-slate-200 block">Peer-to-Peer Local Network Discovery</span>
              <span className="text-[10px] text-slate-400">
                Discovers tablet and mobile monitors on the same Wi-Fi subnet without routing through external internet
              </span>
            </div>
          </label>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 block font-bold">CLIENT ENCRYPTION FINGERPRINT</span>
            <div className="text-[11px] text-emerald-300 font-mono select-all">
              {settings.encryptionKeyFingerprint}
            </div>
            <span className="text-[9px] text-slate-500 block mt-1">
              All facial embeddings and contact phone numbers are encrypted client-side before transmission.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
