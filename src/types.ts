export type CameraSourceType =
  | 'webcam'
  | 'local'
  | 'screen'
  | 'screenshare'
  | 'wyze'
  | 'ip_cam'
  | 'ip_stream'
  | 'demo_traffic'
  | 'demo_security';

export interface CameraSource {
  id: string;
  name: string;
  type: CameraSourceType;
  status: 'online' | 'connecting' | 'standby' | 'error';
  resolution?: string;
  fps?: number;
  url?: string;
  stream?: MediaStream;
  isRecording?: boolean;
  ptzSupported?: boolean;
  twoWayAudioSupported?: boolean;
  protocol?: 'rtsp' | 'mjpeg' | 'hls' | 'webrtc' | 'http' | 'local';
  model?: string;
  latencyMs?: number;
  bitrateMbps?: number;
  codec?: string;
  ptz?: {
    pan: number; // -180 to 180
    tilt: number; // -90 to 90
    zoom: number; // 1 to 10
  };
  micActive?: boolean;
  nightVisionActive?: boolean;
}

export interface EnvironmentalDetails {
  luxRating: string;
  visibilityMeters: number;
  fogDensityPct: number;
  precipitationRate: string;
  surfaceCondition: string;
  entryPointsSecure: boolean;
  blindSpotsDetected: number;
  ambientNoiseDb: number;
}

export interface SceneAnalysisResult {
  summary: string;
  threatLevel: 'nominal' | 'elevated' | 'critical';
  threatConfidence: number;
  objects: DetectionObject[];
  lightingCondition: string;
  weather: string;
  environmentalDetails?: EnvironmentalDetails;
  architecturalNotes?: string;
  timestamp: number;
}

export type HistoryEventType = 'person_recognized' | 'person_approached' | 'animal_detected' | 'bike_fell' | 'scene_alert' | 'detection';

export interface HistoryEvent {
  id: string;
  timestamp: number;
  cameraId: string;
  cameraName: string;
  type: HistoryEventType;
  title: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
  subjectName?: string;
  confidence?: number;
}

export type SubjectCategory =
  | 'person'
  | 'animal'
  | 'car'
  | 'object'
  | 'threat'
  | 'weather';

export interface CompreFaceSubject {
  subject: string;
  similarity: number;
}

export interface CompreFaceAge {
  probability: number;
  high: number;
  low: number;
}

export interface CompreFaceGender {
  probability: number;
  value: string;
}

export interface CompreFacePose {
  pitch: number;
  roll: number;
  yaw: number;
}

export type BodyPosture = 'sitting' | 'standing' | 'walking' | 'unknown';

export interface BodyLandmark {
  name: 'head' | 'neck' | 'left_shoulder' | 'right_shoulder' | 'left_elbow' | 'right_elbow' | 'left_wrist' | 'right_wrist' | 'left_hip' | 'right_hip' | 'left_knee' | 'right_knee' | 'left_ankle' | 'right_ankle';
  x: number;
  y: number;
  confidence: number;
}

export interface CompreFaceBox {
  probability: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface CompreFaceDetection {
  box: CompreFaceBox;
  subjects?: CompreFaceSubject[];
  age?: CompreFaceAge;
  gender?: CompreFaceGender;
  pose?: CompreFacePose;
  landmarks?: [number, number][];
  emotion?: string;
}

export interface DetectionObject {
  id: string;
  label: string;
  category: SubjectCategory;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height] normalized (0 to 1)
  threatLevel: 'none' | 'warning' | 'critical';
  motionVector: [number, number];
  distanceMeters: number;
  speedMph: number;
  emotion?: 'neutral' | 'alert' | 'friendly' | 'distressed' | 'aggressive';
  isKnown?: boolean;
  nameTag?: string;
  faceId?: string;
  silhouetteColor?: string;
  age?: CompreFaceAge;
  gender?: CompreFaceGender;
  pose?: CompreFacePose;
  landmarks?: [number, number][]; // normalized [x, y] coordinates
  bodyLandmarks?: BodyLandmark[];
  posture?: BodyPosture;
  similarity?: number;
  subjectName?: string;
  targetBbox?: [number, number, number, number];
  silhouetteBbox?: [number, number, number, number];
  targetSilhouetteBbox?: [number, number, number, number];
  lastSeenTime?: number;
  lastPhysicsTime?: number;
}

export interface FaceProfile {
  id: string;
  name: string;
  subjectType: 'person' | 'animal';
  role: '' | 'family' | 'friend' | 'guest' | 'need_permissions' | 'pet' | 'wildlife' | 'intruder' | 'unknown';
  thumbnail: string; // Data URL
  snapshots: string[];
  clusterId: string;
  similarityScore: number;
  firstSeen: number;
  lastSeen: number;
  lastSnapshotAt?: number;
  lastSeenPersistedAt?: number;
  sourceDetectionId?: string;
  notes?: string;
}

export type NightVisionPreset =
  | 'starlight_color'
  | 'hyperion_truecolor'
  | 'thermal_phosphor'
  | 'low_lux_vivid'
  | 'tactical_nir'
  | 'fog_penetration'
  | 'deep_shadow_boost'
  | 'custom';

export interface NightVisionSettings {
  enabled: boolean;
  preset: NightVisionPreset;
  gain: number; // 0.5 to 3.0
  chromaBoost: number; // 0.5 to 3.5
  irPhosphorBalance: number; // 0.0 to 1.0
  spectralDenoise: number; // 0.0 to 1.0
  luminescenceEnhancement: number; // 0.5 to 3.0
  tintHue: number; // 0 to 360
  contrastGamma?: number; // 0.5 to 2.5
  edgeSharpness?: number; // 0.0 to 1.0
}

export interface RedSilhouetteSettings {
  enabled: boolean; // turn detected person or animal completely red
  targetPeople: boolean;
  targetAnimals: boolean;
  opacity: number; // 0.3 to 1.0
  edgePrecision: number; // 1 to 5
  highSpeedTrackingSensitivity: 'ultra_low_latency' | 'balanced' | 'deep_precision';
}

export type ImageProfileType =
  | 'standard'
  | 'tactical_noir'
  | 'starlight_color'
  | 'vivid_surveillance'
  | 'high_contrast_nir'
  | 'forensic_edge';

export type AlertToneType =
  | 'tactical_chime'
  | 'intruder_siren'
  | 'radar_ping'
  | 'subtle_pulse'
  | 'cyber_pulse'
  | 'hypersonic_chirp'
  | 'perimeter_horn';

export interface CategorySensitivity {
  enabled: boolean;
  sensitivity: number; // 0 to 100
  confidenceThreshold: number; // 0.1 to 1.0 (e.g. 0.65)
  highlightColor: string;
  triggerAlert: boolean;
  audibleChime: boolean;
  detectionZone: 'full_frame' | 'central_zone' | 'perimeter_only';
}

export interface DetectionSensitivities {
  /** Enable global-motion suppression only for a physically fixed camera. */
  fixedCameraGuard: boolean;
  objects: CategorySensitivity;
  people: CategorySensitivity;
  threats: CategorySensitivity;
  animals: CategorySensitivity;
  cars: CategorySensitivity;
  weather: CategorySensitivity;
}

export interface AlertNotificationSettings {
  visualBanners: boolean;
  audibleChime: boolean;
  browserPush: boolean;
  criticalThreatSiren: boolean;
  cooldownSeconds: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  alertToneVolume: number; // 0 to 1.0
  customTone: AlertToneType;
  ttsVoiceEnabled: boolean;
  ttsVoiceRate: number;
  ttsVoicePitch: number;
  /** Speak the recognized person's name; off announces "a known person". */
  announceIdentityNames: boolean;
  /** Attach a short looping GIF of the live feed to each alert. */
  gifAlertPreviews: boolean;
  /** How long a corner notification stays on screen before auto-dismissing. */
  bannerDurationSeconds: number;
}

export interface PWASettings {
  offlineCachingEnabled: boolean;
  backgroundSync: boolean;
  offlineFrameBuffer: boolean;
  bufferFrameCount: number;
}

export interface CloudSyncSettings {
  enabled: boolean;
  autoSyncIntervalSec: number;
  p2pSync: boolean;
  endpointUrl: string;
  encryptionKeyFingerprint: string;
  lastSyncTime: number | null;
}

export interface StoragePreferences {
  recordingRetentionDays: number;
  autoPurgeOldRecordings: boolean;
  facialRecognitionMasterEnabled: boolean;
  faceMatchThreshold: number;
}

export type UIThemeMode = 'dark' | 'light' | 'oled' | 'tactical_nvg' | 'pink' | 'lime';

export interface VideoProcessingSettings {
  videoBackgroundErase: boolean;
  upscaling8K: boolean;
  imageProfile: ImageProfileType;
  alertToneEnabled: boolean;
  alertToneType: AlertToneType;
}

export interface AccessibilitySettings {
  visuallyImpairedObstacleOverlay: boolean;
  floorElevationSensor: boolean;
  hapticFeedback: boolean;
  voiceCommandsAndNarration: boolean;
  audioVisualCues: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

export interface AudioVisualCue {
  id: string;
  timestamp: number;
  type: 'impact' | 'speech' | 'status' | 'bark' | 'glass' | 'alarm' | 'footsteps';
  label: string;
  confidence: number;
  dbLevel: number;
  /** Which audio source produced the cue (camera id, 'screen', or 'microphone'). */
  sourceId?: string;
  /** Human-readable name of that source, e.g. "Shared tab" or "Front Door". */
  sourceLabel?: string;
}

/** An audio input the cue pipeline can listen to. */
export interface AudioCueSource {
  id: string;
  label: string;
  stream: MediaStream;
  /** True when this service opened the stream and must release it on stop. */
  owned?: boolean;
}

export interface SavedRecording {
  id: string;
  title: string;
  /** Unlimited user-authored or generated context for the captured scene. */
  sceneDescription?: string;
  timestamp: number;
  durationSeconds: number;
  resolution: '1080p' | '4K' | '8K Super-Res';
  blobUrl: string;
  /** IndexedDB key for the durable video bytes. */
  blobKey?: string;
  thumbnail: string;
  sizeBytes?: number;
  cameraName: string;
  tags: string[];
}

export interface CastServerInfo {
  serverIp: string;
  serverPort: number;
  castRtspUrl: string;
  castHttpMjpegUrl: string;
  castWebRtcUrl: string;
  appUrl: string;
}

export interface LatencyMetrics {
  fps: number;
  renderLatencyMs: number;
  aiInferenceMs: number;
  frameDropCount: number;
}
