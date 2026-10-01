import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  Database,
  FileText,
  Film,
  Users,
  Settings,
} from 'lucide-react';
import { StoragePreferences } from '../../types';
import { StorageService } from '../../services/db';

interface StoragePreferencesSectionProps {
  preferences: StoragePreferences;
  onChange: (p: StoragePreferences) => void;
  onRefreshAllState?: () => void;
}

export const StoragePreferencesSection: React.FC<StoragePreferencesSectionProps> = ({
  preferences,
  onChange,
  onRefreshAllState,
}) => {
  const [usage, setUsage] = useState({
    totalBytes: 0,
    facesBytes: 0,
    recordingsBytes: 0,
    settingsBytes: 0,
    quotaBytesEstimate: 5 * 1024 * 1024,
  });

  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const refreshUsage = () => {
    setUsage(StorageService.getStorageUsage());
  };

  useEffect(() => {
    refreshUsage();
  }, []);

  const handleExportFullBackup = () => {
    const jsonStr = StorageService.exportFullDatabase();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lookout-ai-complete-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Full system configuration and database exported successfully.');
  };

  const handleImportFullBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      const ok = StorageService.importFullDatabase(json);
      if (ok) {
        refreshUsage();
        if (onRefreshAllState) onRefreshAllState();
        showToast('All system state, recordings, faces, and settings restored!');
      } else {
        alert('Failed to import backup file. Ensure it is valid Lookout AI JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePurgeRecordings = () => {
    if (confirm('Permanently purge all saved DVR video recordings from local storage?')) {
      StorageService.purgeRecordings();
      refreshUsage();
      if (onRefreshAllState) onRefreshAllState();
      showToast('All local DVR recordings purged.');
    }
  };

  const handlePurgeFaces = () => {
    if (confirm('Reset facial recognition catalog to defaults? All custom faces will be cleared.')) {
      StorageService.clearFaceProfiles();
      refreshUsage();
      if (onRefreshAllState) onRefreshAllState();
      showToast('Facial database cleared to default seed.');
    }
  };

  const handleFactoryReset = () => {
    if (
      confirm(
        'WARNING: Factory reset will restore all settings, sensitivities, night vision, and calibration to original state. Continue?'
      )
    ) {
      StorageService.resetAllSettings();
      refreshUsage();
      if (onRefreshAllState) onRefreshAllState();
      showToast('All system calibration reset to factory defaults.');
    }
  };

  const usedKb = (usage.totalBytes / 1024).toFixed(1);
  const quotaMb = (usage.quotaBytesEstimate / (1024 * 1024)).toFixed(0);
  const percentUsed = Math.min(100, Math.max(1, (usage.totalBytes / usage.quotaBytesEstimate) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-950/80 border border-amber-800/60 rounded-xl text-amber-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              Local Data Storage & Retention Policies
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Zero-cloud local storage allocation, clip auto-pruning, and complete system JSON backup & restore
            </p>
          </div>
        </div>
      </div>

      {feedbackToast && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded-xl font-mono text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Storage Gauge & Allocation Metrics */}
      <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 font-mono text-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 block font-bold uppercase">
              LOCAL DEVICE STORAGE ALLOCATION
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold text-white">{usedKb} KB</span>
              <span className="text-slate-400 text-xs">/ ~{quotaMb} MB Local Quota</span>
            </div>
          </div>
          <span className="text-amber-400 font-bold text-sm">{percentUsed.toFixed(1)}% USED</span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden flex border border-slate-800">
          <div
            className="bg-cyan-500 h-full transition-all duration-500"
            style={{ width: `${Math.max(2, (usage.facesBytes / (usage.totalBytes || 1)) * percentUsed)}%` }}
            title="Faces & Biometrics"
          />
          <div
            className="bg-purple-500 h-full transition-all duration-500"
            style={{ width: `${Math.max(2, (usage.recordingsBytes / (usage.totalBytes || 1)) * percentUsed)}%` }}
            title="DVR Recordings"
          />
          <div
            className="bg-emerald-500 h-full transition-all duration-500"
            style={{ width: `${Math.max(2, (usage.settingsBytes / (usage.totalBytes || 1)) * percentUsed)}%` }}
            title="Settings & Calibration"
          />
        </div>

        {/* Breakdown Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span className="text-slate-400">Face Biometrics:</span>
            <span className="text-white font-bold ml-auto">{(usage.facesBytes / 1024).toFixed(1)} KB</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-slate-400">DVR Clip Index:</span>
            <span className="text-white font-bold ml-auto">{(usage.recordingsBytes / 1024).toFixed(1)} KB</span>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-slate-400">System Calibration:</span>
            <span className="text-white font-bold ml-auto">{(usage.settingsBytes / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: DVR RETENTION POLICY & BACKUP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
        {/* Retention Policy */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h4 className="font-bold uppercase text-white flex items-center gap-2 text-xs">
            <Film className="w-4 h-4 text-purple-400" />
            DVR Recording Retention Policy
          </h4>
          <p className="text-[10px] text-slate-400">
            Automatically purge old motion video recordings after a specified lifespan to preserve local storage.
          </p>

          <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.autoPurgeOldRecordings}
              onChange={(e) =>
                onChange({ ...preferences, autoPurgeOldRecordings: e.target.checked })
              }
              className="accent-purple-500 rounded"
            />
            <span className="font-bold text-slate-200">Auto-Purge Expired Recordings</span>
          </label>

          <div className="space-y-1.5 pt-1">
            {[
              { days: 7, label: 'Purge recordings older than 7 Days' },
              { days: 14, label: 'Purge recordings older than 14 Days (Standard)' },
              { days: 30, label: 'Purge recordings older than 30 Days' },
              { days: 0, label: 'Retain Forever (Manual Deletion Only)' },
            ].map((policy) => (
              <label
                key={policy.days}
                className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 cursor-pointer hover:bg-slate-900"
              >
                <input
                  type="radio"
                  name="retentionPolicy"
                  checked={preferences.recordingRetentionDays === policy.days}
                  onChange={() => onChange({ ...preferences, recordingRetentionDays: policy.days })}
                  disabled={!preferences.autoPurgeOldRecordings && policy.days !== 0}
                  className="accent-purple-500 disabled:opacity-40"
                />
                <span className="text-slate-300 text-[11px]">{policy.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Complete Backup & Restore */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="font-bold uppercase text-white flex items-center gap-2 text-xs">
              <Database className="w-4 h-4 text-emerald-400" />
              Complete Backup & Station Restore
            </h4>
            <p className="text-[10px] text-slate-400 mt-1">
              Download a single consolidated JSON archive containing face profiles, cameras, detection thresholds, and system settings.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={handleExportFullBackup}
              className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 text-emerald-300 font-bold rounded-xl transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>EXPORT COMPLETE SYSTEM BACKUP (.JSON)</span>
            </button>

            <label className="w-full p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500 text-cyan-300 font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>RESTORE SYSTEM FROM JSON BACKUP</span>
              <input type="file" accept=".json" onChange={handleImportFullBackup} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="bg-red-950/20 p-4 rounded-xl border border-red-900/60 font-mono text-xs space-y-3">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <h4 className="font-bold uppercase">Local Storage Danger Zone</h4>
        </div>
        <p className="text-[10px] text-slate-400">
          Irreversible actions. Purges local browser storage and resets calibration.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={handlePurgeRecordings}
            className="px-3 py-2 bg-slate-900 hover:bg-red-950 border border-slate-700 hover:border-red-700 text-slate-300 hover:text-red-300 rounded-lg transition font-bold"
          >
            Purge All Recordings
          </button>

          <button
            onClick={handlePurgeFaces}
            className="px-3 py-2 bg-slate-900 hover:bg-red-950 border border-slate-700 hover:border-red-700 text-slate-300 hover:text-red-300 rounded-lg transition font-bold"
          >
            Reset Face Database
          </button>

          <button
            onClick={handleFactoryReset}
            className="px-3 py-2 bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 rounded-lg transition font-bold ml-auto"
          >
            Factory Reset Settings
          </button>
        </div>
      </div>
    </div>
  );
};
