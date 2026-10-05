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

/**
 * Hard absolute floor for the smallest face edge (in pixels of the submitted
 * image) that may drive recognition. Below roughly 60 px a live face has too
 * little detail to embed reliably and mismatches against crisp reference
 * photos, so it is not trusted for identity at all. The long-range tiles are
 * upscaled ~2x before submission, so this floor applies in tile coordinates
 * there — a ~30 px source face still gets its chance through the tiled pass.
 */
export const MIN_ABSOLUTE_FACE_EDGE = 60;

/** A single face cannot sensibly cover almost the whole frame. */
const MAX_RELATIVE_AREA = 0.92;

// --- Landmark geometry -----------------------------------------------------
//
// CompreFace is asked for the 5-point landmarks plugin (eyes, nose, mouth
// corners). Embeddings degrade quickly once a face is turned or tilted far
// off-frontal, and those frames are exactly where false names come from, so
// such boxes are dropped before any identity work happens.

/** Head roll (eye line vs. horizontal) beyond which a match is not trusted. */
export const MAX_FACE_ROLL_DEGREES = 20;

/**
 * Largest tolerable nose-to-eye distance imbalance. Near-frontal faces sit
 * the nose at a comparable distance from both eyes; a hard profile turn
 * skews the ratio towards 2 and beyond.
 */
export const MAX_PROFILE_EYE_NOSE_RATIO = 2.2;

/**
 * Geometry check on the 5-point landmarks. Returns true (plausible) whenever
 * landmarks are absent or too small to reason about — providers that do not
 * return the plugin must not lose recognition entirely — and rejects heavy
 * roll, hard profile turns, and vertical nonsense (nose above the eyes,
 * mouth above the nose).
 */
export function landmarkGeometryPlausible(landmarks?: [number, number][] | null): boolean {
  if (!Array.isArray(landmarks) || landmarks.length < 5) return true;
  const [leftEye, rightEye, nose, mouthA, mouthB] = landmarks;
  if (!leftEye || !rightEye || !nose) return true;

  const eyeDx = Math.abs(rightEye[0] - leftEye[0]);
  const eyeDy = Math.abs(rightEye[1] - leftEye[1]);
  const eyeDistance = Math.hypot(eyeDx, eyeDy);
  // Landmarks on a tiny face are pixel noise; skip the check rather than
  // reject a real (already size-gated) face.
  if (eyeDistance < 4) return true;

  const rollDegrees = (Math.atan2(eyeDy, Math.max(eyeDx, 0.001)) * 180) / Math.PI;
  if (rollDegrees > MAX_FACE_ROLL_DEGREES) return false;

  const leftNoseDistance = Math.hypot(nose[0] - leftEye[0], nose[1] - leftEye[1]);
  const rightNoseDistance = Math.hypot(nose[0] - rightEye[0], nose[1] - rightEye[1]);
  const profileRatio =
    Math.max(leftNoseDistance, rightNoseDistance) / Math.max(Math.min(leftNoseDistance, rightNoseDistance), 0.001);
  if (profileRatio > MAX_PROFILE_EYE_NOSE_RATIO) return false;

  // Vertical sanity with a little slack for detector jitter: the nose must
  // sit below the eye line and the mouth below the nose.
  const slack = eyeDistance * 0.05;
  const eyeMidY = (leftEye[1] + rightEye[1]) / 2;
  if (nose[1] < eyeMidY - slack) return false;
  if (mouthA && mouthB && (mouthA[1] + mouthB[1]) / 2 < nose[1] - slack) return false;

  return true;
}

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

  // Tiled distant scans deliberately enlarge the source crop before sending
  // it to CompreFace. Their useful minimum is therefore lower than the
  // standard full-frame pass: a roughly 16–20 px face in the source can become
  // a recognisable 32+ px face in the enlarged tile.
  const minimumAbsoluteEdge = profile === 'distant' ? 32 : MIN_ABSOLUTE_FACE_EDGE;
  const minEdge = Math.max(
    Math.min(frameWidth, frameHeight) * MIN_RELATIVE_EDGE,
    minimumAbsoluteEdge,
  );
  if (Math.min(width, height) < minEdge) return false;

  if (!landmarkGeometryPlausible(detection.landmarks)) return false;

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
    private framesToConfirm = 3,
    /** Scans a confirmed face may be missing before it is dropped. */
    private framesToDrop = 3,
    /** Association radius as a fraction of the face's own size. */
    private readonly associationFactor = 1.4,
  ) {}

  /**
   * Re-tune the confirmation strictness while running. The People sensitivity
   * slider maps onto framesToConfirm, so raising or lowering the setting takes
   * effect on the next scan instead of requiring a tracker restart.
   */
  configure(options: { framesToConfirm?: number; framesToDrop?: number }): void {
    if (Number.isFinite(options?.framesToConfirm)) {
      this.framesToConfirm = Math.max(1, Math.round(options.framesToConfirm as number));
    }
    if (Number.isFinite(options?.framesToDrop)) {
      this.framesToDrop = Math.max(1, Math.round(options.framesToDrop as number));
    }
  }

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
        // A brand-new track can confirm immediately when the configured
        // strictness is a single scan (maximum sensitivity).
        const candidate: TrackedCandidate = { cx, cy, size, hits: 1, misses: 0, confirmed: false, lastSeen: now };
        if (candidate.hits >= this.framesToConfirm) candidate.confirmed = true;
        this.candidates.push(candidate);
        if (candidate.confirmed) confirmed.push(detection);
        else pendingCount++;
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

// ---------------------------------------------------------------------------
// Gray-zone identity confirmation
// ---------------------------------------------------------------------------

/**
 * Dual-threshold identity confirmation.
 *
 * A match at or above the alert threshold is accepted immediately. Matches
 * that clear the naming threshold but not the alert threshold fall into a
 * gray zone: they are held until the same tracked face agrees on the same
 * subject for several consecutive scans. Any identity change, a drop below
 * the naming threshold, or a gap longer than `windowMs` resets the streak —
 * a gray-zone identity may never be confirmed by scattered, disagreeing, or
 * stale sightings.
 */
export class IdentityConfirmer {
  private tracks = new Map<string, { subject: string; streak: number; lastSeen: number }>();

  constructor(
    /** Consecutive agreeing scans required to confirm a gray-zone identity. */
    private readonly requiredStreak = 3,
    /** A gap longer than this between sightings resets the streak. */
    private readonly windowMs = 10_000,
  ) {}

  /**
   * Feed the strongest subject seen for one tracked face this scan. Pass
   * `null` when the face had no candidate at/above the naming threshold.
   */
  observe(trackKey: string, subject: string | null, now = Date.now()): void {
    if (!subject) {
      this.tracks.delete(trackKey);
      return;
    }
    const previous = this.tracks.get(trackKey);
    if (previous && previous.subject === subject && now - previous.lastSeen <= this.windowMs) {
      previous.streak += 1;
      previous.lastSeen = now;
    } else {
      this.tracks.set(trackKey, { subject, streak: 1, lastSeen: now });
    }
  }

  /** True when this track has agreed on `subject` for enough consecutive scans. */
  isConfirmed(trackKey: string, subject: string, now = Date.now()): boolean {
    const track = this.tracks.get(trackKey);
    return Boolean(
      track && track.subject === subject && track.streak >= this.requiredStreak && now - track.lastSeen <= this.windowMs,
    );
  }

  reset(): void {
    this.tracks.clear();
  }
}
