import {
  FaceProfile,
  SavedRecording,
  EmergencyContact,
  CameraSource,
  NightVisionSettings,
  RedSilhouetteSettings,
  VideoProcessingSettings,
  AccessibilitySettings,
  DetectionSensitivities,
  AlertNotificationSettings,
  PWASettings,
  CloudSyncSettings,
  StoragePreferences,
  UIThemeMode,
  HistoryEvent,
} from '../types';

const THEME_KEY = 'lookout_theme_v1';

const FACES_KEY = 'lookout_faces_v1';
const RECORDINGS_KEY = 'lookout_recordings_v1';
const RECORDING_BLOB_DB = 'lookout_recording_media_v1';
const RECORDING_BLOB_STORE = 'recording-blobs';
const CONTACTS_KEY = 'lookout_emergency_contacts_v1';
const SETTINGS_KEY = 'lookout_system_settings_v1';
const CAMERAS_KEY = 'lookout_cameras_v1';
const HISTORY_KEY = 'lookout_event_history_v1';
const MAX_HISTORY_EVENTS = 1000;

export const DEFAULT_SENSITIVITIES: DetectionSensitivities = {
  fixedCameraGuard: false,
  objects: {
    enabled: true,
    sensitivity: 80,
    confidenceThreshold: 0.65,
    highlightColor: '#06b6d4',
    triggerAlert: true,
    audibleChime: false,
    detectionZone: 'full_frame',
  },
  people: {
    enabled: true,
    sensitivity: 90,
    confidenceThreshold: 0.60,
    highlightColor: '#ef4444',
    triggerAlert: true,
    audibleChime: true,
    detectionZone: 'full_frame',
  },
  threats: {
    enabled: true,
    sensitivity: 95,
    confidenceThreshold: 0.70,
    highlightColor: '#dc2626',
    triggerAlert: true,
    audibleChime: true,
    detectionZone: 'full_frame',
  },
  animals: {
    enabled: true,
    sensitivity: 85,
    confidenceThreshold: 0.60,
    highlightColor: '#10b981',
    triggerAlert: true,
    audibleChime: false,
    detectionZone: 'full_frame',
  },
  cars: {
    enabled: true,
    sensitivity: 75,
    confidenceThreshold: 0.70,
    highlightColor: '#f59e0b',
    triggerAlert: true,
    audibleChime: false,
    detectionZone: 'full_frame',
  },
  weather: {
    enabled: true,
    sensitivity: 70,
    confidenceThreshold: 0.65,
    highlightColor: '#8b5cf6',
    triggerAlert: false,
    audibleChime: false,
    detectionZone: 'full_frame',
  },
};

export const DEFAULT_ALERT_SETTINGS: AlertNotificationSettings = {
  visualBanners: true,
  audibleChime: true,
  browserPush: false,
  criticalThreatSiren: true,
  cooldownSeconds: 15,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  alertToneVolume: 0.75,
  customTone: 'tactical_chime',
  ttsVoiceEnabled: true,
  ttsVoiceRate: 1.0,
  ttsVoicePitch: 1.0,
};

export const DEFAULT_PWA_SETTINGS: PWASettings = {
  offlineCachingEnabled: true,
  backgroundSync: true,
  offlineFrameBuffer: true,
  bufferFrameCount: 60,
};

export const DEFAULT_CLOUD_SYNC_SETTINGS: CloudSyncSettings = {
  enabled: false,
  autoSyncIntervalSec: 60,
  p2pSync: true,
  endpointUrl: '/api/sync/push',
  encryptionKeyFingerprint: 'SHA256-AES-GCM-LOCAL-SECURE',
  lastSyncTime: null,
};

export const DEFAULT_STORAGE_PREFERENCES: StoragePreferences = {
  recordingRetentionDays: 14,
  autoPurgeOldRecordings: true,
  facialRecognitionMasterEnabled: true,
  faceMatchThreshold: 0.92,
};

// Seed recognized profiles including CompreFace biometric database subjects
const DEFAULT_PROFILES: FaceProfile[] = [
  {
    id: 'fp-cf-brian',
    name: 'Brian',
    subjectType: 'person',
    role: 'family',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-brian',
    similarityScore: 0.98,
    firstSeen: Date.now() - 86400000 * 5,
    lastSeen: Date.now() - 120000,
    notes: 'Enrolled in CompreFace Neural DB (Primary Profile)',
  },
  {
    id: 'fp-cf-heather',
    name: 'Heather',
    subjectType: 'person',
    role: 'family',
    thumbnail: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-heather',
    similarityScore: 0.97,
    firstSeen: Date.now() - 86400000 * 4,
    lastSeen: Date.now() - 360000,
    notes: 'Enrolled in CompreFace Neural DB (Verified Subject)',
  },
  {
    id: 'fp-cf-malcolm',
    name: 'Malcolm',
    subjectType: 'person',
    role: 'family',
    thumbnail: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-malcolm',
    similarityScore: 0.96,
    firstSeen: Date.now() - 86400000 * 6,
    lastSeen: Date.now() - 720000,
    notes: 'Enrolled in CompreFace Neural DB (Verified Subject)',
  },
  {
    id: 'fp-cf-amberlea',
    name: 'Amberlea',
    subjectType: 'person',
    role: 'family',
    thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-amberlea',
    similarityScore: 0.95,
    firstSeen: Date.now() - 86400000 * 3,
    lastSeen: Date.now() - 1440000,
    notes: 'Enrolled in CompreFace Neural DB (Verified Subject)',
  },
  {
    id: 'fp-cf-jamie',
    name: 'Jamie',
    subjectType: 'person',
    role: 'friend',
    thumbnail: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-jamie',
    similarityScore: 0.94,
    firstSeen: Date.now() - 86400000 * 2,
    lastSeen: Date.now() - 1800000,
    notes: 'Enrolled in CompreFace Neural DB (Verified Friend)',
  },
  {
    id: 'fp-cf-jeff',
    name: 'Jeff',
    subjectType: 'person',
    role: 'friend',
    thumbnail: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-jeff',
    similarityScore: 0.93,
    firstSeen: Date.now() - 86400000 * 2,
    lastSeen: Date.now() - 2400000,
    notes: 'Enrolled in CompreFace Neural DB (Verified Friend)',
  },
  {
    id: 'fp-known-2',
    name: 'Max (Golden Retriever)',
    subjectType: 'animal',
    role: 'pet',
    thumbnail: 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1552053831-71594a27632d?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-max-dog',
    similarityScore: 0.96,
    firstSeen: Date.now() - 86400000 * 7,
    lastSeen: Date.now() - 600000,
    notes: 'Household Pet - Golden Retriever',
  },
  {
    id: 'fp-unknown-1',
    name: 'Unknown Subject #412',
    subjectType: 'person',
    role: 'unknown',
    thumbnail: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    snapshots: [
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80',
    ],
    clusterId: 'cluster-unnamed-alpha',
    similarityScore: 0.89,
    firstSeen: Date.now() - 7200000,
    lastSeen: Date.now() - 240000,
    notes: 'Detected at Front Porch (Awaiting Name)',
  },
];

const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id: 'ec-1',
    name: 'Sarah Jenkins (Family)',
    phone: '+1 (555) 234-8901',
    relation: 'Sister / Emergency Proxy',
  },
  {
    id: 'ec-2',
    name: 'Lookout Dispatch Center',
    phone: '+1 (800) 555-SAFE',
    relation: 'Automated DVR Emergency Monitor',
  },
];

export class StorageService {
  static getHistoryEvents(): HistoryEvent[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((event) => event && typeof event.timestamp === 'number' && typeof event.title === 'string') : [];
    } catch (error) {
      console.error('Failed to load event history', error);
      return [];
    }
  }

  static saveHistoryEvents(events: HistoryEvent[]): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(events.slice(0, MAX_HISTORY_EVENTS)));
    } catch (error) {
      console.error('Failed to save event history', error);
    }
  }

  static addHistoryEvent(event: HistoryEvent): HistoryEvent[] {
    const events = [event, ...this.getHistoryEvents()].slice(0, MAX_HISTORY_EVENTS);
    this.saveHistoryEvents(events);
    return events;
  }

  static clearHistoryEvents(): void {
    localStorage.removeItem(HISTORY_KEY);
  }

  static getFaceProfiles(): FaceProfile[] {
    try {
      const data = localStorage.getItem(FACES_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to parse face profiles', e);
    }
    // Set default and return
    this.saveFaceProfiles(DEFAULT_PROFILES);
    return DEFAULT_PROFILES;
  }

  static saveFaceProfiles(profiles: FaceProfile[]): void {
    try {
      localStorage.setItem(FACES_KEY, JSON.stringify(profiles));
    } catch (e) {
      console.error('Failed to save face profiles', e);
    }
  }

  static addUnknownFace(
    thumbnail: string,
    type: 'person' | 'animal',
    notes = 'Captured from live feed'
  ): FaceProfile {
    const profiles = this.getFaceProfiles();
    const count = profiles.filter((p) => p.role === 'unknown').length + 1;
    const uniqueRand = Math.random().toString(36).substring(2, 8);
    const newId = `fp-auto-${Date.now()}-${uniqueRand}`;
    const newProfile: FaceProfile = {
      id: newId,
      name: type === 'person' ? `Unknown Subject #${count}` : `Unknown Animal #${count}`,
      subjectType: type,
      role: 'unknown',
      thumbnail,
      snapshots: [thumbnail],
      clusterId: `cluster-${Date.now().toString(36)}-${uniqueRand}`,
      similarityScore: 0.92,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      notes,
    };

    profiles.unshift(newProfile);
    this.saveFaceProfiles(profiles);
    return newProfile;
  }

  static updateProfileNameAndRole(
    id: string,
    name: string,
    role: FaceProfile['role'],
    notes?: string,
    subjectType?: FaceProfile['subjectType']
  ): void {
    const profiles = this.getFaceProfiles().map((p) => {
      if (p.id === id) {
        return {
          ...p,
          name,
          role,
          subjectType: subjectType ?? p.subjectType,
          notes: notes !== undefined ? notes : p.notes,
          lastSeen: Date.now(),
        };
      }
      return p;
    });
    this.saveFaceProfiles(profiles);
  }

  static updateFaceLastSeenByName(name: string): void {
    const profiles = this.getFaceProfiles();
    const now = Date.now();
    let changed = false;
    for (const profile of profiles) {
      if (profile.name.toLowerCase() !== name.toLowerCase()) continue;
      if (now - (profile.lastSeenPersistedAt || 0) < 10_000) continue;
      profile.lastSeen = now;
      profile.lastSeenPersistedAt = now;
      changed = true;
    }
    if (changed) this.saveFaceProfiles(profiles);
  }

  static deleteProfile(id: string): void {
    const profiles = this.getFaceProfiles().filter((p) => p.id !== id);
    this.saveFaceProfiles(profiles);
  }

  static deleteFaceSnapshot(profileId: string, snapshotIndex: number): void {
    const profiles = this.getFaceProfiles().map((profile) => {
      if (profile.id !== profileId) return profile;
      const snapshots = (profile.snapshots || []).filter((_, index) => index !== snapshotIndex);
      const thumbnail = snapshots[0] || '';
      return { ...profile, snapshots, thumbnail };
    });
    this.saveFaceProfiles(profiles);
  }

  // Emergency Contacts
  static getEmergencyContacts(): EmergencyContact[] {
    try {
      const data = localStorage.getItem(CONTACTS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load contacts', e);
    }
    this.saveEmergencyContacts(DEFAULT_CONTACTS);
    return DEFAULT_CONTACTS;
  }

  static saveEmergencyContacts(contacts: EmergencyContact[]): void {
    try {
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
    } catch (e) {
      console.error('Failed to save contacts', e);
    }
  }

  // DVR Saved Recordings
  static getRecordings(): SavedRecording[] {
    try {
      const data = localStorage.getItem(RECORDINGS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load recordings', e);
    }
    return [];
  }

  private static openRecordingBlobDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser'));
        return;
      }
      const request = indexedDB.open(RECORDING_BLOB_DB, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(RECORDING_BLOB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open recording storage'));
    });
  }

  static saveRecording(recording: SavedRecording, blob?: Blob): void {
    const list = this.getRecordings();
    // The metadata stays small and portable in localStorage; the actual video
    // bytes live in IndexedDB so a multi-minute clip is not silently dropped by
    // the browser's localStorage quota.
    const metadata = { ...recording, blobUrl: blob ? '' : recording.blobUrl, blobKey: blob ? recording.id : undefined };
    list.unshift(metadata);
    try {
      localStorage.setItem(RECORDINGS_KEY, JSON.stringify(list.slice(0, 50)));
      if (blob) {
        this.openRecordingBlobDb().then((db) => {
          const tx = db.transaction(RECORDING_BLOB_STORE, 'readwrite');
          tx.objectStore(RECORDING_BLOB_STORE).put(blob, recording.id);
          tx.oncomplete = () => db.close();
          tx.onerror = () => console.error('Failed to persist recording video', tx.error);
        }).catch((error) => console.error('Failed to open recording video storage', error));
      }
    } catch (e) {
      console.error('Failed to save recording metadata', e);
    }
  }

  static async hydrateRecordings(recordings: SavedRecording[]): Promise<SavedRecording[]> {
    const hydrated = await Promise.all(recordings.map(async (recording) => {
      const blobKey = recording.blobKey;
      if (!blobKey || recording.blobUrl) return recording;
      try {
        const db = await this.openRecordingBlobDb();
        const blob = await new Promise<Blob | undefined>((resolve, reject) => {
          const request = db.transaction(RECORDING_BLOB_STORE, 'readonly').objectStore(RECORDING_BLOB_STORE).get(blobKey);
          request.onsuccess = () => resolve(request.result as Blob | undefined);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return blob ? { ...recording, blobUrl: URL.createObjectURL(blob) } : recording;
      } catch (error) {
        console.error('Failed to load saved recording video', error);
        return recording;
      }
    }));
    return hydrated;
  }

  static deleteRecording(id: string): void {
    const list = this.getRecordings().filter((r) => r.id !== id);
    localStorage.setItem(RECORDINGS_KEY, JSON.stringify(list));
    this.openRecordingBlobDb().then((db) => {
      const tx = db.transaction(RECORDING_BLOB_STORE, 'readwrite');
      tx.objectStore(RECORDING_BLOB_STORE).delete(id);
      tx.oncomplete = () => db.close();
    }).catch(() => {});
  }

  // Settings sync
  static getSavedSettings(): Record<string, any> | null {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  static saveSettings(settings: Record<string, any>): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }

  // Multi-device Cloud Sync
  static async pushToCloudSync(payload: any): Promise<boolean> {
    try {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: navigator.userAgent.slice(0, 30),
          payload: JSON.stringify(payload),
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  static async pullFromCloudSync(): Promise<any | null> {
    try {
      const res = await fetch('/api/sync/pull');
      const data = await res.json();
      if (data.available && data.payload) {
        return JSON.parse(data.payload);
      }
    } catch {
      // offline fallback
    }
    return null;
  }

  // Camera Source persistence
  static getCameras(): CameraSource[] {
    try {
      const data = localStorage.getItem(CAMERAS_KEY);
      if (data) return JSON.parse(data);
    } catch {}
    return [];
  }

  static saveCameras(cameras: CameraSource[]): void {
    try {
      // Omit live stream MediaStream object before saving
      const serializable = cameras.map((c) => ({
        ...c,
        stream: undefined,
      }));
      localStorage.setItem(CAMERAS_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.error('Failed to save cameras', e);
    }
  }

  // Night Vision Settings
  static getNightVisionSettings(): NightVisionSettings {
    const saved = this.getSavedSettings();
    if (saved && saved.nightVision) return saved.nightVision;
    return {
      enabled: false,
      preset: 'starlight_color',
      gain: 1.8,
      chromaBoost: 2.2,
      irPhosphorBalance: 0.2,
      spectralDenoise: 0.6,
      luminescenceEnhancement: 2.0,
      tintHue: 190,
      contrastGamma: 1.2,
      edgeSharpness: 0.7,
    };
  }

  static saveNightVisionSettings(settings: NightVisionSettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, nightVision: settings });
  }

  // Red Silhouette Settings
  static getRedSilhouetteSettings(): RedSilhouetteSettings {
    const saved = this.getSavedSettings();
    if (saved && saved.redSilhouette) return saved.redSilhouette;
    return {
      enabled: false,
      targetPeople: true,
      targetAnimals: true,
      opacity: 1,
      edgePrecision: 4,
      highSpeedTrackingSensitivity: 'ultra_low_latency',
    };
  }

  static saveRedSilhouetteSettings(settings: RedSilhouetteSettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, redSilhouette: settings });
  }

  // Video Processing Settings
  static getVideoProcessingSettings(): VideoProcessingSettings {
    const saved = this.getSavedSettings();
    if (saved && saved.videoProcessing) return saved.videoProcessing;
    return {
      videoBackgroundErase: false,
      upscaling8K: false,
      imageProfile: 'standard',
      alertToneEnabled: true,
      alertToneType: 'tactical_chime',
    };
  }

  static saveVideoProcessingSettings(settings: VideoProcessingSettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, videoProcessing: settings });
  }

  // Accessibility Settings
  static getAccessibilitySettings(): AccessibilitySettings {
    const saved = this.getSavedSettings();
    if (saved && saved.accessibility) return saved.accessibility;
    return {
      visuallyImpairedObstacleOverlay: false,
      floorElevationSensor: true,
      hapticFeedback: true,
      voiceCommandsAndNarration: false,
      audioVisualCues: true,
    };
  }

  static saveAccessibilitySettings(settings: AccessibilitySettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, accessibility: settings });
  }

  // Catalog unknown face or animal dynamically
  static catalogUnknownFace(
    name: string,
    type: 'person' | 'animal',
    notes: string,
    thumbnail?: string
  ): FaceProfile {
    const profiles = this.getFaceProfiles();
    const now = Date.now();
    const existing = profiles.find((p) => p.name === name && p.subjectType === type);
    if (existing) {
      const shouldCaptureSnapshot = Boolean(thumbnail) && now - (existing.lastSnapshotAt || existing.firstSeen) >= 10_000;
      const shouldSaveFirstSnapshot = Boolean(thumbnail) && !existing.thumbnail;
      existing.lastSeen = now;
      if ((shouldCaptureSnapshot || shouldSaveFirstSnapshot) && thumbnail) {
        if (!existing.thumbnail) existing.thumbnail = thumbnail;
        existing.snapshots = [...new Set([...(existing.snapshots || []), thumbnail])].slice(-12);
        existing.lastSnapshotAt = now;
        this.saveFaceProfiles(profiles);
      }
      return existing;
    }

    const actualThumb = thumbnail || '';

    const newProfile: FaceProfile = {
      id: `fp-auto-${now}-${Math.floor(Math.random() * 1000)}`,
      name,
      subjectType: type,
      role: 'unknown',
      thumbnail: actualThumb,
      snapshots: actualThumb ? [actualThumb] : [],
      clusterId: `cluster-${now.toString(36)}`,
      similarityScore: 0.94,
      firstSeen: now,
      lastSeen: now,
      lastSnapshotAt: actualThumb ? now : undefined,
      notes,
    };

    profiles.unshift(newProfile);
    this.saveFaceProfiles(profiles);
    return newProfile;
  }

  static catalogDetectedAnimal(
    detectionId: string,
    label: string,
    notes: string,
    thumbnail?: string,
    confidence = 0.8
  ): FaceProfile {
    const profiles = this.getFaceProfiles();
    const now = Date.now();
    const existing = profiles.find((profile) => profile.sourceDetectionId === detectionId);
    if (existing) {
      const shouldAddSnapshot = Boolean(thumbnail) && now - (existing.lastSnapshotAt || existing.firstSeen) >= 15_000;
      const shouldSaveFirstSnapshot = !existing.thumbnail && Boolean(thumbnail);
      existing.lastSeen = now;
      if (!existing.thumbnail && thumbnail) {
        existing.thumbnail = thumbnail;
      }
      if ((shouldAddSnapshot || shouldSaveFirstSnapshot) && thumbnail) {
        existing.snapshots = [...new Set([...(existing.snapshots || []), thumbnail])].slice(-12);
        existing.lastSnapshotAt = now;
        this.saveFaceProfiles(profiles);
      }
      return existing;
    }

    const unknownCount = profiles.filter((profile) => profile.subjectType === 'animal' && profile.role === 'unknown').length + 1;
    const profile: FaceProfile = {
      id: `animal-${now}-${Math.random().toString(36).slice(2, 8)}`,
      sourceDetectionId: detectionId,
      name: `Unknown ${label} #${unknownCount}`,
      subjectType: 'animal',
      role: 'unknown',
      thumbnail: thumbnail || '',
      snapshots: thumbnail ? [thumbnail] : [],
      clusterId: `animal-cluster-${now.toString(36)}`,
      similarityScore: Math.max(0, Math.min(1, confidence)),
      firstSeen: now,
      lastSeen: now,
      lastSnapshotAt: thumbnail ? now : undefined,
      notes,
    };
    profiles.unshift(profile);
    this.saveFaceProfiles(profiles);
    return profile;
  }

  // Detection Sensitivities
  static getDetectionSensitivities(): DetectionSensitivities {
    const saved = this.getSavedSettings();
    if (saved && saved.detectionSensitivities) {
      return { ...DEFAULT_SENSITIVITIES, ...saved.detectionSensitivities };
    }
    return DEFAULT_SENSITIVITIES;
  }

  static saveDetectionSensitivities(settings: DetectionSensitivities): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, detectionSensitivities: settings });
  }

  // Alert Notifications
  static getAlertNotificationSettings(): AlertNotificationSettings {
    const saved = this.getSavedSettings();
    if (saved && saved.alertNotifications) {
      return { ...DEFAULT_ALERT_SETTINGS, ...saved.alertNotifications };
    }
    return DEFAULT_ALERT_SETTINGS;
  }

  static saveAlertNotificationSettings(settings: AlertNotificationSettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, alertNotifications: settings });
  }

  // PWA Settings
  static getPWASettings(): PWASettings {
    const saved = this.getSavedSettings();
    if (saved && saved.pwa) {
      return { ...DEFAULT_PWA_SETTINGS, ...saved.pwa };
    }
    return DEFAULT_PWA_SETTINGS;
  }

  static savePWASettings(settings: PWASettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, pwa: settings });
  }

  // Cloud Sync Settings
  static getCloudSyncSettings(): CloudSyncSettings {
    const saved = this.getSavedSettings();
    if (saved && saved.cloudSync) {
      return { ...DEFAULT_CLOUD_SYNC_SETTINGS, ...saved.cloudSync };
    }
    return DEFAULT_CLOUD_SYNC_SETTINGS;
  }

  static saveCloudSyncSettings(settings: CloudSyncSettings): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, cloudSync: settings });
  }

  // Storage Preferences
  static getStoragePreferences(): StoragePreferences {
    const saved = this.getSavedSettings();
    if (saved && saved.storagePreferences) {
      return { ...DEFAULT_STORAGE_PREFERENCES, ...saved.storagePreferences };
    }
    return DEFAULT_STORAGE_PREFERENCES;
  }

  static saveStoragePreferences(settings: StoragePreferences): void {
    const current = this.getSavedSettings() || {};
    this.saveSettings({ ...current, storagePreferences: settings });
  }

  // UI Theme Mode
  static getTheme(): UIThemeMode {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      if (theme && ['dark', 'light', 'oled', 'tactical_nvg'].includes(theme)) {
        return theme as UIThemeMode;
      }
    } catch {}
    return 'dark';
  }

  static saveTheme(theme: UIThemeMode): void {
    try {
      localStorage.setItem(THEME_KEY, theme);
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.classList.remove('dark', 'light', 'oled', 'tactical_nvg');
        root.classList.add(theme);
        if (theme === 'light') {
          root.style.colorScheme = 'light';
        } else {
          root.style.colorScheme = 'dark';
        }
      }
    } catch (e) {
      console.error('Failed to save theme', e);
    }
  }

  // Manually add face or pet profile
  static addManualProfile(data: {
    name: string;
    subjectType: 'person' | 'animal';
    role: FaceProfile['role'];
    thumbnail: string;
    notes?: string;
  }): FaceProfile {
    const profiles = this.getFaceProfiles();
    const newProfile: FaceProfile = {
      id: `fp-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: data.name,
      subjectType: data.subjectType,
      role: data.role,
      thumbnail: data.thumbnail,
      snapshots: [data.thumbnail],
      clusterId: `cluster-manual-${Date.now().toString(36)}`,
      similarityScore: data.subjectType === 'animal' ? 0 : 0.98,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      notes: data.notes || '',
    };
    profiles.unshift(newProfile);
    this.saveFaceProfiles(profiles);
    return newProfile;
  }

  // Clear all face profiles
  static clearFaceProfiles(): void {
    localStorage.removeItem(FACES_KEY);
  }

  // Purge only unknown face clusters
  static purgeUnknownFaces(): void {
    const profiles = this.getFaceProfiles().filter((p) => p.role !== 'unknown');
    this.saveFaceProfiles(profiles);
  }

  // Purge all DVR recordings
  static purgeRecordings(): void {
    localStorage.removeItem(RECORDINGS_KEY);
  }

  // Reset all settings to defaults
  static resetAllSettings(): void {
    localStorage.removeItem(SETTINGS_KEY);
  }

  // Calculate local storage size
  static getStorageUsage(): {
    totalBytes: number;
    facesBytes: number;
    recordingsBytes: number;
    settingsBytes: number;
    historyBytes: number;
    quotaBytesEstimate: number;
  } {
    let facesBytes = 0;
    let recordingsBytes = 0;
    let settingsBytes = 0;
    let historyBytes = 0;
    let totalBytes = 0;

    try {
      const f = localStorage.getItem(FACES_KEY);
      if (f) facesBytes = new Blob([f]).size;
      const r = localStorage.getItem(RECORDINGS_KEY);
      if (r) recordingsBytes = new Blob([r]).size;
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) settingsBytes = new Blob([s]).size;
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) historyBytes = new Blob([h]).size;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const val = localStorage.getItem(key) || '';
          totalBytes += new Blob([key, val]).size;
        }
      }
    } catch {}

    return {
      totalBytes,
      facesBytes,
      recordingsBytes,
      settingsBytes,
      historyBytes,
      quotaBytesEstimate: 5 * 1024 * 1024, // 5MB standard localStorage quota
    };
  }

  // Full Database Export to JSON
  static exportFullDatabase(): string {
    const bundle = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      faces: this.getFaceProfiles(),
      contacts: this.getEmergencyContacts(),
      recordings: this.getRecordings(),
      history: this.getHistoryEvents(),
      cameras: this.getCameras(),
      settings: this.getSavedSettings(),
      theme: this.getTheme(),
    };
    return JSON.stringify(bundle, null, 2);
  }

  // Full Database Import from JSON
  static importFullDatabase(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.faces && Array.isArray(parsed.faces)) {
        this.saveFaceProfiles(parsed.faces);
      }
      if (parsed.contacts && Array.isArray(parsed.contacts)) {
        this.saveEmergencyContacts(parsed.contacts);
      }
      if (parsed.recordings && Array.isArray(parsed.recordings)) {
        localStorage.setItem(RECORDINGS_KEY, JSON.stringify(parsed.recordings));
      }
      if (parsed.history && Array.isArray(parsed.history)) {
        this.saveHistoryEvents(parsed.history);
      }
      if (parsed.cameras && Array.isArray(parsed.cameras)) {
        this.saveCameras(parsed.cameras);
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        this.saveSettings(parsed.settings);
      }
      if (parsed.theme) {
        this.saveTheme(parsed.theme);
      }
      return true;
    } catch (e) {
      console.error('Database import error:', e);
      return false;
    }
  }
}
