/** Returns true only when a substantial fraction of the frame changed together. */
export function isGlobalCameraMotion(previous: ArrayLike<number>, current: ArrayLike<number>): boolean {
  if (previous.length === 0 || previous.length !== current.length) return false;

  let changedPixels = 0;
  let totalDifference = 0;
  for (let i = 0; i < current.length; i++) {
    const difference = Math.abs(current[i] - previous[i]);
    totalDifference += difference;
    if (difference >= 25) changedPixels++;
  }

  return changedPixels / current.length >= 0.38 && totalDifference / current.length >= 18;
}

// --- Local motion sampling -------------------------------------------------
//
// The recognition cycle uses a tiny 32 × 18 grayscale sample of the camera
// frame to decide whether anything moved since the last scan. While the scene
// is still, frames are not sent to the recognizer at all (a slow heartbeat
// keeps tracks fresh); real motion immediately resumes full-rate scanning.
// This keeps CPU usage and CompreFace load proportional to actual activity.

export const LOCAL_MOTION_SAMPLE_WIDTH = 32;
export const LOCAL_MOTION_SAMPLE_HEIGHT = 18;
/** Grayscale delta (0–255) below which a pixel counts as unchanged. */
export const LOCAL_MOTION_PIXEL_TOLERANCE = 20;
/** Fraction of sampled pixels that must change to call the scene "in motion". */
export const LOCAL_MOTION_FRACTION = 0.025;

export interface LocalMotionState {
  previous: Uint8Array | null;
}

export function createLocalMotionState(): LocalMotionState {
  return { previous: null };
}

export interface LocalMotionSample {
  hasMotion: boolean;
  changedFraction: number;
}

/**
 * Sample `source` (usually the live video element) into the 32 × 18 grayscale
 * buffer and compare it with the previous sample held in `state`. The state
 * is updated in place. Fails open — a sampling problem must never stop
 * recognition, only fail to save work.
 */
export function observeLocalMotion(state: LocalMotionState, source: CanvasImageSource): LocalMotionSample {
  const canvas = document.createElement('canvas');
  canvas.width = LOCAL_MOTION_SAMPLE_WIDTH;
  canvas.height = LOCAL_MOTION_SAMPLE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return { hasMotion: true, changedFraction: 1 };

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const current = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < current.length; i++) {
    current[i] = (pixels[i * 4] * 299 + pixels[i * 4 + 1] * 587 + pixels[i * 4 + 2] * 114) / 1000;
  }

  const previous = state.previous;
  state.previous = current;
  // First sample (or a resolution change): assume motion so the very first
  // frames of a session always reach the recognizer.
  if (!previous || previous.length !== current.length) return { hasMotion: true, changedFraction: 1 };

  let changedPixels = 0;
  for (let i = 0; i < current.length; i++) {
    if (Math.abs(current[i] - previous[i]) >= LOCAL_MOTION_PIXEL_TOLERANCE) changedPixels++;
  }
  const changedFraction = changedPixels / current.length;
  return { hasMotion: changedFraction >= LOCAL_MOTION_FRACTION, changedFraction };
}
