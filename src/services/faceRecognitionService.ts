import { BodyLandmark, BodyPosture, CompreFaceDetection, CompreFaceSubject, DetectionObject } from '../types';
import { filterImplausibleFaces, MIN_DISTANT_FACE_PROBABILITY } from './faceDetectionGate';
import { conservativeIdentityThreshold, identityThreshold, isNegativeSubject } from './detectionSettings';
import { encodeCanvasWithinByteBudget } from './imageEncoding';

// A face should disappear quickly after the detector loses it. Keeping a
// person alive for multiple seconds is a common source of "ghost" sightings.
const PERSON_TRACK_RETENTION_MS = 650;
// Smaller overlapping crops let CompreFace spend its detector resolution on
// a distant subject instead of resizing the entire wide camera frame down.
const LONG_RANGE_TILE_COLUMNS = 3;
const LONG_RANGE_TILE_ROWS = 2;
const LONG_RANGE_TILE_WIDTH_RATIO = 0.38;
const LONG_RANGE_TILE_HEIGHT_RATIO = 0.52;
const LONG_RANGE_TILE_MAX_EDGE = 1900;

export interface FaceTileBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EncodedFaceTile extends FaceTileBounds {
  imageBase64: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function topSimilarity(detection: CompreFaceDetection): number {
  return Math.max(0, ...(detection.subjects || []).map((subject) => subject.similarity));
}

/**
 * Subjects sorted strongest-first. CompreFace normally returns them in this
 * order, but nothing guarantees it, and announcing `subjects[0]` verbatim has
 * produced wrong-name alerts when it was not.
 */
export function rankedSubjects(detection: CompreFaceDetection): CompreFaceSubject[] {
  return [...(detection.subjects || [])].sort((a, b) => b.similarity - a.similarity);
}

/** The single strongest enrolled-subject match for a detection, if any. */
export function topSubjectOf(detection: CompreFaceDetection): CompreFaceSubject | null {
  return rankedSubjects(detection)[0] || null;
}

function boxArea(detection: CompreFaceDetection): number {
  return Math.max(0, detection.box.x_max - detection.box.x_min) * Math.max(0, detection.box.y_max - detection.box.y_min);
}

function inferredEmotion(detection: CompreFaceDetection): 'neutral' | 'alert' | 'friendly' | 'distressed' | 'aggressive' {
  if (detection.emotion && ['neutral', 'alert', 'friendly', 'distressed', 'aggressive'].includes(detection.emotion)) {
    return detection.emotion as 'neutral' | 'alert' | 'friendly' | 'distressed' | 'aggressive';
  }
  // CompreFace does not expose emotion in every deployment. Use pose as a
  // conservative visual cue and clearly keep the result as an estimate.
  const yaw = Math.abs(detection.pose?.yaw || 0);
  const pitch = Math.abs(detection.pose?.pitch || 0);
  return yaw > 24 || pitch > 18 ? 'alert' : 'neutral';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Build a stable body skeleton from the detected head/silhouette geometry. If
 * a future pose provider returns real body points, those can replace this
 * geometry without changing the HUD or tracking model. */
function estimateBodyLandmarks(
  targetBbox: [number, number, number, number],
  silhouetteBbox: [number, number, number, number],
  previousTarget?: [number, number, number, number],
): { landmarks: BodyLandmark[]; posture: BodyPosture } {
  const [x, y, w, h] = targetBbox;
  const [sx, sy, sw, sh] = silhouetteBbox;
  const cx = x + w / 2;
  const shoulderY = clamp01(y + h * 1.35);
  const hipY = clamp01(sy + sh * 0.48);
  const kneeY = clamp01(sy + sh * 0.72);
  const ankleY = clamp01(sy + sh * 0.96);
  const shoulderOffset = Math.max(w * 0.85, sw * 0.18);
  const hipOffset = Math.max(w * 0.55, sw * 0.13);
  const elbowDrop = Math.max(h * 1.1, (hipY - shoulderY) * 0.45);
  const leftShoulder = [clamp01(cx - shoulderOffset), shoulderY];
  const rightShoulder = [clamp01(cx + shoulderOffset), shoulderY];
  const leftHip = [clamp01(cx - hipOffset), hipY];
  const rightHip = [clamp01(cx + hipOffset), hipY];
  const leftKnee = [clamp01(cx - hipOffset * 0.95), kneeY];
  const rightKnee = [clamp01(cx + hipOffset * 0.95), kneeY];
  const motion = previousTarget
    ? Math.hypot((x + w / 2) - (previousTarget[0] + previousTarget[2] / 2), (y + h / 2) - (previousTarget[1] + previousTarget[3] / 2))
    : 0;
  const aspect = sh / Math.max(0.01, sw);
  const posture: BodyPosture = motion > 0.018 ? 'walking' : aspect < 1.65 ? 'sitting' : 'standing';
  const point = (name: BodyLandmark['name'], pair: number[], confidence = 0.62): BodyLandmark => ({ name, x: pair[0], y: pair[1], confidence });
  return {
    posture,
    landmarks: [
      point('head', [cx, y + h * 0.25], 0.95), point('neck', [cx, y + h * 1.08], 0.78),
      point('left_shoulder', leftShoulder), point('right_shoulder', rightShoulder),
      point('left_elbow', [clamp01(leftShoulder[0] - w * 0.55), clamp01(shoulderY + elbowDrop)]),
      point('right_elbow', [clamp01(rightShoulder[0] + w * 0.55), clamp01(shoulderY + elbowDrop)]),
      point('left_wrist', [clamp01(leftShoulder[0] - w * 0.7), clamp01(shoulderY + elbowDrop * 1.6)]),
      point('right_wrist', [clamp01(rightShoulder[0] + w * 0.7), clamp01(shoulderY + elbowDrop * 1.6)]),
      point('left_hip', leftHip), point('right_hip', rightHip),
      point('left_knee', leftKnee), point('right_knee', rightKnee),
      point('left_ankle', [clamp01(leftKnee[0]), ankleY]), point('right_ankle', [clamp01(rightKnee[0]), ankleY]),
    ],
  };
}

function boxIntersectionOverUnion(a: CompreFaceDetection, b: CompreFaceDetection): number {
  const left = Math.max(a.box.x_min, b.box.x_min);
  const top = Math.max(a.box.y_min, b.box.y_min);
  const right = Math.min(a.box.x_max, b.box.x_max);
  const bottom = Math.min(a.box.y_max, b.box.y_max);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = boxArea(a) + boxArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Maps a face returned from an enlarged tile back onto the source frame. */
export function mapDetectionFromTile(
  detection: CompreFaceDetection,
  tile: FaceTileBounds,
  tileImageWidth: number,
  tileImageHeight: number,
): CompreFaceDetection {
  const scaleX = tile.width / Math.max(1, tileImageWidth);
  const scaleY = tile.height / Math.max(1, tileImageHeight);
  const mapX = (value: number) => clamp(tile.x + value * scaleX, tile.x, tile.x + tile.width);
  const mapY = (value: number) => clamp(tile.y + value * scaleY, tile.y, tile.y + tile.height);

  return {
    ...detection,
    box: {
      ...detection.box,
      x_min: mapX(detection.box.x_min),
      y_min: mapY(detection.box.y_min),
      x_max: mapX(detection.box.x_max),
      y_max: mapY(detection.box.y_max),
    },
    landmarks: detection.landmarks?.map(([x, y]) => [mapX(x), mapY(y)] as [number, number]),
  };
}

/**
 * Removes duplicate observations from overlapping long-range tiles. A high
 * identity similarity wins first; detector confidence resolves the remainder.
 */
export function mergeFaceDetections(detections: CompreFaceDetection[]): CompreFaceDetection[] {
  const candidates = [...detections]
    .filter((detection) => Number.isFinite(detection.box.x_min) && Number.isFinite(detection.box.y_min) &&
      Number.isFinite(detection.box.x_max) && Number.isFinite(detection.box.y_max) && boxArea(detection) > 0)
    .sort((a, b) => {
      const scoreA = topSimilarity(a) * 4 + a.box.probability;
      const scoreB = topSimilarity(b) * 4 + b.box.probability;
      return scoreB - scoreA;
    });
  const unique: CompreFaceDetection[] = [];

  for (const candidate of candidates) {
    const centerX = (candidate.box.x_min + candidate.box.x_max) / 2;
    const centerY = (candidate.box.y_min + candidate.box.y_max) / 2;
    const duplicate = unique.some((existing) => {
      if (boxIntersectionOverUnion(candidate, existing) >= 0.3) return true;
      const existingCenterX = (existing.box.x_min + existing.box.x_max) / 2;
      const existingCenterY = (existing.box.y_min + existing.box.y_max) / 2;
      const comparableScale = Math.max(10, Math.min(
        candidate.box.x_max - candidate.box.x_min,
        candidate.box.y_max - candidate.box.y_min,
        existing.box.x_max - existing.box.x_min,
        existing.box.y_max - existing.box.y_min,
      ));
      return Math.hypot(centerX - existingCenterX, centerY - existingCenterY) < comparableScale * 0.35;
    });
    if (!duplicate) unique.push(candidate);
  }

  return unique;
}

/** Long-range tiles are useful only for absent or genuinely small detections. */
export function shouldRunLongRangeTiles(
  detections: CompreFaceDetection[],
  frameWidth: number,
  frameHeight: number,
): boolean {
  if (!detections.length) return true;
  const smallFaceWidth = Math.max(32, frameWidth * 0.12);
  const smallFaceHeight = Math.max(32, frameHeight * 0.12);
  return detections.some((detection) =>
    detection.box.x_max - detection.box.x_min < smallFaceWidth ||
    detection.box.y_max - detection.box.y_min < smallFaceHeight
  );
}

export class FaceRecognitionService {
  private static instance: FaceRecognitionService;
  private isProcessing = false;
  /** Count of boxes rejected as implausible, surfaced for diagnostics. */
  public suppressedFaceCount = 0;
  /**
   * Cumulative count of detections dropped because their strongest subject is
   * a negative/noise profile (e.g. `Background_Noise`). Read by the live
   * cycle to attribute the drops in the recognition activity panel.
   */
  public negativeSubjectDropped = 0;
  private lastRecognitionError = '';

  getLastRecognitionError(): string {
    return this.lastRecognitionError;
  }

  static getInstance(): FaceRecognitionService {
    if (!FaceRecognitionService.instance) {
      FaceRecognitionService.instance = new FaceRecognitionService();
    }
    return FaceRecognitionService.instance;
  }

  /**
   * Calls CompreFace through the backend proxy with landmarks only.
   * `detProbThreshold` is the caller's detector confidence floor; the server
   * forwards it as `det_prob_threshold` so the detector itself filters at the
   * gateway instead of shipping boxes the client would discard anyway.
   */
  async recognize(
    imageBase64: string,
    frameWidth = 0,
    frameHeight = 0,
    detProbThreshold?: number,
  ): Promise<CompreFaceDetection[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    try {
      const result = await this.requestRecognition(imageBase64, 'standard', frameWidth, frameHeight, detProbThreshold);
      this.lastRecognitionError = '';
      return result;
    } catch (err) {
      this.lastRecognitionError = err instanceof Error ? err.message : 'Recognition service is unavailable.';
      console.warn('FaceRecognition recognize error:', err);
      return [];
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Performs a normal recognition pass plus an overlapping 3 × 2 tiled pass
   * for tiny/absent faces. Each tile is enlarged before it reaches the face
   * detector, preserving source pixels while preventing its internal resize
   * step from discarding distant-face detail.
   */
  async recognizeAtLongRange(
    imageBase64: string,
    sourceFrame: HTMLCanvasElement,
    standardDetProbThreshold?: number,
    distantDetProbThreshold?: number,
  ): Promise<CompreFaceDetection[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    try {
      const primary = await this.requestRecognition(
        imageBase64,
        'standard',
        sourceFrame.width,
        sourceFrame.height,
        standardDetProbThreshold,
      );
      if (!shouldRunLongRangeTiles(primary, sourceFrame.width, sourceFrame.height)) {
        this.lastRecognitionError = '';
        return primary;
      }

      const tiles = this.createLongRangeTiles(sourceFrame);
      const expandedDetections: CompreFaceDetection[] = [];
      // Two concurrent requests keep a distant scan responsive without
      // monopolizing a self-hosted CompreFace deployment.
      for (let start = 0; start < tiles.length; start += 2) {
        const results = await Promise.all(tiles.slice(start, start + 2).map(async (tile) => {
          try {
            const detections = await this.requestRecognition(
              tile.imageBase64,
              'distant',
              tile.imageWidth,
              tile.imageHeight,
              distantDetProbThreshold,
            );
            return detections.map((detection) => mapDetectionFromTile(detection, tile, tile.imageWidth, tile.imageHeight));
          } catch (error) {
            // A single slow tile should not discard normal-pass results or
            // create a synthetic target. The next scheduled scan can retry it.
            console.warn('Long-range face tile failed:', error);
            return [] as CompreFaceDetection[];
          }
        }));
        results.forEach((detections) => expandedDetections.push(...detections));
      }

      this.lastRecognitionError = '';
      return mergeFaceDetections([...primary, ...expandedDetections]);
    } catch (err) {
      this.lastRecognitionError = err instanceof Error ? err.message : 'Recognition service is unavailable.';
      console.warn('FaceRecognition long-range scan error:', err);
      return [];
    } finally {
      this.isProcessing = false;
    }
  }

  private async requestRecognition(
    imageBase64: string,
    detectionProfile: 'standard' | 'distant',
    frameWidth: number,
    frameHeight: number,
    detProbThreshold?: number,
  ): Promise<CompreFaceDetection[]> {
    const res = await fetch('/api/recognition/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, detectionProfile, detProbThreshold }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Recognition request failed (${res.status}).`);
    }

    const data = await res.json();
    const raw: CompreFaceDetection[] = Array.isArray(data.result) ? data.result : [];
    // Discard implausible boxes at the source so no downstream consumer —
    // tracking, alerts, DVR, or scene narration — ever sees a phantom face.
    // Frame dimensions are those of the image actually submitted, which is
    // the pixel space the detector reports its boxes in.
    let filtered = filterImplausibleFaces(raw, frameWidth, frameHeight, detectionProfile);
    // CompreFace installations do not all return identical box metadata. If
    // every candidate was rejected by an optional geometry check, retain a
    // conservative detector-only fallback rather than making the camera look
    // completely blind. This still requires a strong detector probability,
    // positive in-frame geometry, and a minimum usable face size.
    if (filtered.length === 0 && raw.length > 0 && frameWidth > 0 && frameHeight > 0) {
      const probabilityFloor = detectionProfile === 'distant' ? MIN_DISTANT_FACE_PROBABILITY : 0.82;
      filtered = raw.filter((detection) => {
        const width = detection.box.x_max - detection.box.x_min;
        const height = detection.box.y_max - detection.box.y_min;
        return detection.box.probability >= probabilityFloor &&
          width >= 24 && height >= 24 &&
          width <= frameWidth * 0.98 && height <= frameHeight * 0.98 &&
          detection.box.x_max > 0 && detection.box.y_max > 0 &&
          detection.box.x_min < frameWidth && detection.box.y_min < frameHeight;
      });
    }
    if (filtered.length !== raw.length) {
      this.suppressedFaceCount += raw.length - filtered.length;
    }
    // Negative/noise profiles (e.g. `Background_Noise`) are recognized noise:
    // drop the whole detection so it can never raise an unknown-person alert
    // or pollute the face album.
    const kept = filtered.filter((detection) => !isNegativeSubject(topSubjectOf(detection)?.subject));
    if (kept.length !== filtered.length) {
      this.negativeSubjectDropped += filtered.length - kept.length;
    }
    return kept;
  }

  private createLongRangeTiles(sourceFrame: HTMLCanvasElement): Array<EncodedFaceTile & { imageWidth: number; imageHeight: number }> {
    const sourceWidth = sourceFrame.width;
    const sourceHeight = sourceFrame.height;
    if (sourceWidth < 96 || sourceHeight < 96) return [];

    const sourceTileWidth = Math.max(48, Math.round(sourceWidth * LONG_RANGE_TILE_WIDTH_RATIO));
    const sourceTileHeight = Math.max(48, Math.round(sourceHeight * LONG_RANGE_TILE_HEIGHT_RATIO));
    const xPositions = Array.from({ length: LONG_RANGE_TILE_COLUMNS }, (_, index) =>
      Math.round(index * (sourceWidth - sourceTileWidth) / Math.max(1, LONG_RANGE_TILE_COLUMNS - 1))
    );
    const yPositions = Array.from({ length: LONG_RANGE_TILE_ROWS }, (_, index) =>
      Math.round(index * (sourceHeight - sourceTileHeight) / Math.max(1, LONG_RANGE_TILE_ROWS - 1))
    );
    const tiles: Array<EncodedFaceTile & { imageWidth: number; imageHeight: number }> = [];

    for (const y of [...new Set(yPositions)]) {
      for (const x of [...new Set(xPositions)]) {
        const scale = Math.min(2, LONG_RANGE_TILE_MAX_EDGE / Math.max(sourceTileWidth, sourceTileHeight));
        const imageWidth = Math.max(48, Math.round(sourceTileWidth * scale));
        const imageHeight = Math.max(48, Math.round(sourceTileHeight * scale));
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = imageWidth;
        tileCanvas.height = imageHeight;
        const context = tileCanvas.getContext('2d');
        if (!context) continue;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(sourceFrame, x, y, sourceTileWidth, sourceTileHeight, 0, 0, imageWidth, imageHeight);
        try {
          // Tiles obey the same byte budget as the main frame; if the budget
          // forces a shrink, the encoded dimensions replace the nominal ones
          // so box mapping stays exact.
          const encoded = encodeCanvasWithinByteBudget(tileCanvas);
          tiles.push({
            x,
            y,
            width: sourceTileWidth,
            height: sourceTileHeight,
            imageWidth: encoded.width,
            imageHeight: encoded.height,
            imageBase64: encoded.imageBase64,
          });
        } catch (error) {
          // Cross-origin camera frames can block encoding. The normal pass is
          // still valid, and no guessed long-range face is created.
          console.warn('Long-range face tile could not be encoded:', error);
        }
      }
    }

    return tiles;
  }

  isReliableMatch(detection: CompreFaceDetection, threshold: number): boolean {
    const [best, runnerUp] = rankedSubjects(detection);
    // The Face Database similarity slider is honored across its full range
    // while a clear lead over the next enrolled identity is still required.
    // This is especially important for small distant faces whose embedding
    // score is naturally lower.
    const requiredSimilarity = identityThreshold(threshold);
    return Boolean(best && best.similarity >= requiredSimilarity &&
      (!runnerUp || best.similarity - runnerUp.similarity >= 0.06));
  }

  /** Stricter gate used before a name can trigger an alert or DVR event. */
  isConservativeMatch(detection: CompreFaceDetection, threshold: number): boolean {
    const [best, runnerUp] = rankedSubjects(detection);
    // Always one step stricter than the naming threshold, so an announced
    // identity never rests on the exact score that merely labeled the HUD.
    const requiredSimilarity = conservativeIdentityThreshold(threshold);
    return Boolean(best && detection.box.probability >= 0.70 && best.similarity >= requiredSimilarity &&
      (!runnerUp || best.similarity - runnerUp.similarity >= 0.10));
  }

  /**
   * Fetch all registered subjects from CompreFace database
   */
  async getSubjects(): Promise<string[]> {
    const res = await fetch('/api/recognition/subjects');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `CompreFace subjects request failed (${res.status}).`);
    }
    return Array.isArray(data.subjects) ? data.subjects : [];
  }

  async getSubjectImages(): Promise<Record<string, string>> {
    const res = await fetch('/api/recognition/subject-images');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `CompreFace face-images request failed (${res.status}).`);
    }
    return data.images && typeof data.images === 'object' ? data.images : {};
  }

  /**
   * Enroll a new face image for a subject
   */
  async enrollFace(subject: string, imageBase64: string): Promise<any> {
    try {
      const res = await fetch('/api/recognition/faces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, imageBase64 }),
      });
      return await res.json();
    } catch (err) {
      console.warn('Enroll face error:', err);
      return { success: false };
    }
  }

  /**
   * Check connection status to CompreFace service
   */
  async checkStatus(): Promise<{
    online: boolean;
    endpoint: string;
    subjectCount: number;
    subjects: string[];
  }> {
    try {
      const res = await fetch('/api/recognition/status');
      return await res.json();
    } catch (err: any) {
      return {
        online: false,
        endpoint: '',
        subjectCount: 0,
        subjects: [],
      };
    }
  }

  /**
   * Correlates CompreFace detections with currently tracked objects.
   * Generates or updates bounding boxes, normalized landmarks, and identification labels.
   */
  correlateDetections(
    currentObjects: DetectionObject[],
    detections: CompreFaceDetection[],
    imgWidth: number,
    imgHeight: number,
    matchThreshold = 0.65,
    animalNames: string[] = []
  ): DetectionObject[] {
    const now = Date.now();
    const updated: DetectionObject[] = [...currentObjects];

    // Other non-person objects (cars, animals, objects) are preserved
    const knownAnimalNames = new Set(animalNames.map((name) => name.toLowerCase()));
    const isKnownAnimalObject = (o: DetectionObject) =>
      o.category === 'animal' && knownAnimalNames.has((o.subjectName || o.nameTag || o.label).toLowerCase());
    const nonPersonObjects = updated.filter((o) => o.category !== 'person' && !isKnownAnimalObject(o));
    const existingPersons = updated.filter((o) => o.category === 'person' || isKnownAnimalObject(o));

    const matchedPersonIds = new Set<string>();

    detections.forEach((d, detIdx) => {
      // Normalize face coordinates
      if (!Number.isFinite(imgWidth) || !Number.isFinite(imgHeight) || imgWidth <= 0 || imgHeight <= 0) return;
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      const fx = clamp(d.box.x_min / imgWidth);
      const fy = clamp(d.box.y_min / imgHeight);
      const fw = clamp((d.box.x_max - d.box.x_min) / imgWidth);
      const fh = clamp((d.box.y_max - d.box.y_min) / imgHeight);
      if (fw <= 0 || fh <= 0) return;

      // CompreFace returns the face rectangle. Add only a little clearance for
      // hair/head movement; don't expand it down across the shoulders.
      const targetX = clamp(fx - fw * 0.08);
      const targetY = clamp(fy - fh * 0.10);
      const targetW = Math.min(1 - targetX, fw * 1.16);
      const targetH = Math.min(1 - targetY, fh * 1.20);
      const targetBbox: [number, number, number, number] = [targetX, targetY, targetW, targetH];
      // The HUD remains head-sized. Semantic segmentation gets a generous
      // person-sized crop so it can retain the visible body, arms, and legs.
      // This is input context only: the renderer never displays this rectangle
      // unless the segmentation model returns actual subject pixels.
      const silhouetteX = clamp(fx - fw * 1.10);
      const silhouetteY = clamp(fy - fh * 0.32);
      const silhouetteW = Math.min(1 - silhouetteX, fw * 3.20);
      const silhouetteH = Math.min(1 - silhouetteY, fh * 9.00);
      const targetSilhouetteBbox: [number, number, number, number] = [silhouetteX, silhouetteY, silhouetteW, silhouetteH];

      // Normalize facial landmarks (5 points)
      const normLandmarks: [number, number][] = (d.landmarks || []).map(([lx, ly]) => [
        Math.max(0, Math.min(1, lx / imgWidth)),
        Math.max(0, Math.min(1, ly / imgHeight)),
      ]);

      // Check subject match
      const rankedSubjects = [...(d.subjects || [])].sort((a, b) => b.similarity - a.similarity);
      const topSubject = rankedSubjects[0] || null;
      const isRecognized = this.isReliableMatch(d, matchThreshold);
      const isRecognizedAnimal = Boolean(
        isRecognized && topSubject && animalNames.some((name) => name.toLowerCase() === topSubject.subject.toLowerCase())
      );
      const category = isRecognizedAnimal ? 'animal' : 'person';

      let subjectName = '';
      let label = '';
      let nameTag = '';

      const ageLabel = d.age ? `AGE ~${Math.round((d.age.low + d.age.high) / 2)}` : 'AGE N/A';
      const emotionLabel = `EMOTION ${inferredEmotion(d).toUpperCase()}`;
      if (isRecognized && topSubject) {
        subjectName = topSubject.subject;
        const pct = Math.round(topSubject.similarity * 100);
        label = `${topSubject.subject.toUpperCase()} • ${ageLabel} • ${emotionLabel} (${pct}%)`;
        nameTag = topSubject.subject;
      } else {
        const genderStr = d.gender?.value ? d.gender.value.toUpperCase() : 'PERSON';
        label = `UNKNOWN ${genderStr} • ${ageLabel} • ${emotionLabel}`;
        nameTag = label;
      }

      // Find closest existing tracked person using centroid distance
      const centerTargetX = targetX + targetW / 2;
      const centerTargetY = targetY + targetH / 2;

      let bestMatch: DetectionObject | null = null;
      let bestAssociationCost = Number.POSITIVE_INFINITY;

      for (const p of existingPersons) {
        if (matchedPersonIds.has(p.id)) continue;
        const [px, py, pw, ph] = p.targetBbox || p.bbox;
        const centerX = px + pw / 2;
        const centerY = py + ph / 2;
        const dist = Math.hypot(centerTargetX - centerX, centerTargetY - centerY);
        const overlapW = Math.max(0, Math.min(targetX + targetW, px + pw) - Math.max(targetX, px));
        const overlapH = Math.max(0, Math.min(targetY + targetH, py + ph) - Math.max(targetY, py));
        const intersection = overlapW * overlapH;
        const union = targetW * targetH + pw * ph - intersection;
        const overlap = union > 0 ? intersection / union : 0;
        const maxDistance = Math.max(0.10, Math.min(0.20, Math.hypot(Math.max(targetW, pw), Math.max(targetH, ph)) * 1.8));
        const sameKnownIdentity = Boolean(
          isRecognized && subjectName && p.isKnown &&
          p.subjectName?.toLowerCase() === subjectName.toLowerCase()
        );
        if (overlap < 0.02 && dist > (sameKnownIdentity ? maxDistance * 1.5 : maxDistance)) continue;
        const associationCost = (dist / maxDistance) * 0.65 + (1 - overlap) * 0.35 - (sameKnownIdentity ? 0.25 : 0);
        if (associationCost < bestAssociationCost) {
          bestAssociationCost = associationCost;
          bestMatch = p;
        }
      }

      if (bestMatch) {
        // Update existing tracked person
        matchedPersonIds.add(bestMatch.id);
        const previousTarget = bestMatch.targetBbox || bestMatch.bbox;
        const bodyPose = estimateBodyLandmarks(targetBbox, targetSilhouetteBbox, previousTarget);
        const sameKnownIdentity = isRecognized && bestMatch.isKnown && bestMatch.subjectName === subjectName;
        const measurementWeight = sameKnownIdentity ? 0.68 : 0.55;
        bestMatch.targetBbox = targetBbox.map((value, index) =>
          previousTarget[index] * (1 - measurementWeight) + value * measurementWeight
        ) as [number, number, number, number];
        const previousSilhouetteTarget = bestMatch.targetSilhouetteBbox || bestMatch.silhouetteBbox || targetSilhouetteBbox;
        bestMatch.targetSilhouetteBbox = targetSilhouetteBbox.map((value, index) =>
          previousSilhouetteTarget[index] * (1 - measurementWeight) + value * measurementWeight
        ) as [number, number, number, number];
        bestMatch.motionVector = [0, 0];
        bestMatch.label = label;
        bestMatch.nameTag = nameTag;
        bestMatch.category = category;
        bestMatch.isKnown = isRecognized;
        // Never carry a previously recognized name into a new low-confidence
        // observation. That stale identity is how false "still here" alerts happen.
        bestMatch.subjectName = isRecognized ? subjectName : '';
        bestMatch.confidence = topSubject ? topSubject.similarity : d.box.probability;
        bestMatch.age = d.age;
        bestMatch.gender = d.gender;
        bestMatch.emotion = inferredEmotion(d);
        bestMatch.bodyLandmarks = bodyPose.landmarks;
        bestMatch.posture = bodyPose.posture;
        bestMatch.pose = d.pose;
        bestMatch.landmarks = normLandmarks;
        bestMatch.lastSeenTime = now;
      } else {
        // Spawn newly identified tracked person
        const newId = `${category}-cf-${now}-${detIdx}`;
        matchedPersonIds.add(newId);
        const bodyPose = estimateBodyLandmarks(targetBbox, targetSilhouetteBbox);
        existingPersons.push({
          id: newId,
          label,
          nameTag,
          category,
          confidence: topSubject ? topSubject.similarity : d.box.probability,
          bbox: targetBbox,
          targetBbox,
          silhouetteBbox: targetSilhouetteBbox,
          targetSilhouetteBbox,
          threatLevel: isRecognized ? 'none' : 'warning',
          motionVector: [0, 0],
          distanceMeters: Number((1.8 + Math.random() * 0.8).toFixed(1)),
          speedMph: 0.0,
          isKnown: isRecognized,
          subjectName,
          age: d.age,
          gender: d.gender,
          emotion: inferredEmotion(d),
          bodyLandmarks: bodyPose.landmarks,
          posture: bodyPose.posture,
          pose: d.pose,
          landmarks: normLandmarks,
          similarity: topSubject?.similarity,
          lastSeenTime: now,
          silhouetteColor: isRecognized ? '#3b82f6' : '#ef4444',
        });
      }
    });

    // Keep briefly through missed frames, then drop immediately once the retention window expires.
    const activePersons = existingPersons.filter((p) => {
      if (matchedPersonIds.has(p.id)) return true;
      return typeof p.lastSeenTime === 'number' && now - p.lastSeenTime < PERSON_TRACK_RETENTION_MS;
    });

    return [...nonPersonObjects, ...activePersons];
  }

  /**
   * Correlates real detected objects (laptops, phones, cups, pets, vehicles, etc.)
   * from the vision detector with current objects without disturbing tracked people.
   */
  correlateObjectDetections(
    currentObjects: DetectionObject[],
    newObjects: DetectionObject[]
  ): DetectionObject[] {
    const now = Date.now();
    const persons = currentObjects.filter((o) => o.category === 'person');
    const existingItems = currentObjects.filter((o) => o.category !== 'person');

    const matchedIds = new Set<string>();
    const updatedItems = [...existingItems];

    newObjects.forEach((fresh) => {
      const [fx, fy, fw, fh] = fresh.bbox;
      const fcx = fx + fw / 2;
      const fcy = fy + fh / 2;

      let bestMatch: DetectionObject | null = null;
      let minDistance = 0.3;

      for (const item of updatedItems) {
        if (matchedIds.has(item.id)) continue;
        if (item.category !== fresh.category) continue;

        const [ix, iy, iw, ih] = item.bbox;
        const icx = ix + iw / 2;
        const icy = iy + ih / 2;
        const dist = Math.hypot(fcx - icx, fcy - icy);
        const intersectionW = Math.max(0, Math.min(fx + fw, ix + iw) - Math.max(fx, ix));
        const intersectionH = Math.max(0, Math.min(fy + fh, iy + ih) - Math.max(fy, iy));
        const intersection = intersectionW * intersectionH;
        const union = fw * fh + iw * ih - intersection;
        const overlap = union > 0 ? intersection / union : 0;
        // Prefer overlap; allow modest label variation (e.g. "Dog" to "Golden Retriever")
        // when the box remains spatially consistent.
        if (overlap >= 0.15 || (dist < minDistance && item.label.toLowerCase() === fresh.label.toLowerCase())) {
          minDistance = dist;
          bestMatch = item;
        }
      }

      if (bestMatch) {
        matchedIds.add(bestMatch.id);
        const [px, py] = bestMatch.bbox;
        bestMatch.targetBbox = fresh.bbox;
        bestMatch.motionVector = [(fx - px) * 0.3, (fy - py) * 0.3];
        bestMatch.label = fresh.label;
        bestMatch.nameTag = fresh.nameTag || fresh.label;
        bestMatch.confidence = fresh.confidence;
        bestMatch.distanceMeters = fresh.distanceMeters;
        bestMatch.lastSeenTime = now;
      } else {
        matchedIds.add(fresh.id);
        updatedItems.push({ ...fresh, lastSeenTime: fresh.lastSeenTime || now });
      }
    });

    // Keep objects seen within last 4000ms
    const activeItems = updatedItems.filter((it) => {
      if (matchedIds.has(it.id)) return true;
      return it.lastSeenTime && now - it.lastSeenTime < 4000;
    });

    return [...persons, ...activeItems];
  }

  /**
   * 60 FPS physics interpolation loop: smoothly moves bounding boxes and reticles
   * towards their detected targets, locking and following the person without jitter.
   * NO simulated ambient drift!
   */
  stepPhysicsTracking(objects: DetectionObject[]): DetectionObject[] {
    const now = performance.now();
    return objects
      .filter((obj) => obj.category !== 'person' || (typeof obj.lastSeenTime === 'number' && Date.now() - obj.lastSeenTime < PERSON_TRACK_RETENTION_MS))
      .map((obj) => {
      if (!obj.targetBbox) return obj;

      const [curX, curY, curW, curH] = obj.bbox;
      const [tgtX, tgtY, tgtW, tgtH] = obj.targetBbox;
      const deltaMs = obj.lastPhysicsTime ? Math.max(0, Math.min(100, now - obj.lastPhysicsTime)) : 16.67;
      const smoothing = 1 - Math.exp(-deltaMs / 85);
      const newX = curX + (tgtX - curX) * smoothing;
      const newY = curY + (tgtY - curY) * smoothing;
      const newW = curW + (tgtW - curW) * smoothing;
      const newH = curH + (tgtH - curH) * smoothing;

      const silhouetteBbox = obj.silhouetteBbox && obj.targetSilhouetteBbox
        ? obj.silhouetteBbox.map((value, index) =>
            value + (obj.targetSilhouetteBbox![index] - value) * smoothing
          ) as [number, number, number, number]
        : obj.silhouetteBbox;

      return {
        ...obj,
        bbox: [newX, newY, newW, newH],
        silhouetteBbox,
        motionVector: [0, 0],
        lastPhysicsTime: now,
      };
    });
  }
}

export const faceRecognitionService = FaceRecognitionService.getInstance();
