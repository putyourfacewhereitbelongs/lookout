import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Moon,
  Users,
  Bell,
  Smartphone,
  Cloud,
  HardDrive,
  Palette,
  X,
  Search,
  CheckCircle,
  Download,
  RotateCcw,
  Sparkles,
  Shield,
  ChevronRight,
  ChevronLeft,
  Ear,
} from 'lucide-react';
import {
  NightVisionSettings,
  RedSilhouetteSettings,
  VideoProcessingSettings,
  AccessibilitySettings,
  EmergencyContact,
  DetectionSensitivities,
  AlertNotificationSettings,
  PWASettings,
  CloudSyncSettings,
  StoragePreferences,
  FaceProfile,
  UIThemeMode,
  AudioVisualCue,
} from '../types';

import { AiSensitivitiesSection } from './settings/AiSensitivitiesSection';
import { NightVisionSection } from './settings/NightVisionSection';
import { FaceDatabaseSection } from './settings/FaceDatabaseSection';
import { AlertsTonesSection } from './settings/AlertsTonesSection';
import { PwaOfflineSection } from './settings/PwaOfflineSection';
import { CloudSyncSection } from './settings/CloudSyncSection';
import { StoragePreferencesSection } from './settings/StoragePreferencesSection';
import { ThemeDisplaySection } from './settings/ThemeDisplaySection';
import { AccessibilitySection } from './settings/AccessibilitySection';

export type SettingsTabId =
  | 'ai_detection'
  | 'night_vision'
  | 'face_db'
  | 'alerts_tones'
  | 'pwa_offline'
  | 'cloud_sync'
  | 'storage_prefs'
  | 'theme_display'
  | 'accessibility';

interface SettingsPanelProps {
  nightVision: NightVisionSettings;
  onNightVisionChange: (s: NightVisionSettings) => void;
  redSilhouette: RedSilhouetteSettings;
  onRedSilhouetteChange: (s: RedSilhouetteSettings) => void;
  videoProcessing: VideoProcessingSettings;
  onVideoProcessingChange: (s: VideoProcessingSettings) => void;
  accessibility: AccessibilitySettings;
  onAccessibilityChange: (s: AccessibilitySettings) => void;
  emergencyContacts: EmergencyContact[];
  onEmergencyContactsChange: (c: EmergencyContact[]) => void;
  detectionSensitivities: DetectionSensitivities;
  onDetectionSensitivitiesChange: (s: DetectionSensitivities) => void;
  alertNotifications: AlertNotificationSettings;
  onAlertNotificationsChange: (s: AlertNotificationSettings) => void;
  pwaSettings: PWASettings;
  onPWASettingsChange: (s: PWASettings) => void;
  cloudSyncSettings: CloudSyncSettings;
  onCloudSyncSettingsChange: (s: CloudSyncSettings) => void;
  storagePreferences: StoragePreferences;
  onStoragePreferencesChange: (s: StoragePreferences) => void;
  faceProfiles: FaceProfile[];
  onFaceProfilesChange: (p: FaceProfile[]) => void;
  currentTheme: UIThemeMode;
  onThemeChange: (t: UIThemeMode) => void;
  audioCues?: AudioVisualCue[];
  audioSourceNames?: string[];
  onClose?: () => void;
  initialTab?: SettingsTabId;
}

interface TabItem {
  id: SettingsTabId;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  badge?: string;
}

const SETTINGS_TABS: TabItem[] = [
  {
    id: 'ai_detection',
    label: 'AI Detection Sensitivities',
    shortLabel: 'Sensitivities',
    icon: <Sliders className="w-4 h-4 text-cyan-400" />,
    badge: '7 CATEGORIES',
  },
  {
    id: 'night_vision',
    label: 'Colored Night Vision',
    shortLabel: 'Night Vision',
    icon: <Moon className="w-4 h-4 text-emerald-400" />,
    badge: 'PRESETS & SLIDERS',
  },
  {
    id: 'face_db',
    label: 'Facial & Animal Intelligence',
    shortLabel: 'Face Database',
    icon: <Users className="w-4 h-4 text-cyan-400" />,
    badge: 'BIOMETRIC',
  },
  {
    id: 'alerts_tones',
    label: 'Alerts & Custom Tones',
    shortLabel: 'Alerts & Tones',
    icon: <Bell className="w-4 h-4 text-purple-400" />,
    badge: '7 TONES',
  },
  {
    id: 'pwa_offline',
    label: 'PWA & Offline Buffer',
    shortLabel: 'PWA & Offline',
    icon: <Smartphone className="w-4 h-4 text-emerald-400" />,
    badge: 'STANDALONE',
  },
  {
    id: 'cloud_sync',
    label: 'Multi-Device Cloud Sync',
    shortLabel: 'Cloud Sync',
    icon: <Cloud className="w-4 h-4 text-blue-400" />,
    badge: 'AES-256',
  },
  {
    id: 'storage_prefs',
    label: 'Local Storage & Data',
    shortLabel: 'Storage & Backup',
    icon: <HardDrive className="w-4 h-4 text-amber-400" />,
    badge: 'ZERO-CLOUD',
  },
  {
    id: 'theme_display',
    label: 'UI Theme & Dark Mode',
    shortLabel: 'Theme & HUD',
    icon: <Palette className="w-4 h-4 text-rose-400" />,
    badge: 'DARK / OLED',
  },
  {
    id: 'accessibility',
    label: 'Accessibility & Sound Cues',
    shortLabel: 'Accessibility',
    icon: <Ear className="w-4 h-4 text-cyan-400" />,
    badge: 'AUDIO AI',
  },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  nightVision,
  onNightVisionChange,
  redSilhouette,
  onRedSilhouetteChange,
  videoProcessing,
  onVideoProcessingChange,
  accessibility,
  onAccessibilityChange,
  audioCues = [],
  audioSourceNames = [],
  emergencyContacts,
  onEmergencyContactsChange,
  detectionSensitivities,
  onDetectionSensitivitiesChange,
  alertNotifications,
  onAlertNotificationsChange,
  pwaSettings,
  onPWASettingsChange,
  cloudSyncSettings,
  onCloudSyncSettingsChange,
  storagePreferences,
  onStoragePreferencesChange,
  faceProfiles,
  onFaceProfilesChange,
  currentTheme,
  onThemeChange,
  onClose,
  initialTab = 'ai_detection',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [searchFilter, setSearchFilter] = useState('');
  const navScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active tab into view when selected
  useEffect(() => {
    if (navScrollRef.current) {
      const activeEl = navScrollRef.current.querySelector<HTMLElement>(`[data-tab-id="${activeTab}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeTab]);

  const handleNavScroll = (direction: 'left' | 'right') => {
    if (navScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      navScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Filter tabs if search query entered
  const matchedTabs = searchFilter.trim()
    ? SETTINGS_TABS.filter(
        (t) =>
          t.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
          t.shortLabel.toLowerCase().includes(searchFilter.toLowerCase()) ||
          t.badge?.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : SETTINGS_TABS;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl text-slate-100 flex flex-col overflow-hidden transition-all duration-300">
      {/* 1. PERSISTENT TOP HEADER */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950/80 border border-cyan-800/60 rounded-xl text-cyan-400">
            <Settings className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                Lookout AI // Advanced System Settings & Calibration Hub
              </h2>
              <span className="hidden sm:inline px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                ENTERPRISE MATRIX
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5 line-clamp-1">
              AI sensitivities, multi-spectral night vision, facial recognition, alerts, PWA, sync, and theme
            </p>
          </div>
        </div>

        {/* Quick Search & Close Action */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="relative w-40 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 border border-slate-800 transition"
              title="Close Settings Panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. PERSISTENT & SCROLLABLE CATEGORY NAVIGATION BAR */}
      <div className="sticky top-[61px] z-20 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90 px-2 sm:px-4 py-2 flex items-center gap-1.5 shadow-md">
        {/* Left Scroll Button */}
        <button
          onClick={() => handleNavScroll('left')}
          className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition shrink-0 hidden sm:flex items-center justify-center"
          title="Scroll Left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Horizontally Scrollable Pills Container */}
        <div
          ref={navScrollRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1"
        >
          {matchedTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchFilter('');
                }}
                className={`group flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs whitespace-nowrap border transition shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 border-cyan-500 text-white font-bold shadow-lg ring-1 ring-cyan-500/30'
                    : 'bg-slate-950 border-slate-800/90 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="shrink-0">{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
                <span className="md:hidden">{tab.shortLabel}</span>
                {tab.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                      isActive
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
                        : 'bg-slate-900 text-slate-500 border border-slate-800'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Scroll Button */}
        <button
          onClick={() => handleNavScroll('right')}
          className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-900 rounded-lg transition shrink-0 hidden sm:flex items-center justify-center"
          title="Scroll Right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 3. SETTINGS CONTENT CONTAINER */}
      <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-3 custom-scrollbar sm:max-h-[calc(85vh-120px)] sm:p-6">
        {activeTab === 'ai_detection' && (
          <AiSensitivitiesSection
            sensitivities={detectionSensitivities}
            onChange={onDetectionSensitivitiesChange}
          />
        )}

        {activeTab === 'night_vision' && (
          <NightVisionSection
            settings={nightVision}
            onChange={onNightVisionChange}
            redSilhouette={redSilhouette}
            onRedSilhouetteChange={onRedSilhouetteChange}
          />
        )}

        {activeTab === 'face_db' && (
          <FaceDatabaseSection
            faceProfiles={faceProfiles}
            onFaceProfilesChange={onFaceProfilesChange}
            storagePreferences={storagePreferences}
            onStoragePreferencesChange={onStoragePreferencesChange}
          />
        )}

        {activeTab === 'alerts_tones' && (
          <AlertsTonesSection
            settings={alertNotifications}
            onChange={onAlertNotificationsChange}
            emergencyContacts={emergencyContacts}
            onEmergencyContactsChange={onEmergencyContactsChange}
          />
        )}

        {activeTab === 'pwa_offline' && (
          <PwaOfflineSection
            settings={pwaSettings}
            onChange={onPWASettingsChange}
          />
        )}

        {activeTab === 'cloud_sync' && (
          <CloudSyncSection
            settings={cloudSyncSettings}
            onChange={onCloudSyncSettingsChange}
          />
        )}

        {activeTab === 'storage_prefs' && (
          <StoragePreferencesSection
            preferences={storagePreferences}
            onChange={onStoragePreferencesChange}
            onRefreshAllState={() => {
              onFaceProfilesChange(faceProfiles);
            }}
          />
        )}

        {activeTab === 'accessibility' && (
          <AccessibilitySection
            settings={accessibility}
            onChange={onAccessibilityChange}
            recentCues={audioCues}
            audioSourceNames={audioSourceNames}
          />
        )}

        {activeTab === 'theme_display' && (
          <ThemeDisplaySection
            currentTheme={currentTheme}
            onThemeChange={onThemeChange}
            videoProcessing={videoProcessing}
            onVideoProcessingChange={onVideoProcessingChange}
          />
        )}
      </div>

      {/* 4. PERSISTENT FOOTER */}
      <div className="border-t border-slate-800 bg-slate-950/80 px-4 sm:px-6 py-2.5 font-mono text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Local Changes Auto-Saved Instantly to Encrypted Store</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>THEME: {currentTheme.toUpperCase()}</span>
          <span>•</span>
          <span>STORAGE: ZERO-CLOUD PRIVATE</span>
        </div>
      </div>
    </div>
  );
};
