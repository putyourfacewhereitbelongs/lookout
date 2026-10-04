import { CompreFaceDetection } from '../types';

/**
 * False-positive suppression for raw face detections.
 *
 * CompreFace's detector returns every candidate box it finds together with a
 * probability, and it readily fires on face-like texture: wood grain, foliage,
 * gravel, carpet pattern, cloud shapes, sensor noise in a dark frame. Nothing
 * previously filtered those out, so a single low-probability blob was enough
 * to announce "a face entered the scene" and start a DVR clip of an empty
 * driveway.
 *
 * Three independent checks run here, each targeting a different failure mode:
 *
 *  1. A probability floor, raised for the upscaled long-range tiles, which
 *     magnify noise and are by far the richest source of phantom boxes.
 *  2. Geometric plausibility — real faces are roughly upright, roughly square,
 *     and occupy a sane fraction of the frame.
 *  3. Temporal persistence — a real person is present in consecutive scans at
 *     roughly the same place, while pareidolia flickers in and out. This is
 *     the check that actually stops empty-scene alerts.
 */

/** Minimum detector probability for a normal full-frame pass. */
export const MIN_FACE_PROBABILITY = 0.82;

/**
 * Long-range tiles are enlarged up to 2x before detection, which amplifies
 * noise into face-like structure, so they must clear a higher bar.
 */
export const MIN_DISTANT_FACE_PROBABILITY = 0.93;

/** Faces are roughly upright ovals; anything far from square is not a face. */
const MIN_ASPECT_RATIO = 0.55;
const MAX_ASPECT_RATIO = 1.9;

/** A box smaller than this fraction of the frame edge is noise, not a face. */
const MIN_RELATIVE_EDGE = 0.012;

/** A single face cannot sensibly cover almost the whole frame. */
const MAX_RELATIVE_AREA = 0.92;

export interface BoxGeometry {
  width: number;
  height: number;
  aspectRatio: number;
  relativeArea: number;
}

export function measureBox(
  detection: CompreFaceDetection,
  frameWidth: number,
  frameHeight: number,
): BoxGeometry {
  const width = Math.max(0, detection.box.x_max - detection.box.x_min);
  const height = Math.max(0, detection.box.y_max - detection.box.y_min);
  return {
    width,
    height,
    aspectRatio: height > 0 ? width / height : 0,
    relativeArea: frameWidth > 0 && frameHeight > 0 ? (width * height) / (frameWidth * frameHeight) : 0,
  };
}

/**
 * True when a detection is geometrically plausible as a human face and clears
 * the probability floor for the pass that produced it.
 */
export function isPlausibleFace(
  detection: CompreFaceDetection,
  frameWidth: number,
  frameHeight: number,
  profile: 'standard' | 'distant' = 'standard',
): boolean {
  const floor = profile === 'distant' ? MIN_DISTANT_FACE_PROBABILITY : MIN_FACE_PROBABILITY;
  if (!detection?.box) return false;
  if (!(detection.box.probability >= floor)) return false;

  const { width, height, aspectRatio, relativeArea } = measureBox(detection, frameWidth, frameHeight);
  if (width <= 0 || height <= 0) return false;
  if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) return false;
  if (relativeArea > MAX_RELATIVE_AREA) return false;

  const minEdge = Math.min(frameWidth, frameHeight) * MIN_RELATIVE_EDGE;
  if (Math.min(width, height) < minEdge) return false;

  // A box escaping the frame by a wide margin is a mapping artefact, most
  // often from the tiled long-range pass.
  const slackX = frameWidth * 0.08;
  const slackY = frameHeight * 0.08;
  if (
    detection.box.x_min < -slackX ||
    detection.box.y_min < -slackY ||
    detection.box.x_max > frameWidth + slackX ||
    detection.box.y_max > frameHeight + slackY
  ) {
    return false;
  }

  return true;
}

export function filterImplausibleFaces(
  detections: CompreFaceDetection[],
  frameWidth: number,
  frameHeight: number,
  profile: 'standard' | 'distant' = 'standard',
): CompreFaceDetection[] {
  return detections.filter((detection) => isPlausibleFace(detection, frameWidth, frameHeight, profile));
}

// ---------------------------------------------------------------------------
// Temporal persistence
// ---------------------------------------------------------------------------

interface TrackedCandidate {
  cx: number;
  cy: number;
  size: number;
  hits: number;
  misses: number;
  confirmed: boolean;
  lastSeen: number;
}

export interface PresenceResult {
  /** Detections belonging to a track that has been confirmed over time. */
  confirmed: CompreFaceDetection[];
  /** True when at least one face is confirmed present. */
  facePresent: boolean;
  /** Candidates seen this scan that are not yet confirmed. */
  pendingCount: number;
}

/**
 * Confirms a face only after it has been observed in several consecutive
 * scans at a consistent position, and keeps it confirmed through brief
 * detector dropouts so a real person does not flicker on and off.
 */
export class FacePresenceTracker {
  private candidates: TrackedCandidate[] = [];

  constructor(
    /** Consecutive scans a new face must appear in before being reported. */
    private readonly framesToConfirm = 3,
    /** Scans a confirmed face may be missing before it is dropped. */
    private readonly framesToDrop = 3,
    /** Association radius as a fraction of the face's own size. */
    private readonly associationFactor = 1.4,
  ) {}

  reset(): void {
    this.candidates = [];
  }

  /** Number of tracks currently confirmed as really present. */
  get confirmedCount(): number {
    return this.candidates.filter((candidate) => candidate.confirmed).length;
  }

  update(detections: CompreFaceDetection[], now = Date.now()): PresenceResult {
    const unmatched = new Set(this.candidates);
    const confirmed: CompreFaceDetection[] = [];
    let pendingCount = 0;

    detections.forEach((detection) => {
      const cx = (detection.box.x_min + detection.box.x_max) / 2;
      const cy = (detection.box.y_min + detection.box.y_max) / 2;
      const size = Math.max(
        1,
        Math.max(detection.box.x_max - detection.box.x_min, detection.box.y_max - detection.box.y_min),
      );

      // Associate with the nearest existing track inside a size-relative radius.
      let best: TrackedCandidate | null = null;
      let bestDistance = Infinity;
      this.candidates.forEach((candidate) => {
        const distance = Math.hypot(candidate.cx - cx, candidate.cy - cy);
        const radius = this.associationFactor * Math.max(size, candidate.size);
        if (distance < radius && distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      });

      if (best) {
        const track = best as TrackedCandidate;
        track.cx = cx;
        track.cy = cy;
        track.size = size;
        track.hits++;
        track.misses = 0;
        track.lastSeen = now;
        if (track.hits >= this.framesToConfirm) track.confirmed = true;
        unmatched.delete(track);
        if (track.confirmed) confirmed.push(detection);
        else pendingCount++;
      } else {
        this.candidates.push({ cx, cy, size, hits: 1, misses: 0, confirmed: false, lastSeen: now });
        pendingCount++;
      }
    });

    // Age out tracks that were not seen in this scan.
    unmatched.forEach((candidate) => {
      candidate.misses++;
      // An unconfirmed flicker is discarded immediately; a confirmed person is
      // allowed a short grace period through detector dropouts.
      if (!candidate.confirmed || candidate.misses >= this.framesToDrop) {
        this.candidates = this.candidates.filter((entry) => entry !== candidate);
      }
    });

    return {
      confirmed,
      facePresent: this.candidates.some((candidate) => candidate.confirmed),
      pendingCount,
    };
  }
}
