import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AlertTriangle,
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
} from './types';

import { StorageService } from './services/db';
import { audioEngine } from './services/audioEngine';
import { videoProcessor } from './services/videoProcessor';
import { faceRecognitionService } from './services/faceRecognitionService';
import { petRecognitionService } from './services/petRecognitionService';
import { isGlobalCameraMotion } from './services/cameraMotionGuard';

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
  const [liveAlert, setLiveAlert] = useState('');
  const [visualAlertFrame, setVisualAlertFrame] = useState('');
  const [cameraFeedError, setCameraFeedError] = useState('');
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [faceProfiles, setFaceProfiles] = useState<FaceProfile[]>(StorageService.getFaceProfiles());

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

  // State: Modals & Panels
  const [showQRModal, setShowQRModal] = useState(false);
  const [showCastModal, setShowCastModal] = useState(false);
  const [showFaceAlbum, setShowFaceAlbum] = useState(false);
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [activePanel, setActivePanel] = useState<'none' | 'night_vision' | 'wyze' | 'recordings' | 'history' | 'settings'>('none');

  // State: Detection & Telemetry
  const [detectedObjects, setDetectedObjects] = useState<DetectionObject[]>([]);
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
            s = await navigator.mediaDevices.getUserMedia({
              video,
              audio: false,
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
          const s = await navigator.mediaDevices.getDisplayMedia({
            video: isPhone ? { frameRate: { ideal: 30, max: 30 } } : { frameRate: { ideal: 60 } },
            audio: false,
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
  }, [activeCamId, activeCamera, cameraRetryKey, isPhone]);

  // References for the lightweight render pipeline
  const detectedObjectsRef = useRef<DetectionObject[]>([]);
  const activeCameraRef = useRef(activeCamera);
  const nightVisionRef = useRef(nightVision);
  const redSilhouetteRef = useRef(redSilhouette);
  const videoProcessingRef = useRef(videoProcessing);
  const accessibilityRef = useRef(accessibility);

  useEffect(() => { activeCameraRef.current = activeCamera; }, [activeCamera]);
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
      }
      if (now - lastFaceAlertAtRef.current > 3500) {
        lastFaceAlertAtRef.current = now;
        const frame = canvasRef.current;
        if (frame) setVisualAlertFrame(frame.toDataURL('image/jpeg', 0.88));
        setLiveAlert('FACE DETECTED — DVR RECORDING ACTIVE');
        window.setTimeout(() => setLiveAlert((current) => current === 'FACE DETECTED — DVR RECORDING ACTIVE' ? '' : current), 2200);
      }
    } else if (autoFaceRecordingRef.current && now - lastFaceSeenAtRef.current > 2400) {
      document.getElementById('record-toggle-btn')?.click();
      autoFaceRecordingRef.current = false;
      setLiveAlert('FACE LEFT SCENE — DVR CLIP SAVING');
      window.setTimeout(() => setLiveAlert((current) => current === 'FACE LEFT SCENE — DVR CLIP SAVING' ? '' : current), 2200);
    }
  };

  // Continuous CompreFace Facial Recognition Cycle:
  // Low-latency neural face recognition via CompreFace proxy, 
  // identifies registered subjects ("Brian", "Heather", "Malcolm", etc.), and always follows the person.
  useEffect(() => {
    let isMounted = true;
    let timer: any = null;

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
        const detections = useLongRange && recognitionCanvas
          ? await faceRecognitionService.recognizeAtLongRange(snapshotBase64, recognitionCanvas)
          : await faceRecognitionService.recognize(snapshotBase64);
        syncFaceTriggeredDvr(detections.length > 0);

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
              StorageService.updateFaceLastSeenByName(topSubj.subject);
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
                showScanFeedback(`${topSubj.subject} arrived or is present in the monitored scene.`);
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
              }
            } else {
              let faceCrop: string | undefined;
              if (recognitionCanvas && d.box) {
                // Recognition intentionally uses a compact frame, but the saved
                // snapshot should come from the camera's native pixels. The old
                // 192px crop was both soft and stretched when a face box was not
                // square. Build a padded square in recognition coordinates, map
                // it back to the native video, and only then upscale it to a
                // consistent HD-ish profile image.
                const faceWidth = d.box.x_max - d.box.x_min;
                const faceHeight = d.box.y_max - d.box.y_min;
                const paddingX = faceWidth * 0.28;
                const paddingY = faceHeight * 0.28;
                const paddedWidth = faceWidth + paddingX * 2;
                const paddedHeight = faceHeight + paddingY * 2;
                const squareSize = Math.max(paddedWidth, paddedHeight);
                const centerX = (d.box.x_min + d.box.x_max) / 2;
                const centerY = (d.box.y_min + d.box.y_max) / 2;
                const sx = Math.max(0, Math.min(snapW - squareSize, centerX - squareSize / 2));
                const sy = Math.max(0, Math.min(snapH - squareSize, centerY - squareSize / 2));
                const cropSize = Math.min(squareSize, snapW - sx, snapH - sy);
                if (cropSize > 0) {
                  const source = video && video.videoWidth > 0 ? video : recognitionCanvas;
                  const sourceWidth = source === video ? video.videoWidth : snapW;
                  const sourceHeight = source === video ? video.videoHeight : snapH;
                  const scaleX = sourceWidth / snapW;
                  const scaleY = sourceHeight / snapH;
                  const cropCanvas = document.createElement('canvas');
                  // A 1024px square keeps the profile sharp on HD/retina
                  // displays, while the native video remains the source of truth.
                  const outputSize = 1024;
                  cropCanvas.width = outputSize;
                  cropCanvas.height = outputSize;
                  const cropContext = cropCanvas.getContext('2d');
                  if (cropContext) {
                    cropContext.imageSmoothingEnabled = true;
                    cropContext.imageSmoothingQuality = 'high';
                    cropContext.drawImage(
                      source,
                      sx * scaleX,
                      sy * scaleY,
                      cropSize * scaleX,
                      cropSize * scaleY,
                      0,
                      0,
                      outputSize,
                      outputSize
                    );
                    faceCrop = cropCanvas.toDataURL('image/jpeg', 0.94);
                  }
                }
              }
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
                  showScanFeedback(`${petMatch.profile.name} was recognized in the monitored yard or driveway.`);
                  continue;
                }
              }
              StorageService.catalogUnknownFace(
                'Unknown Subject',
                'person',
                'Face captured from CompreFace detection. Review and assign to a person, or save it as an animal profile for local pet recognition.',
                faceCrop
              );
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
  }, [storagePreferences.facialRecognitionMasterEnabled, storagePreferences.faceMatchThreshold, activeCamId, detectionSensitivities.fixedCameraGuard, recordHistoryEvent, detectGlobalCameraMotion, isPhone]);

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

  const buildSceneDescription = () => {
    const visibleSubjects = detectedObjects
      .map((object) => object.subjectName || object.nameTag || object.label)
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 8);
    const person = detectedObjects.find((object) => object.category === 'person');
    const packageObject = detectedObjects.find((object) => /package|parcel|box|delivery/i.test(object.label));
    if (packageObject) return `${activeCamera.name}: a package or delivery is visible at the monitored entry area`;
    if (person?.subjectName) return `${activeCamera.name}: ${person.subjectName} is present in the yard or driveway scene`;
    if (person) return `${activeCamera.name}: a person is walking through the monitored yard or driveway`;
    return visibleSubjects.length > 0
      ? `${activeCamera.name}: ${visibleSubjects.join(', ')} visible in the scene`
      : `${activeCamera.name}: live camera scene`;
  };

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

  const showScanFeedback = (message: string) => {
    setLiveAlert(message);
    const canvas = canvasRef.current;
    if (canvas) setVisualAlertFrame(canvas.toDataURL('image/jpeg', 0.86));
    window.setTimeout(() => {
      setLiveAlert((current) => current === message ? '' : current);
      setVisualAlertFrame((current) => current ? '' : current);
    }, 6000);
  };

  return (
    <div className={`app-shell min-h-screen flex flex-col font-sans select-none overflow-x-hidden ${getThemeClass(currentTheme)}`}>
      {/* Hidden background video element to pipe camera feeds to canvas */}
      <video ref={videoElementRef} className="hidden" playsInline muted autoPlay />
      {liveAlert && <div role="alert" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75 p-3 backdrop-blur-[2px] sm:p-8">
        <div className="relative flex h-full max-h-[min(82vh,720px)] w-full max-w-5xl items-end overflow-hidden rounded-2xl border-2 border-amber-400/80 bg-slate-950 shadow-2xl shadow-amber-950/50">
          {visualAlertFrame ? <img src={visualAlertFrame} alt="Animated camera alert preview" className="absolute inset-0 h-full w-full object-cover opacity-80 alert-video-preview" /> : <div className="absolute inset-0 bg-gradient-to-br from-amber-950 via-slate-950 to-black" />}
          <div className="absolute inset-0 alert-video-scanline" />
          <div className="relative m-3 w-full rounded-xl border border-amber-400/60 bg-black/75 p-4 text-amber-50 backdrop-blur-md sm:m-6 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-amber-300"><AlertTriangle className="h-5 w-5 animate-pulse" /> Video alert • live scene preview</div>
            <p className="mt-2 text-lg font-bold sm:text-2xl">{liveAlert}</p>
          </div>
        </div>
      </div>}

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
              const cycle: UIThemeMode[] = ['dark', 'oled', 'tactical_nvg', 'light'];
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
        </motion.div>

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
        <div>
          Recognition-First Low-CPU Mode • Local Biometric Data • 30 FPS Display
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
