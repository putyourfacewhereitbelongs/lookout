import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Shield,
  Eye,
  Moon,
  Volume2,
  Tv,
  QrCode,
  Settings,
  Users,
  Video,
  VideoOff,
  Camera,
  Maximize2,
  Radio,
  Play,
  Square,
  Layers,
  Film,
  Download,
  Compass,
  Sun,
  Palette,
  History as HistoryIcon,
} from 'lucide-react';

import {
  CameraSource,
  DetectionObject,
  NightVisionSettings,
  RedSilhouetteSettings,
  VideoProcessingSettings,
  AccessibilitySettings,
  EmergencyContact,
  SavedRecording,
  FaceProfile,
  DetectionSensitivities,
  AlertNotificationSettings,
  PWASettings,
  CloudSyncSettings,
  StoragePreferences,
  UIThemeMode,
  HistoryEvent,
  AudioVisualCue,
  AudioCueSource,
} from './types';

import { StorageService } from './services/db';
import { audioEngine } from './services/audioEngine';
import { videoProcessor } from './services/videoProcessor';
import { faceRecognitionService } from './services/faceRecognitionService';
import { liveSyncService } from './services/liveSyncService';
import { petRecognitionService } from './services/petRecognitionService';
import { isGlobalCameraMotion } from './services/cameraMotionGuard';
import { alertCenter, PushAlertInput } from './services/alertCenter';
import { captureCanvasGif } from './services/gifEncoder';
import { createFaceThumbnail } from './services/faceThumbnail';

import { PWAInstallButton } from './components/PWAInstallButton';
import { QRCodeModal } from './components/QRCodeModal';
import { CastModal } from './components/CastModal';
import { FaceAlbumModal } from './components/FaceAlbumModal';
import { WyzeControls } from './components/WyzeControls';
import { NightVisionControls } from './components/NightVisionControls';
import { RecordingsLibrary } from './components/RecordingsLibrary';
import { SettingsPanel } from './components/SettingsPanel';
import { AddCameraModal } from './components/AddCameraModal';
import { EventHistoryPanel } from './components/EventHistoryPanel';
import { SceneDetailsPanel, SceneCaptionOverlay } from './components/SceneDetailsPanel';
import { narrateScene } from './services/sceneNarrator';
import { FacePresenceTracker } from './services/faceDetectionGate';
import { audioCueService, captureElementAudio } from './services/audioCueService';
import { AudioCueOverlay } from './components/AudioCueOverlay';
import { CUE_SEVERITY } from './services/audioCueClassifier';
import { AlertToastStack } from './components/AlertToastStack';
import { motion } from 'motion/react';

// Real camera feeds: Local integrated hardware lens and Screen Capture
const INITIAL_CAMERAS: CameraSource[] = [
  {
    id: 'cam-integrated',
    name: 'Integrated HD Camera',
    type: 'local',
    status: 'online',
    isRecording: false,
    fps: 60,
  },
  {
    id: 'cam-screen-01',
    name: 'Screen / Window Capture',
    type: 'screen',
    status: 'online',
    isRecording: false,
    fps: 60,
  },
];

export function App() {
  // State: Cameras
  const [cameras, setCameras] = useState<CameraSource[]>(() => {
    const saved = StorageService.getCameras();
    return saved.length > 0 ? saved : INITIAL_CAMERAS;
  });
  const [activeCamId, setActiveCamId] = useState<string>(cameras[0]?.id || 'cam-integrated');

  // State: Calibration & Settings
  const [nightVision, setNightVision] = useState<NightVisionSettings>(StorageService.getNightVisionSettings());
  const [redSilhouette, setRedSilhouette] = useState<RedSilhouetteSettings>(StorageService.getRedSilhouetteSettings());
  const [videoProcessing, setVideoProcessing] = useState<VideoProcessingSettings>(StorageService.getVideoProcessingSettings());
  const [accessibility, setAccessibility] = useState<AccessibilitySettings>(StorageService.getAccessibilitySettings());
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>(StorageService.getEmergencyContacts());
  const [recordings, setRecordings] = useState<SavedRecording[]>(StorageService.getRecordings());
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>(StorageService.getHistoryEvents());
  const [deliveryPending, setDeliveryPending] = useState(() => typeof window !== 'undefined' && localStorage.getItem('lookout_delivery_pending') === 'true');
  const [deliveryDescription, setDeliveryDescription] = useState('Delivery vehicle or package activity detected; package may be outside the camera view.');
  const [cameraFeedError, setCameraFeedError] = useState('');
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [faceProfiles, setFaceProfiles] = useState<FaceProfile[]>(StorageService.getFaceProfiles());
  const [sceneOverlayEnabled, setSceneOverlayEnabled] = useState(true);

  // Advanced Settings State
  const [detectionSensitivities, setDetectionSensitivities] = useState<DetectionSensitivities>(
    StorageService.getDetectionSensitivities()
  );
  const [alertNotifications, setAlertNotifications] = useState<AlertNotificationSettings>(
    StorageService.getAlertNotificationSettings()
  );
  const [pwaSettings, setPwaSettings] = useState<PWASettings>(
    StorageService.getPWASettings()
  );
  const [cloudSyncSettings, setCloudSyncSettings] = useState<CloudSyncSettings>(
    StorageService.getCloudSyncSettings()
  );
  const [storagePreferences, setStoragePreferences] = useState<StoragePreferences>(
    StorageService.getStoragePreferences()
  );
  const [currentTheme, setCurrentTheme] = useState<UIThemeMode>(
    StorageService.getTheme()
  );
  // Coarse-pointer and narrow-screen devices benefit from lower capture and
  // inference rates. This keeps the live view responsive without changing the
  // desktop DVR pipeline.
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
  );
  const [isBooting, setIsBooting] = useState(true);

  // State: Modals & Panels
  const [showQRModal, setShowQRModal] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const [showFaceAlbum, setShowFaceAlbum] = useState(false);
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [activePanel, setActivePanel] = useState<'none' | 'night_vision' | 'wyze' | 'recordings' | 'history' | 'settings'>('none');

  // State: Detection & Telemetry
  const [detectedObjects, setDetectedObjects] = useState<DetectionObject[]>([]);
  const [audioCues, setAudioCues] = useState<AudioVisualCue[]>([]);
  const [audioSourceNames, setAudioSourceNames] = useState<string[]>([]);
  // Read inside the stream-setup effect so camera acquisition knows whether to
  // ask for an audio track at all.
  // Initialised from the saved setting so the very first camera acquisition
  // on page load already knows whether to ask for an audio track.
  const wantsAudioRef = useRef(accessibility.audioVisualCues);
  const streamStageRef = useRef<HTMLDivElement | null>(null);
  const [isRecordingNow, setIsRecordingNow] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingSceneDescription, setRecordingSceneDescription] = useState('');
  const [fpsDisplay, setFpsDisplay] = useState(60);

  // References
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const autoFaceRecordingRef = useRef(false);
  const lastFaceSeenAtRef = useRef(0);
  const lastLongRangeScanAtRef = useRef(0);
  const lastFaceAlertAtRef = useRef(0);
  const activeCamera = cameras.find((c) => c.id === activeCamId) || cameras[0];
  const eventCooldownsRef = useRef<Map<string, number>>(new Map());
  const faceApproachRef = useRef<Map<string, { baseHeight: number; maxHeight: number; lastSeen: number; approachLogged: boolean }>>(new Map());
  const cameraMotionRef = useRef<{ previous: Uint8Array | null; suppressUntil: number }>({ previous: null, suppressUntil: 0 });
  const motionSampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gifCaptureBusyRef = useRef(false);

  const detectGlobalCameraMotion = useCallback((frame: HTMLCanvasElement) => {
    if (!detectionSensitivities.fixedCameraGuard) return false;
    try {
      const width = 32;
      const height = 18;
      const sampleCanvas = motionSampleCanvasRef.current || document.createElement('canvas');
      motionSampleCanvasRef.current = sampleCanvas;
      if (sampleCanvas.width !== width || sampleCanvas.height !== height) {
        sampleCanvas.width = width;
        sampleCanvas.height = height;
      }
      const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(frame, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const current = new Uint8Array(width * height);
        for (let pixel = 0; pixel < current.length; pixel++) {
          const offset = pixel * 4;
          current[pixel] = Math.round(rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114);
        }
        const previous = cameraMotionRef.current.previous;
        cameraMotionRef.current.previous = current;
        // Local moving subjects affect a smaller part of the frame; require broad,
        // substantial change before treating it as camera movement.
        if (previous && isGlobalCameraMotion(previous, current)) {
          cameraMotionRef.current.suppressUntil = Date.now() + 1800;
        }
      }
    } catch {
      // Cross-origin or unavailable frame pixels should not disable detection.
    }
    return Date.now() < cameraMotionRef.current.suppressUntil;
  }, [detectionSensitivities.fixedCameraGuard]);
  const recordHistoryEvent = useCallback((event: Omit<HistoryEvent, 'id' | 'timestamp' | 'cameraId' | 'cameraName'>, dedupeKey?: string, cooldownMs = 30_000) => {
    const now = Date.now();
    if (dedupeKey) {
      const last = eventCooldownsRef.current.get(dedupeKey) || 0;
      if (now - last < cooldownMs) return;
      eventCooldownsRef.current.set(dedupeKey, now);
    }
    const saved = StorageService.addHistoryEvent({
      ...event,
      id: `event-${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      cameraId: activeCamera?.id || activeCamId,
      cameraName: activeCamera?.name || 'Camera',
    });
    setHistoryEvents(saved);
  }, [activeCamera, activeCamId]);

  /**
   * Raise a corner notification instead of a full-screen takeover. The live
   * feed stays visible, the detected face is shown in the toast, the alert is
   * spoken aloud, and a short looping GIF of the feed is encoded in the
   * background and attached to the same notification when it is ready.
   */
  const notifyAlert = useCallback((input: PushAlertInput & { captureGif?: boolean }) => {
    const { captureGif = true, ...alert } = input;
    const id = alertCenter.push({ cameraName: activeCameraRef.current?.name, ...alert });
    if (!id) return null;

    // Accessibility preferences apply to every raised alert.
    const access = accessibilityRef.current;
    if (access?.hapticFeedback && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(alert.severity === 'critical' ? [120, 60, 120, 60, 200] : alert.severity === 'warning' ? [90, 50, 90] : 60);
    }
    if (access?.voiceCommandsAndNarration && alert.speak !== false) {
      audioEngine.speakSceneDescription(`${alert.title}. ${alert.message}`);
    }

    const canvas = canvasRef.current;
    // Only one capture runs at a time so overlapping alerts cannot stack
    // several per-frame pixel reads on top of the live render loop.
    if (!captureGif || !canvas || !alertNotifications.gifAlertPreviews || gifCaptureBusyRef.current) return id;
    gifCaptureBusyRef.current = true;
    alertCenter.markGifPending(id);
    captureCanvasGif(canvas, {
      frameCount: isPhone ? 10 : 14,
      intervalMs: isPhone ? 110 : 90,
      maxWidth: isPhone ? 240 : 320,
      maxColors: isPhone ? 96 : 128,
    })
      .then((gifUrl) => alertCenter.attachGif(id, gifUrl))
      .catch((error) => {
        console.warn('Alert GIF capture failed:', error);
        alertCenter.failGif(id);
      })
      .finally(() => { gifCaptureBusyRef.current = false; });
    return id;
  }, [alertNotifications.gifAlertPreviews, isPhone]);

  // Keep the alert engine in sync with the saved notification preferences.
  useEffect(() => { alertCenter.setSettings(alertNotifications); }, [alertNotifications]);

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setIsBooting(false), 900);
    liveSyncService.connect();
    const unsubscribe = liveSyncService.subscribe((payload) => {
      try {
        const state = JSON.parse(payload);
        if (Array.isArray(state.faces)) {
          StorageService.saveFaceProfiles(state.faces);
          setFaceProfiles(state.faces);
        }
      } catch { /* Ignore invalid peer state. */ }
    });
    return () => { window.clearTimeout(splashTimer); unsubscribe(); };
  }, []);

  useEffect(() => {
    liveSyncService.publish(JSON.stringify({ faces: faceProfiles }));
  }, [faceProfiles]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)');
    const updateDeviceMode = () => setIsPhone(mediaQuery.matches);
    updateDeviceMode();
    mediaQuery.addEventListener?.('change', updateDeviceMode);
    return () => mediaQuery.removeEventListener?.('change', updateDeviceMode);
  }, []);

  // Restore video bytes from IndexedDB after the lightweight recording metadata
  // has loaded from localStorage. Object URLs are session-only, so this is what
  // makes DVR clips playable after a page reload.
  useEffect(() => {
    let active = true;
    StorageService.hydrateRecordings(StorageService.getRecordings()).then((saved) => {
      if (active) setRecordings(saved);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const deliverySubject = detectedObjects.find((object) => /(?:ups|u\.?s\.?ps|fed.?ex|amazon|usps|postal|mail|delivery|courier|package|parcel|box|truck|van)/i.test(`${object.label} ${object.nameTag || ''}`));
    if (!deliverySubject || deliveryPending) return;
    const description = /package|parcel|box/i.test(deliverySubject.label)
      ? 'Package activity detected; it may have been placed outside the current camera view.'
      : `${deliverySubject.label} detected; a delivery package may arrive or be placed outside the camera view.`;
    setDeliveryDescription(description);
    setDeliveryPending(true);
    localStorage.setItem('lookout_delivery_pending', 'true');
    notifyAlert({
      title: 'Delivery activity detected',
      message: description,
      severity: 'warning',
      tone: 'perimeter_horn',
      dedupeKey: 'delivery',
      cooldownMs: 120_000,
      speech: 'Delivery activity detected. A package may have been left outside the camera view.',
    });
  }, [detectedObjects, deliveryPending, notifyAlert]);

  // Save changes to local database
  useEffect(() => {
    StorageService.saveCameras(cameras);
  }, [cameras]);

  useEffect(() => {
    StorageService.saveNightVisionSettings(nightVision);
  }, [nightVision]);

  useEffect(() => {
    StorageService.saveRedSilhouetteSettings(redSilhouette);
  }, [redSilhouette]);

  useEffect(() => {
    StorageService.saveVideoProcessingSettings(videoProcessing);
  }, [videoProcessing]);

  useEffect(() => {
    StorageService.saveAccessibilitySettings(accessibility);
  }, [accessibility]);

  useEffect(() => {
    StorageService.saveDetectionSensitivities(detectionSensitivities);
  }, [detectionSensitivities]);

  useEffect(() => {
    StorageService.saveAlertNotificationSettings(alertNotifications);
  }, [alertNotifications]);

  useEffect(() => {
    StorageService.savePWASettings(pwaSettings);
  }, [pwaSettings]);

  useEffect(() => {
    StorageService.saveCloudSyncSettings(cloudSyncSettings);
  }, [cloudSyncSettings]);

  useEffect(() => {
    StorageService.saveStoragePreferences(storagePreferences);
  }, [storagePreferences]);

  useEffect(() => {
    StorageService.saveTheme(currentTheme);
  }, [currentTheme]);

  // Request actual camera stream if local or screen
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    setCameraFeedError('');

    const attachStream = (stream: MediaStream) => {
      const video = videoElementRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadeddata = () => setCameraFeedError('');
        video.play().catch((error) => {
          setCameraFeedError(error instanceof Error ? error.message : 'The browser could not start video playback.');
        });
      }
    };

    const setupStream = async () => {
      if (activeCamera.stream) {
        attachStream(activeCamera.stream);
      } else if (activeCamera.type === 'local') {
        try {
          const video = isPhone
            ? { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } };
          let s: MediaStream;
          try {
            // Capture camera audio only when the sound-cue feature is on, so
            // the microphone is never opened for users who have not asked.
            s = await navigator.mediaDevices.getUserMedia({
              video,
              audio: wantsAudioRef.current
                ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                : false,
            });
          } catch {
            // Preserve the camera feed on devices without an available microphone.
            s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
          }
          currentStream = s;
          attachStream(s);
        } catch (e) {
          console.warn('Local webcam fallback: synthetic feed active', e);
          const error = e as DOMException;
          setCameraFeedError(error?.name === 'NotAllowedError'
            ? 'Camera permission was blocked. Enable it for this site, then retry.'
            : error?.name === 'NotFoundError'
              ? 'No camera device was found. Connect a camera or choose another channel.'
              : error?.name === 'NotReadableError'
                ? 'The camera is busy in another app. Close that app, then retry.'
                : 'The browser could not open the camera. Check site and operating-system camera permissions.');
        }
      } else if (activeCamera.type === 'screen') {
        try {
          // Requesting audio makes the browser offer the "share tab audio"
          // checkbox, which is what feeds the acoustic classifier.
          const s = await navigator.mediaDevices.getDisplayMedia({
            video: isPhone ? { frameRate: { ideal: 30, max: 30 } } : { frameRate: { ideal: 60 } },
            audio: wantsAudioRef.current,
          });
          currentStream = s;
          attachStream(s);
        } catch (e) {
          console.warn('Screen share cancelled or not allowed', e);
          setCameraFeedError('Screen sharing was cancelled or blocked. Retry and choose a screen or window.');
        }
      }
    };

    setupStream();

    return () => {
      const video = videoElementRef.current;
      if (video) {
        video.onloadeddata = null;
        if (video.srcObject === currentStream) video.srcObject = null;
      }
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [activeCamId, activeCamera, cameraRetryKey, isPhone, accessibility.audioVisualCues]);

  // References for the lightweight render pipeline
  const detectedObjectsRef = useRef<DetectionObject[]>([]);
  const activeCameraRef = useRef(activeCamera);
  const nightVisionRef = useRef(nightVision);
  const redSilhouetteRef = useRef(redSilhouette);
  const videoProcessingRef = useRef(videoProcessing);
  const accessibilityRef = useRef(accessibility);

  const camerasRef = useRef(cameras);
  // Confirms a face across consecutive recognition scans before the app
  // reacts to it, which is what prevents empty-scene "face detected" alerts.
  const facePresenceRef = useRef(new FacePresenceTracker());

  useEffect(() => { activeCameraRef.current = activeCamera; }, [activeCamera]);
  useEffect(() => { camerasRef.current = cameras; }, [cameras]);
  useEffect(() => { wantsAudioRef.current = accessibility.audioVisualCues; }, [accessibility.audioVisualCues]);
  useEffect(() => { nightVisionRef.current = nightVision; }, [nightVision]);
  useEffect(() => { redSilhouetteRef.current = redSilhouette; }, [redSilhouette]);
  useEffect(() => { videoProcessingRef.current = videoProcessing; }, [videoProcessing]);
  useEffect(() => { accessibilityRef.current = accessibility; }, [accessibility]);

  // Run the 30 FPS render and tracking pipeline on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    videoProcessor.init(canvas);

    let animationFrameId: number;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let lastSyncTime = 0;
    let lastRenderTime = 0;
    const renderInterval = 1000 / 30;

    const loop = (timestamp: number) => {
      // A 30fps presentation loop leaves CPU time for face recognition. Camera
      // capture can still run faster without redrawing the full canvas at 60fps.
      if (renderInterval && timestamp - lastRenderTime < renderInterval) {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }
      lastRenderTime = timestamp;

      detectedObjectsRef.current = faceRecognitionService.stepPhysicsTracking(detectedObjectsRef.current);

      // Render frame with shaders, edge detection, red silhouette, biometric landmarks & HUD
      videoProcessor.renderFrame(
        videoElementRef.current,
        activeCameraRef.current,
        detectedObjectsRef.current,
        nightVisionRef.current,
        redSilhouetteRef.current,
        videoProcessingRef.current,
        accessibilityRef.current
      );

      // Display FPS counter update
      frameCount++;
      const now = timestamp;
      if (now - lastFpsTime >= 1000) {
        setFpsDisplay(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      // Sync tracked objects back to React state periodically (every 250ms) without frame drops
      if (now - lastSyncTime >= 250) {
        lastSyncTime = now;
        setDetectedObjects([...detectedObjectsRef.current]);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPhone]);

  const syncFaceTriggeredDvr = (faceDetected: boolean) => {
    const now = Date.now();
    if (faceDetected) {
      lastFaceSeenAtRef.current = now;
      if (!autoFaceRecordingRef.current && (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive')) {
        document.getElementById('record-toggle-btn')?.click();
        autoFaceRecordingRef.current = true;
        audioEngine.playAlertTone('perimeter_horn', 1);
      }
      if (now - lastFaceAlertAtRef.current > 3500) {
        lastFaceAlertAtRef.current = now;
        notifyAlert({
          title: 'Face detected',
          message: 'A face entered the scene and DVR recording started automatically.',
          severity: 'info',
          dedupeKey: 'dvr-face-start',
          cooldownMs: 20_000,
          playTone: false,
          speak: false,
          durationMs: 5000,
        });
      }
    } else if (autoFaceRecordingRef.current && now - lastFaceSeenAtRef.current > 2400) {
      document.getElementById('record-toggle-btn')?.click();
      autoFaceRecordingRef.current = false;
      audioEngine.playAlertTone('radar_ping', 1);
      notifyAlert({
        title: 'Scene clear',
        message: 'The face left the view and the DVR clip is being saved.',
        severity: 'info',
        dedupeKey: 'dvr-face-end',
        cooldownMs: 20_000,
        playTone: false,
        speak: false,
        durationMs: 4000,
        captureGif: false,
      });
    }
  };

  // Continuous CompreFace Facial Recognition Cycle:
  // Low-latency neural face recognition via CompreFace proxy,
  // identifies registered subjects ("Brian", "Heather", "Malcolm", etc.), and always follows the person.
  useEffect(() => {
    let isMounted = true;
    let timer: any = null;
    // Switching cameras must not inherit the previous view's confirmations.
    facePresenceRef.current.reset();

    const runCompreFaceRecognitionCycle = async () => {
      if (!isMounted) return;
      if (!storagePreferences.facialRecognitionMasterEnabled) {
        timer = setTimeout(runCompreFaceRecognitionCycle, isPhone ? 800 : 400);
        return;
      }

      const video = videoElementRef.current;
      let snapshotBase64 = '';
      let snapW = 640;
      let snapH = 270;
      let recognitionCanvas: HTMLCanvasElement | null = null;

      // Keep normal recognition inexpensive. On the scheduled long-range pass,
      // preserve materially more of the desktop camera's native detail before
      // splitting it into enlarged face tiles. Phones retain their lighter
      // capture policy for live responsiveness.
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const offscreen = document.createElement('canvas');
        recognitionCanvas = offscreen;
        // Keep recognition detailed enough for small faces while staying below
        // the expensive full-resolution camera frame.
        const maximumWidth = isPhone ? 960 : 1280;
        snapW = Math.min(maximumWidth, video.videoWidth);
        snapH = Math.round((snapW * video.videoHeight) / video.videoWidth);
        offscreen.width = snapW;
        offscreen.height = snapH;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(video, 0, 0, snapW, snapH);
          snapshotBase64 = offscreen.toDataURL('image/jpeg', isPhone ? 0.82 : 0.90);
        }
      }

      if (!snapshotBase64) {
        // No frame means no evidence of anyone; clear accumulated presence so
        // a resumed feed must re-confirm from scratch.
        facePresenceRef.current.reset();
        syncFaceTriggeredDvr(false);
        if (isMounted) timer = setTimeout(runCompreFaceRecognitionCycle, isPhone ? 600 : 350);
        return;
      }

      if (recognitionCanvas && detectGlobalCameraMotion(recognitionCanvas)) {
        if (isMounted) timer = setTimeout(runCompreFaceRecognitionCycle, isPhone ? 360 : 120);
        return;
      }

      try {
        const useLongRange = recognitionCanvas && Date.now() - lastLongRangeScanAtRef.current > 1800;
        if (useLongRange) lastLongRangeScanAtRef.current = Date.now();
        let detections = useLongRange && recognitionCanvas
          ? await faceRecognitionService.recognizeAtLongRange(snapshotBase64, recognitionCanvas)
          : await faceRecognitionService.recognize(snapshotBase64, snapW, snapH);
        // Borderline identities get a second independent inference on the same
        // high-resolution frame. A name survives only when both checks agree;
        // a disagreement becomes an unknown face instead of a false alert.
        const needsSecondCheck = detections.some((detection) => (detection.subjects?.[0]?.similarity || 0) < 0.96 && (detection.subjects?.length || 0) > 0);
        if (needsSecondCheck) {
          const secondPass = await faceRecognitionService.recognize(snapshotBase64, snapW, snapH);
          detections = detections.map((detection) => {
            const firstSubject = detection.subjects?.[0];
            if (!firstSubject || firstSubject.similarity >= 0.96) return detection;
            const corroborating = secondPass.find((candidate) => {
              const secondSubject = candidate.subjects?.[0];
              const firstCenter = [(detection.box.x_min + detection.box.x_max) / 2, (detection.box.y_min + detection.box.y_max) / 2];
              const secondCenter = [(candidate.box.x_min + candidate.box.x_max) / 2, (candidate.box.y_min + candidate.box.y_max) / 2];
              return secondSubject?.subject.toLowerCase() === firstSubject.subject.toLowerCase() && Math.hypot(firstCenter[0] - secondCenter[0], firstCenter[1] - secondCenter[1]) < 90;
            });
            return corroborating ? { ...detection, subjects: [corroborating.subjects![0]] } : { ...detection, subjects: [] };
          });
        }
        // A real person appears in consecutive scans at a consistent place;
        // detector pareidolia on foliage, wood grain, or sensor noise flickers
        // in and out. Only confirmed faces may drive alerts, DVR, or tracking.
        const presence = facePresenceRef.current.update(detections);
        detections = presence.confirmed;
        syncFaceTriggeredDvr(presence.facePresent);

        const cameraMotionActive = detectionSensitivities.fixedCameraGuard && Date.now() < cameraMotionRef.current.suppressUntil;
        if (isMounted && !cameraMotionActive) {
          // Correlate with tracked objects and update positions and labels
          const updated = faceRecognitionService.correlateDetections(
            detectedObjectsRef.current,
            detections,
            snapW,
            snapH,
            Math.max(0.97, storagePreferences.faceMatchThreshold || 0.92),
            StorageService.getFaceProfiles().filter((profile) => profile.subjectType === 'animal').map((profile) => profile.name)
          );
          detectedObjectsRef.current = updated;
          setDetectedObjects([...updated]);

          // Update face profiles catalog: record last seen timestamp or catalog unknown faces
          for (const d of detections) {
            const topSubj = d.subjects && d.subjects.length > 0 ? d.subjects[0] : null;
            if (topSubj && faceRecognitionService.isConservativeMatch(d, storagePreferences.faceMatchThreshold || 0.92)) {
              const matchedProfile = StorageService.getFaceProfiles().find((profile) => profile.name.toLowerCase() === topSubj.subject.toLowerCase());
              const isIntruder = matchedProfile?.role === 'intruder';
              StorageService.updateFaceLastSeenByName(topSubj.subject);
              // The notification shows the face that triggered it, so crop a
              // small avatar straight from the sharpest available source.
              const identityThumbnail = createFaceThumbnail({
                box: d.box,
                frameWidth: snapW,
                frameHeight: snapH,
                video,
                fallback: recognitionCanvas,
                outputSize: 256,
                quality: 0.86,
              });
              if (isIntruder) {
                notifyAlert({
                  title: `Intruder identified: ${topSubj.subject}`,
                  message: `${topSubj.subject} is flagged as an intruder and is present in the camera view.`,
                  severity: 'critical',
                  subjectName: topSubj.subject,
                  confidence: topSubj.similarity,
                  faceImage: identityThumbnail,
                  tone: 'intruder_siren',
                  dedupeKey: `intruder:${topSubj.subject.toLowerCase()}`,
                  cooldownMs: 30_000,
                  speech: `Warning. ${topSubj.subject} has been identified and is flagged as an intruder.`,
                });
              }
              const identityKey = `${activeCamId}:${topSubj.subject.toLowerCase()}`;
              const now = Date.now();
              const faceHeight = Math.max(0, d.box.y_max - d.box.y_min) / snapH;
              const previous = faceApproachRef.current.get(identityKey);
              if (!previous || now - previous.lastSeen > 15_000) {
                faceApproachRef.current.set(identityKey, { baseHeight: faceHeight, maxHeight: faceHeight, lastSeen: now, approachLogged: false });
                recordHistoryEvent({
                  type: 'person_recognized', title: `${topSubj.subject} recognized`,
                  details: `${topSubj.subject} was matched to a saved face profile and appeared in the camera view.`,
                  severity: 'info', subjectName: topSubj.subject,
                  confidence: topSubj.similarity,
                }, `face:${identityKey}`, 60_000);
                if (!isIntruder) notifyAlert({
                  title: `${topSubj.subject} identified`,
                  message: `${topSubj.subject} was matched to a saved face profile and is present in the scene.`,
                  severity: 'info',
                  subjectName: topSubj.subject,
                  confidence: topSubj.similarity,
                  faceImage: identityThumbnail,
                  dedupeKey: `identity:${identityKey}`,
                  cooldownMs: 60_000,
                });
              } else {
                const approached = !previous.approachLogged && previous.baseHeight > 0 && faceHeight >= previous.baseHeight * 1.5 && faceHeight - previous.baseHeight >= 0.035;
                faceApproachRef.current.set(identityKey, {
                  ...previous,
                  maxHeight: Math.max(previous.maxHeight, faceHeight),
                  baseHeight: now - previous.lastSeen > 60_000 ? faceHeight : previous.baseHeight,
                  lastSeen: now,
                  approachLogged: previous.approachLogged || approached,
                });
                if (approached) recordHistoryEvent({
                  type: 'person_approached', title: `${topSubj.subject} walked closer to the camera`,
                  details: `The recognized face grew substantially in the frame over successive observations, consistent with ${topSubj.subject} approaching the camera.`,
                  severity: 'info', subjectName: topSubj.subject,
                  confidence: topSubj.similarity,
                }, `approach:${identityKey}`, 60_000);
                if (approached) notifyAlert({
                  title: `${topSubj.subject} is approaching`,
                  message: `${topSubj.subject} moved noticeably closer to the camera.`,
                  severity: 'warning',
                  subjectName: topSubj.subject,
                  confidence: topSubj.similarity,
                  faceImage: identityThumbnail,
                  dedupeKey: `approach-alert:${identityKey}`,
                  cooldownMs: 60_000,
                  speech: `${topSubj.subject} is approaching the camera.`,
                });
              }
            } else {
              const faceCrop = createFaceThumbnail({
                box: d.box,
                frameWidth: snapW,
                frameHeight: snapH,
                video,
                fallback: recognitionCanvas,
                outputSize: 1024,
                quality: 0.94,
              });
              // Animal profiles are recognized locally against their enrolled
              // reference photos, independently of CompreFace's human-face
              // database. This turns the existing animal album into a true pet
              // recognition path rather than only a manual label.
              if (faceCrop) {
                const petMatch = await petRecognitionService.match(faceCrop, StorageService.getFaceProfiles());
                if (petMatch) {
                  const animalDetection = {
                    ...d,
                    subjects: [{ subject: petMatch.profile.name, similarity: petMatch.similarity }],
                  };
                  const animalUpdated = faceRecognitionService.correlateDetections(
                    detectedObjectsRef.current,
                    [animalDetection],
                    snapW,
                    snapH,
                    0.85,
                    StorageService.getFaceProfiles().filter((profile) => profile.subjectType === 'animal').map((profile) => profile.name)
                  );
                  detectedObjectsRef.current = animalUpdated;
                  setDetectedObjects([...animalUpdated]);
                  StorageService.updateFaceLastSeenByName(petMatch.profile.name);
                  recordHistoryEvent({
                    type: 'animal_detected',
                    title: `${petMatch.profile.name} recognized`,
                    details: `${petMatch.profile.name} was recognized locally from its enrolled animal reference photos.`,
                    severity: 'info',
                    subjectName: petMatch.profile.name,
                    confidence: petMatch.similarity,
                  }, `animal:${activeCamId}:${petMatch.profile.name}`, 60_000);
                  notifyAlert({
                    title: `${petMatch.profile.name} recognized`,
                    message: `${petMatch.profile.name} was recognized locally from its enrolled animal photos.`,
                    severity: 'info',
                    subjectName: petMatch.profile.name,
                    confidence: petMatch.similarity,
                    faceImage: faceCrop,
                    dedupeKey: `animal-alert:${activeCamId}:${petMatch.profile.name}`,
                    cooldownMs: 60_000,
                    speech: `${petMatch.profile.name} has been identified in the monitored area.`,
                  });
                  continue;
                }
              }
              StorageService.catalogUnknownFace(
                'Unknown Subject',
                'person',
                'Face captured from CompreFace detection. Review and assign to a person, or save it as an animal profile for local pet recognition.',
                faceCrop
              );
              notifyAlert({
                title: 'Unidentified person detected',
                message: 'An unknown face was captured and saved to the face album for review.',
                severity: 'warning',
                faceImage: faceCrop,
                dedupeKey: `unknown-face:${activeCamId}`,
                cooldownMs: 45_000,
                speech: 'An unidentified person has been detected.',
              });
            }
          }
          setFaceProfiles(StorageService.getFaceProfiles());
        }
      } catch (err) {
        console.warn('Face recognition cycle error:', err);
      }

      if (isMounted) {
        // Avoid serializing oversized frames faster than the remote recognizer
        // can consume them; latency depends on one request's completion time.
        timer = setTimeout(runCompreFaceRecognitionCycle, isPhone ? 500 : 120);
      }
    };

    timer = setTimeout(runCompreFaceRecognitionCycle, isPhone ? 700 : 250);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [storagePreferences.facialRecognitionMasterEnabled, storagePreferences.faceMatchThreshold, activeCamId, detectionSensitivities.fixedCameraGuard, recordHistoryEvent, detectGlobalCameraMotion, notifyAlert, isPhone]);

  // --- Audio-visual sound cues -------------------------------------------
  // Microphone capture runs only while the accessibility setting is enabled,
  // and is torn down the moment it is switched off.
  useEffect(() => {
    if (!accessibility.audioVisualCues) {
      audioCueService.stop();
      return;
    }

    let cancelled = false;
    const unsubscribe = audioCueService.onCue((cue) => {
      if (cancelled) return;
      setAudioCues((prev) => [cue, ...prev].slice(0, 40));

      const severity = CUE_SEVERITY[cue.type];
      recordHistoryEvent(
        {
          type: 'scene_alert',
          title: cue.label,
          details: `Detected acoustically at ${cue.dbLevel.toFixed(0)} dBFS with ${Math.round(cue.confidence * 100)}% confidence.`,
          severity,
          confidence: cue.confidence,
        },
        `audio-cue-${cue.type}`,
        8000,
      );

      // Only the genuinely urgent classes raise a toast; speech and footsteps
      // would otherwise fire constantly in a busy space.
      if (severity === 'critical' || cue.type === 'impact') {
        notifyAlert({
          title: cue.label,
          message: `Sound detected on ${activeCameraRef.current?.name || 'the active camera'} at ${cue.dbLevel.toFixed(0)} dBFS.`,
          severity,
          speak: accessibility.voiceCommandsAndNarration,
          playTone: true,
          captureGif: false,
          durationMs: 7000,
        });
      }
    });

    // Collect every audio-bearing source: the shared tab/screen or webcam
    // attached to the active camera, any added camera that carries its own
    // audio track, and network/demo feeds whose audio lives on the <video>
    // element. The microphone is used only if none of those provide audio.
    const collectSources = (): AudioCueSource[] => {
      const sources: AudioCueSource[] = [];
      const seen = new Set<MediaStream>();

      const push = (id: string, label: string, stream: MediaStream | null | undefined) => {
        if (!stream || seen.has(stream) || stream.getAudioTracks().length === 0) return;
        seen.add(stream);
        sources.push({ id, label, stream, owned: false });
      };

      const live = videoElementRef.current?.srcObject as MediaStream | null;
      const active = activeCameraRef.current;
      push(active?.id || 'active', active?.name || 'Active camera', live);

      // Network, Wyze, and demo feeds play from a URL, so their audio is only
      // reachable by capturing the media element itself.
      if (!live) push(`${active?.id || 'active'}-element`, active?.name || 'Active camera', captureElementAudio(videoElementRef.current));

      camerasRef.current.forEach((camera) => {
        if (camera.stream) push(camera.id, camera.name, camera.stream);
      });

      return sources;
    };

    const syncSources = () => {
      const sources = collectSources();
      void audioCueService.start(sources, true).then(() => {
        if (cancelled) return;
        setAudioSourceNames(audioCueService.activeSources.map((source) => source.label));
      });
    };

    syncSources();
    // Re-scan periodically so a tab shared (or stopped) mid-session is picked
    // up without the user having to toggle the setting.
    const rescan = window.setInterval(syncSources, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(rescan);
      unsubscribe();
      audioCueService.stop();
      setAudioSourceNames([]);
    };
  }, [accessibility.audioVisualCues, accessibility.voiceCommandsAndNarration, activeCamId, recordHistoryEvent, notifyAlert]);

  // Recording Clock Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecordingNow) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecordingNow]);

  // Rich narration of what is actually on screen and who, derived from every
  // attribute the recognition pipeline attaches to a detection.
  const sceneNarration = useMemo(
    () =>
      narrateScene(detectedObjects, {
        cameraName: activeCamera.name,
        faceProfiles,
        nightVisionEnabled: nightVision.enabled,
      }),
    [detectedObjects, activeCamera.name, faceProfiles, nightVision.enabled],
  );

  const buildSceneDescription = () => sceneNarration.detailed;

  const liveSceneDetails = sceneNarration.summary;

  // Handle Recording Toggle (captures the lightweight 30 FPS display stream)
  const handleToggleRecord = () => {
    if (!isRecordingNow) {
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          const stream = canvas.captureStream(30);
          recordedChunksRef.current = [];
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : '';
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          recorder.start(400);
          mediaRecorderRef.current = recorder;
        } catch (err) {
          console.warn('MediaRecorder canvas stream capture fallback:', err);
        }
      }
      setIsRecordingNow(true);
      audioEngine.playAlertTone('tactical_chime');
    } else {
      setIsRecordingNow(false);
      const recorder = mediaRecorderRef.current;
      const canvas = canvasRef.current;
      const thumb = canvas ? canvas.toDataURL('image/jpeg', 0.8) : '';

      const saveClip = (finalUrl: string, finalSize: number, blob?: Blob) => {
        const sceneDescription = recordingSceneDescription.trim() || buildSceneDescription();
        const newRec: SavedRecording = {
          id: `rec-${Date.now()}`,
          title: sceneDescription,
          sceneDescription,
          timestamp: Date.now(),
          durationSeconds: Math.max(1, recordingSeconds),
          resolution: '4K',
          blobUrl: finalUrl,
          thumbnail: thumb,
          sizeBytes: finalSize,
          cameraName: activeCamera.name,
          tags: ['DVR Event', 'Telemetry Burn', '30 FPS', 'Scene Description'],
        };
        StorageService.saveRecording(newRec, blob);
        // Keep the live object URL for immediate playback; IndexedDB stores the
        // durable copy used to restore it after reload.
        setRecordings((previous) => [newRec, ...previous].slice(0, 50));
        audioEngine.speakSceneDescription(`DVR clip saved: ${sceneDescription}`);
      };

      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
          if (blob.size === 0) {
            audioEngine.speakSceneDescription('DVR could not save a video because the recorder returned no data.');
            return;
          }
          const videoUrl = URL.createObjectURL(blob);
          saveClip(videoUrl, blob.size, blob);
        };
        recorder.stop();
      } else {
        audioEngine.speakSceneDescription('DVR is unavailable: no video recorder stream was created.');
      }
    }
  };

  // Export 4K Forensic Master Snapshot
  const handleTake4KSnapshot = () => {
    const displayCanvas = canvasRef.current;
    const video = videoElementRef.current;
    if (!displayCanvas) return;

    // Prefer native camera pixels for the still. The display canvas is an HD
    // presentation surface, not the source image, so exporting it would soften
    // a high-resolution camera unnecessarily.
    const source = video && video.readyState >= 2 && video.videoWidth > 0 ? video : displayCanvas;
    const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    const k4Canvas = document.createElement('canvas');
    k4Canvas.width = 3840;
    k4Canvas.height = Math.round(3840 * sourceHeight / Math.max(1, sourceWidth));
    const ctx = k4Canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, k4Canvas.width, k4Canvas.height);

      const link = document.createElement('a');
      link.download = `LOOKOUT_4K_${Date.now()}.png`;
      link.href = k4Canvas.toDataURL('image/png');
      link.click();
      audioEngine.playAlertTone('radar_ping');
    }
  };

  // Wyze PTZ Handlers
  const handlePtzChange = (pan: number, tilt: number, zoom: number) => {
    setCameras((prev) =>
      prev.map((c) => (c.id === activeCamId ? { ...c, ptz: { pan, tilt, zoom } } : c))
    );
  };

  const handleWyzeMicToggle = (active: boolean) => {
    setCameras((prev) =>
      prev.map((c) => (c.id === activeCamId ? { ...c, micActive: active } : c))
    );
    if (active) {
      audioEngine.playAlertTone('radar_ping');
    }
  };

  const handleWyzeSiren = () => {
    audioEngine.playAlertTone('intruder_siren');
  };

  const handleAddCamera = (newCam: CameraSource) => {
    setCameras((prev) => [...prev, newCam]);
    setActiveCamId(newCam.id);
  };

  const getThemeClass = (theme: UIThemeMode) => {
    switch (theme) {
      case 'oled':
        return 'bg-black text-white selection:bg-emerald-500 selection:text-black';
      case 'tactical_nvg':
        return 'bg-zinc-950 text-red-100 selection:bg-red-600 selection:text-white';
      case 'light':
        return 'bg-slate-100 text-slate-900 selection:bg-cyan-500 selection:text-white';
      case 'pink':
        return 'bg-fuchsia-950 text-fuchsia-50 selection:bg-pink-500 selection:text-white';
      case 'lime':
        return 'bg-lime-950 text-lime-50 selection:bg-lime-500 selection:text-black';
      default:
        return 'bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-black';
    }
  };


  const captureLiveVideoFrame = (maxWidth = isPhone ? 960 : 2560) => {
    const video = videoElementRef.current;
    if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    const width = Math.min(maxWidth, video.videoWidth);
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    const context = frame.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    return { imageBase64: frame.toDataURL('image/jpeg', isPhone ? 0.84 : 0.90), width, height, canvas: frame };
  };

  /** Short status toast used by the manual scan controls. */
  const showScanFeedback = (message: string) => {
    notifyAlert({
      title: 'Face scan',
      message,
      severity: 'info',
      speak: false,
      playTone: false,
      durationMs: 6000,
      captureGif: false,
    });
  };

  return (
    <div className={`app-shell min-h-screen flex flex-col font-sans select-none overflow-x-hidden ${getThemeClass(currentTheme)}`}>
      {isBooting && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-center text-white transition-opacity duration-500"><div><div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-fuchsia-500 border-t-lime-300" /><p className="font-mono text-sm font-bold tracking-[0.3em] text-fuchsia-300">LOOKOUT AI</p><p className="mt-2 text-xs text-slate-500">Loading local camera intelligence…</p></div></div>}
      {/* Hidden background video element to pipe camera feeds to canvas */}
      <video ref={videoElementRef} className="hidden" playsInline muted autoPlay />
      {/* Non-blocking corner notifications: face preview, animated GIF of the
          feed, and a spoken announcement of who was identified. */}
      <AlertToastStack />

      {/* TOP PERSISTENT NAVIGATION BAR */}
      <header className="app-header sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/90 px-3 py-2.5 shadow-lg backdrop-blur-md sm:flex-nowrap sm:px-4">
        {/* Brand & System Status */}
        <div className="flex items-center gap-2 shrink-0 sm:gap-3">
          <div className="rounded-xl border border-cyan-800 bg-cyan-950/80 p-1.5 text-cyan-400 shadow-sm shadow-cyan-950 sm:p-2">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white font-mono">
                LOOKOUT <span className="text-cyan-400">AI</span>
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                DVR v2.5
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-emerald-800 bg-emerald-950 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="min-[390px]:hidden">LIVE</span>
                <span className="hidden min-[390px]:inline">LOCAL DVR</span>
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden md:block">
              Neural Threat, Facial Clustering, Starlight Vision & IP Casting
            </p>
          </div>
        </div>

        {/* Action Controls Toolbar - Persistent and Horizontally Scrollable on Mobile & Desktop */}
        <div className="flex w-full min-w-0 flex-1 items-center justify-start gap-2 overflow-x-auto py-1 no-scrollbar sm:w-auto sm:justify-end">
          {/* Quick Theme Mode Toggle */}
          <button
            onClick={() => {
              const cycle: UIThemeMode[] = ['pink', 'lime', 'oled', 'dark', 'tactical_nvg', 'light'];
              const next = cycle[(cycle.indexOf(currentTheme) + 1) % cycle.length];
              setCurrentTheme(next);
            }}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-400 transition flex items-center gap-1.5 font-mono text-xs shrink-0"
            title={`Current Theme: ${currentTheme.toUpperCase()} (Click to toggle)`}
          >
            {currentTheme === 'light' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : currentTheme === 'tactical_nvg' ? (
              <Palette className="w-4 h-4 text-red-400" />
            ) : currentTheme === 'oled' ? (
              <Moon className="w-4 h-4 text-emerald-400" />
            ) : (
              <Moon className="w-4 h-4 text-cyan-400" />
            )}
            <span className="hidden xl:inline uppercase">{currentTheme.replace('_', ' ')}</span>
          </button>

          {/* Share by QR Code */}
          <button
            id="share-qr-btn"
            onClick={() => setShowQRModal(true)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 transition flex items-center gap-1.5 font-mono text-xs shrink-0"
            title="Share app by QR Code"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">QR SYNC</span>
          </button>

          {/* Cast as IP Camera */}
          <button
            id="cast-ip-btn"
            onClick={() => setShowCastModal(true)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 transition flex items-center gap-1.5 font-mono text-xs shrink-0"
            title="Broadcast camera as local IP/RTSP Stream"
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">CAST AS IP CAM</span>
          </button>

          {/* Face & Animal Intelligence Album */}
          <button
            id="face-album-btn"
            onClick={() => setShowFaceAlbum(true)}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-400 transition flex items-center gap-1.5 font-mono text-xs relative shrink-0"
            title="Open Face & Animal Catalog"
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">FACE INTEL</span>
            {faceProfiles.filter((p) => p.role === 'unknown').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1" />
            )}
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Advanced Settings Modal Toggle */}
          <button
            id="settings-panel-btn"
            onClick={() => setActivePanel(activePanel === 'settings' ? 'none' : 'settings')}
            className={`px-3 py-2 rounded-lg border transition font-mono text-xs flex items-center gap-1.5 shrink-0 ${
              activePanel === 'settings'
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold shadow-md shadow-cyan-950'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Open Advanced Settings Hub"
          >
            <Settings className={`w-4 h-4 text-cyan-400 ${activePanel === 'settings' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">SETTINGS</span>
          </button>
        </div>
      </header>

      {/* SUB-HEADER: CAMERA CHANNEL SELECTOR PILLS */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 px-3 py-2 overflow-x-auto no-scrollbar sm:px-4">
        <div className="flex min-w-max items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider hidden sm:inline">
            CHANNELS:
          </span>
          {cameras.map((cam, idx) => (
            <button
              key={cam.id}
              onClick={() => setActiveCamId(cam.id)}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs transition flex items-center gap-2 shrink-0 ${
                activeCamId === cam.id
                  ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-900/40'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  activeCamId === cam.id ? 'bg-white' : 'bg-emerald-400'
                }`}
              />
              <span>CH {idx + 1}: {cam.name}</span>
            </button>
          ))}

          {/* Add Channel Button */}
          <button
            onClick={() => setShowAddCamera(true)}
            className="px-2.5 py-1.5 rounded-lg border border-dashed border-slate-700 hover:border-cyan-400 text-slate-400 hover:text-cyan-300 font-mono text-xs transition flex items-center gap-1.5 shrink-0"
          >
            <span>+ ADD CHANNEL</span>
          </button>
        </div>

        {/* Quick feature badge */}
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 shrink-0">
            <span className="text-cyan-400 font-bold">{fpsDisplay} FPS</span>
            <span>|</span>
            <span className="text-emerald-400">100% PRIVATE LOCAL STORE</span>
          </div>
        </div>
      </div>

      {/* MAIN VIEWPORT CONTAINER */}
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 24, mass: 0.8 }}
        className="flex w-full max-w-7xl flex-1 flex-col gap-3 mx-auto p-2.5 sm:gap-4 sm:p-5"
      >
        {/* PRIMARY DVR STAGE & CANVAS */}
        <motion.div
          ref={streamStageRef}
          layout
          transition={{ type: 'spring', stiffness: 240, damping: 26 }}
          className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-black shadow-2xl sm:rounded-2xl fullscreen:z-50 fullscreen:h-screen fullscreen:w-screen fullscreen:aspect-auto fullscreen:rounded-none"
        >
          {/* HD 30 FPS Render Canvas; source video remains native-resolution for exports */}
          <canvas
            ref={canvasRef}
            width={1920}
            height={1080}
            className="w-full h-full object-contain block bg-slate-950"
          />
          {!(videoElementRef.current && videoElementRef.current.readyState >= 2 && videoElementRef.current.videoWidth > 0) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/35 px-6 text-center">
              <div className="max-w-md rounded-2xl border border-slate-700/80 bg-slate-950/90 px-6 py-5 shadow-xl backdrop-blur-sm">
                <VideoOff className="mx-auto h-8 w-8 text-slate-500" />
                <p className="mt-3 text-sm font-semibold text-slate-200">Camera feed is not available</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {cameraFeedError || (activeCamera.type === 'screen'
                    ? 'Choose a screen or window to share when your browser asks.'
                    : activeCamera.type === 'local'
                      ? 'Allow camera access in your browser, then reload this page or choose another channel.'
                      : 'Connect or select a camera channel with a live video feed.')}
                </p>
                <button
                  type="button"
                  onClick={() => setCameraRetryKey((key) => key + 1)}
                  className="pointer-events-auto mt-4 rounded-lg border border-cyan-700 bg-cyan-950/80 px-4 py-2 font-mono text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-900"
                >
                  {activeCamera.type === 'screen' ? 'RETRY SCREEN SHARE' : 'RETRY CAMERA'}
                </button>
              </div>
            </div>
          )}
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 sm:bottom-4 sm:right-4 sm:gap-2">
            <button
              onClick={handleTake4KSnapshot}
              className="rounded-lg border border-white/25 bg-black/70 p-2 text-white hover:bg-black/90"
              title="Take snapshot"
              aria-label="Take snapshot"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const stage = streamStageRef.current;
                if (!stage) return;
                if (document.fullscreenElement === stage) {
                  document.exitFullscreen().catch(() => {});
                } else {
                  stage.requestFullscreen().catch(() => {});
                }
              }}
              className="rounded-lg border border-white/25 bg-black/70 p-2 text-white hover:bg-black/90"
              title="Toggle full screen"
              aria-label="Toggle full screen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <AudioCueOverlay cues={audioCues} enabled={accessibility.audioVisualCues} />
          <SceneCaptionOverlay details={liveSceneDetails} enabled={sceneOverlayEnabled} />
        </motion.div>

        <SceneDetailsPanel
          details={liveSceneDetails}
          narration={sceneNarration}
          detections={detectedObjects}
          overlayEnabled={sceneOverlayEnabled}
          onOverlayChange={setSceneOverlayEnabled}
        />
        {deliveryPending && <div className="rounded-xl border border-amber-400/60 bg-amber-950/70 px-4 py-3 shadow-lg" role="status">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">Delivery package pending</p><p className="mt-1 text-sm text-amber-50">{deliveryDescription}</p><p className="mt-1 text-[10px] text-amber-200/70">This reminder remains until you confirm the package alert is complete.</p></div><button type="button" onClick={() => { setDeliveryPending(false); localStorage.removeItem('lookout_delivery_pending'); notifyAlert({ title: 'Delivery acknowledged', message: 'The delivery reminder was cleared.', severity: 'info', speak: false, playTone: false, captureGif: false, durationMs: 4000 }); }} className="rounded-lg bg-amber-400 px-3 py-2 font-mono text-xs font-bold text-black hover:bg-amber-300">ACKNOWLEDGE DELIVERY</button></div>
        </div>}

        {/* DVR CONTROLS & FAST ACTIONS BAR */}
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-xl sm:p-4">
          <label className="flex min-w-0 flex-col gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Free scene description <span className="font-normal normal-case tracking-normal text-cyan-400">Unlimited — used as the DVR filename and label</span>
            <textarea
              value={recordingSceneDescription}
              onChange={(event) => setRecordingSceneDescription(event.target.value)}
              placeholder="Describe this scene before recording, or leave blank for automatic scene labeling…"
              rows={2}
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-sans text-sm font-normal normal-case tracking-normal text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500"
              aria-label="Free unlimited scene description for the next DVR recording"
            />
          </label>
          {/* Recording & Snapshot Actions */}
          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              id="record-toggle-btn"
              onClick={handleToggleRecord}
              className={`shrink-0 rounded-xl px-4 py-2.5 font-mono text-xs font-bold transition flex items-center gap-2 shadow-lg ${
                isRecordingNow
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-red-900/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
              title={isRecordingNow ? 'Stop DVR recording' : 'Record 4K clip'}
              aria-label={isRecordingNow ? 'Stop DVR recording' : 'Record 4K clip'}
            >
              {isRecordingNow ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 text-red-500" />}
              <span className="hidden sm:inline">{isRecordingNow ? 'STOP DVR RECORDING' : 'RECORD 4K CLIP'}</span>
            </button>

            {/* Night Vision Quick Toggle */}
            <button
              id="night-vision-toggle-btn"
              onClick={() => {
                setNightVision((prev) => ({ ...prev, enabled: !prev.enabled }));
                setActivePanel(activePanel === 'night_vision' ? 'none' : 'night_vision');
              }}
              className={`shrink-0 rounded-xl border px-3 py-2 font-mono text-xs font-bold transition flex items-center gap-1.5 ${
                nightVision.enabled
                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Open night vision calibration"
              aria-label="Open night vision calibration"
            >
              <Moon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">NIGHT VISION CALIBRATION</span>
            </button>

            {/* CompreFace Instant Scan & Follow Trigger */}
            <button
              id="compreface-scan-btn"
              onClick={async () => {
                if (!storagePreferences.facialRecognitionMasterEnabled) {
                  showScanFeedback('Face recognition is turned off in the Face Intel settings.');
                  return;
                }
                const frame = captureLiveVideoFrame();
                if (!frame) {
                  showScanFeedback('No live camera frame is available. Allow camera access and retry.');
                  return;
                }
                audioEngine.playAlertTone('radar_ping');
                const dets = await faceRecognitionService.recognizeAtLongRange(frame.imageBase64, frame.canvas);
                if (faceRecognitionService.getLastRecognitionError()) {
                  showScanFeedback(`Face recognition error: ${faceRecognitionService.getLastRecognitionError()}`);
                  return;
                }
                if (dets && dets.length > 0) {
                  const updated = faceRecognitionService.correlateDetections(
                    detectedObjectsRef.current,
                    dets,
                    frame.width,
                    frame.height,
                    storagePreferences.faceMatchThreshold || 0.92
                  );
                  detectedObjectsRef.current = updated;
                  setDetectedObjects([...updated]);
                  showScanFeedback(`Detected ${dets.length} face${dets.length === 1 ? '' : 's'} in the live frame.`);
                } else showScanFeedback('No face detected in the live frame. Face the camera with your face clearly visible.');
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-800 bg-cyan-950/70 px-3 py-2 font-mono text-xs font-bold text-cyan-300 shadow-sm transition hover:bg-cyan-900"
              title="Perform instant CompreFace biometric scan and lock target"
              aria-label="Perform instant CompreFace biometric scan"
            >
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">COMPREFACE SCAN</span>
            </button>
          </div>

          {/* Auxiliary Panel Toggles */}
          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {/* Wyze PTZ & Two-Way Microphone Audio */}
            {(activeCamera.type === 'wyze' || cameras.some((c) => c.type === 'wyze')) && (
              <button
                onClick={() => {
                  if (activeCamera.type !== 'wyze') {
                    const wyzeCam = cameras.find((c) => c.type === 'wyze');
                    if (wyzeCam) setActiveCamId(wyzeCam.id);
                  }
                  setActivePanel(activePanel === 'wyze' ? 'none' : 'wyze');
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-xs transition ${
                  activePanel === 'wyze'
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Open Wyze Cam PTZ & Microphone controls"
                aria-label="Open Wyze PTZ and talk controls"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">WYZE PTZ & TALK</span>
              </button>
            )}

            {/* Recordings Library */}
            <button
              onClick={() => setActivePanel(activePanel === 'recordings' ? 'none' : 'recordings')}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-xs transition ${
                activePanel === 'recordings'
                  ? 'bg-blue-950 border-blue-500 text-blue-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
              }`}
              aria-label={`Open DVR clips, ${recordings.length} saved`}
            >
              <Film className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">DVR CLIPS ({recordings.length})</span>
            </button>

            <button
              onClick={() => setActivePanel(activePanel === 'history' ? 'none' : 'history')}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-xs transition ${activePanel === 'history' ? 'bg-cyan-950 border-cyan-500 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'}`}
              title="View saved camera events"
              aria-label={`View camera history, ${historyEvents.length} events`}
            >
              <HistoryIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">HISTORY ({historyEvents.length})</span>
            </button>
          </div>
        </div>

        {/* DYNAMIC EXPANDABLE PANELS */}
        {activePanel === 'wyze' && activeCamera.type === 'wyze' && (
          <WyzeControls
            camera={activeCamera}
            onPtzChange={handlePtzChange}
            onMicToggle={handleWyzeMicToggle}
            onTriggerSiren={handleWyzeSiren}
          />
        )}

        {activePanel === 'night_vision' && (
          <NightVisionControls settings={nightVision} onChange={setNightVision} />
        )}

        {activePanel === 'recordings' && (
          <RecordingsLibrary
            recordings={recordings}
            onRefresh={() => setRecordings(StorageService.getRecordings())}
            onTake4KSnapshot={handleTake4KSnapshot}
          />
        )}

        {activePanel === 'history' && (
          <EventHistoryPanel events={historyEvents} onChange={setHistoryEvents} />
        )}

        {activePanel === 'settings' && (
          <SettingsPanel
            nightVision={nightVision}
            onNightVisionChange={setNightVision}
            redSilhouette={redSilhouette}
            onRedSilhouetteChange={setRedSilhouette}
            videoProcessing={videoProcessing}
            onVideoProcessingChange={setVideoProcessing}
            accessibility={accessibility}
            onAccessibilityChange={setAccessibility}
            audioCues={audioCues}
            audioSourceNames={audioSourceNames}
            emergencyContacts={emergencyContacts}
            onEmergencyContactsChange={setEmergencyContacts}
            detectionSensitivities={detectionSensitivities}
            onDetectionSensitivitiesChange={setDetectionSensitivities}
            alertNotifications={alertNotifications}
            onAlertNotificationsChange={setAlertNotifications}
            pwaSettings={pwaSettings}
            onPWASettingsChange={setPwaSettings}
            cloudSyncSettings={cloudSyncSettings}
            onCloudSyncSettingsChange={setCloudSyncSettings}
            storagePreferences={storagePreferences}
            onStoragePreferencesChange={setStoragePreferences}
            faceProfiles={faceProfiles}
            onFaceProfilesChange={setFaceProfiles}
            currentTheme={currentTheme}
            onThemeChange={setCurrentTheme}
            onClose={() => setActivePanel('none')}
          />
        )}
      </motion.main>

      {/* FOOTER */}
      <footer className="mt-auto flex flex-col items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-3 py-4 text-center font-mono text-[11px] text-slate-500 sm:flex-row sm:px-6 sm:text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>Lookout AI • Next-Gen PWA Surveillance Hub</span>
        </div>
        <div className="max-w-2xl text-center">
          Recognition-First Low-CPU Mode • Local Biometric Data • 30 FPS Display<br />
          Created by Brian Cross using Trill AI for references, CompreFace for inference and recognition, and NodeJS testing.
          <span className="mt-1 block text-[10px] text-slate-600">Privacy notice: obtain informed permission before adding any person to a recognition database. Unauthorized biometric identification may violate privacy laws and can result in legal action. Use this app lawfully; you are responsible for alerts, recordings, data security, and any harm or liability arising from its use.</span>
        </div>
      </footer>

      {/* MODAL DIALOGS */}
      <QRCodeModal isOpen={showQRModal} onClose={() => setShowQRModal(false)} />
      <CastModal
        isOpen={showCastModal}
        onClose={() => setShowCastModal(false)}
        activeCameraName={activeCamera.name}
      />
      <FaceAlbumModal
        isOpen={showFaceAlbum}
        onClose={() => setShowFaceAlbum(false)}
        onProfileUpdated={() => setFaceProfiles(StorageService.getFaceProfiles())}
      />
      <AddCameraModal
        isOpen={showAddCamera}
        onClose={() => setShowAddCamera(false)}
        onAddCamera={handleAddCamera}
      />
    </div>
  );
}

export default App;
