import { CategorySensitivity, CompreFaceDetection, DetectionSensitivities, DetectionObject } from '../types';
import { MIN_FACE_PROBABILITY } from './faceDetectionGate';

/**
 * Bridge between the Settings panels and the live detection pipeline.
 *
 * Every value the sensitivity matrix and the face-database sliders expose is
 * translated here into a concrete gate the recognition loop applies to real
 * detections. Keeping this pure means the wiring is unit-testable and the UI
 * can show the exact effect a control has before the user commits to it.
 */

/** Slider bounds of the Face Database similarity setting. */
export const FACE_MATCH_SLIDER_MIN = 0.85;
export const FACE_MATCH_SLIDER_MAX = 0.99;
export const DEFAULT_FACE_MATCH_THRESHOLD = 0.92;

/**
 * Naming a face on the HUD uses the slider value directly. Alert-level
 * identification asks for a small step above the slider, but never exceeds
 * the shipped 97% strictness that recognized people before the slider was
 * live — raising the slider above 0.92 must not silently make alerts harder
 * than they used to be.
 */
export const CONSERVATIVE_MATCH_MARGIN = 0.05;
export const CONSERVATIVE_MATCH_MIN = 0.9;
export const CONSERVATIVE_MATCH_CEILING = 0.97;

/**
 * Local pet recognition compares tiny colour signatures, so it is far weaker
 * than CompreFace's embeddings. It only runs when the match is strong and has
 * been confirmed by a second agreeing scan (see PetMatchConfirmer).
 */
export const BASE_PET_MATCH_THRESHOLD = 0.85;
export const PET_MATCH_THRESHOLD_MAX = 0.98;

/** Fraction of the frame each side that the "center focus" zone excludes. */
const CENTRAL_ZONE_INSET = 0.2;

/** Grid resolution used to tell "same spot again" from "someone new". */
const ALERT_GRID_CELLS = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keeps threshold arithmetic free of floating-point dust (0.92 + 0.05 !== 0.97). */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The identity threshold used for on-screen naming, taken straight from the
 * Face Database similarity slider across its full 85–99% range. A missing or
 * zero preference means "unset" and falls back to the shipped default.
 */
export function identityThreshold(preference: number): number {
  const value = Number.isFinite(preference) && preference > 0 ? preference : DEFAULT_FACE_MATCH_THRESHOLD;
  return round3(clamp(value, FACE_MATCH_SLIDER_MIN, FACE_MATCH_SLIDER_MAX));
}

/**
 * The stricter identity threshold required before a name may raise an alert,
 * history event, or DVR reaction: a small step above the naming threshold,
 * capped at the shipped 97% behavior, and never below the slider itself.
 */
export function conservativeIdentityThreshold(preference: number): number {
  const slider = identityThreshold(preference);
  const withMargin = round3(clamp(slider + CONSERVATIVE_MATCH_MARGIN, CONSERVATIVE_MATCH_MIN, CONSERVATIVE_MATCH_CEILING));
  return Math.max(slider, withMargin);
}

/**
 * Detector confidence a face box must clear to be considered at all. The
 * built-in false-positive floor from the detection gate is the minimum; the
 * category's confidence slider can only raise it.
 */
export function faceProbabilityFloor(category: CategorySensitivity): number {
  const preference = Number.isFinite(category?.confidenceThreshold) ? category.confidenceThreshold : 0;
  return clamp(Math.max(MIN_FACE_PROBABILITY, preference), MIN_FACE_PROBABILITY, 0.99);
}

/**
 * Consecutive scans a face must appear in before it is reported. High
 * sensitivity confirms quickly; low sensitivity demands more evidence, which
 * is the main defence against flickering pareidolia detections.
 */
export function confirmationScans(sensitivity: number): number {
  const value = Number.isFinite(sensitivity) ? sensitivity : 70;
  if (value >= 100) return 1;
  if (value >= 90) return 2;
  if (value >= 60) return 3;
  if (value >= 40) return 4;
  if (value >= 20) return 5;
  return 6;
}

/**
 * Similarity a local pet-photo signature match must reach before the pet can
 * be labeled. The category slider can raise it, never lower it, because the
 * underlying comparison is a coarse colour heuristic.
 */
export function petMatchThreshold(category: CategorySensitivity): number {
  const preference = Number.isFinite(category?.confidenceThreshold) ? category.confidenceThreshold : 0;
  return clamp(Math.max(BASE_PET_MATCH_THRESHOLD, preference), BASE_PET_MATCH_THRESHOLD, PET_MATCH_THRESHOLD_MAX);
}

/** Center of a detection box in normalized frame coordinates. */
export function detectionCenter(detection: CompreFaceDetection, frameWidth: number, frameHeight: number): { x: number; y: number } {
  const cx = frameWidth > 0 ? ((detection.box.x_min + detection.box.x_max) / 2) / frameWidth : 0;
  const cy = frameHeight > 0 ? ((detection.box.y_min + detection.box.y_max) / 2) / frameHeight : 0;
  return { x: clamp(cx, 0, 1), y: clamp(cy, 0, 1) };
}

/**
 * Whether a detection's center lies inside the zone a category monitors:
 * the whole frame, the central region, or everywhere except that center.
 */
export function detectionCenterInZone(
  detection: CompreFaceDetection,
  frameWidth: number,
  frameHeight: number,
  zone: CategorySensitivity['detectionZone'],
): boolean {
  const { x, y } = detectionCenter(detection, frameWidth, frameHeight);
  const inCentralZone = x >= CENTRAL_ZONE_INSET && x <= 1 - CENTRAL_ZONE_INSET &&
    y >= CENTRAL_ZONE_INSET && y <= 1 - CENTRAL_ZONE_INSET;
  if (zone === 'central_zone') return inCentralZone;
  if (zone === 'perimeter_only') return !inCentralZone;
  return true;
}

/**
 * A detection participates in a category's pipeline only when it clears that
 * category's confidence floor and lies inside its monitored zone.
 */
export function detectionPassesCategory(
  detection: CompreFaceDetection,
  frameWidth: number,
  frameHeight: number,
  category: CategorySensitivity,
): boolean {
  if (!category?.enabled) return false;
  if (detection?.box?.probability < faceProbabilityFloor(category)) return false;
  return detectionCenterInZone(detection, frameWidth, frameHeight, category.detectionZone);
}

/**
 * Coarse position key for unknown-face alerts. A face-like poster that stays
 * in one place keeps hitting the same cell and is throttled hard, while a
 * person moving through the view crosses cells and alerts normally.
 */
export function unknownFaceAlertKey(cameraId: string, centerX: number, centerY: number): string {
  const cellX = clamp(Math.floor(centerX * ALERT_GRID_CELLS), 0, ALERT_GRID_CELLS - 1);
  const cellY = clamp(Math.floor(centerY * ALERT_GRID_CELLS), 0, ALERT_GRID_CELLS - 1);
  return `${cameraId}:${cellX}:${cellY}`;
}

const DELIVERY_VEHICLE_LABEL = /(?:ups|u\.?s\.?p\.?s|fed.?ex|amazon|usps|postal|mail|delivery|courier|truck|van)/i;
const DELIVERY_PARCEL_LABEL = /(?:package|parcel|box)/i;

/**
 * The delivery-activity notifier follows the vehicle and object category
 * switches: vehicle-like labels need the cars category, package-like labels
 * need the objects category.
 */
export function deliveryLabelAllowed(label: string, sensitivities: DetectionSensitivities): boolean {
  const text = String(label || '');
  const vehicle = DELIVERY_VEHICLE_LABEL.test(text);
  const parcel = DELIVERY_PARCEL_LABEL.test(text);
  return (vehicle && sensitivities?.cars?.enabled !== false) || (parcel && sensitivities?.objects?.enabled !== false);
}

/** Only well-formed hex colors reach the canvas, so bad input cannot freeze a style. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
}

// ---------------------------------------------------------------------------
// Negative / noise subject profiles
// ---------------------------------------------------------------------------

/**
 * Subject names that mean "this is known noise, never identify it". Enroll a
 * CompreFace subject under one of these names (e.g. `Background_Noise`) using
 * photos of whatever the system keeps falsely identifying — a poster, a
 * reflection, a photo on the wall — and detections matching it are dropped
 * entirely: no identity, no unknown-person alert, no face-album cataloging.
 */
const NEGATIVE_SUBJECT_PATTERN =
  /^(unknown_classifiers?|background_noise|negative_samples?|negatives?|noise|do_not_match|ignore_face|ignore_this_face)$/i;

export function isNegativeSubject(name: string | null | undefined): boolean {
  return typeof name === 'string' && NEGATIVE_SUBJECT_PATTERN.test(name.trim());
}

/**
 * Find the tracked object a detection belongs to, by containment of the
 * detection center in the object's box (smallest containing box wins). Used
 * to key per-face state — like gray-zone identity confirmation — to a stable
 * track id that survives the face moving between scans.
 */
export function findTrackForDetection(
  objects: DetectionObject[],
  detection: CompreFaceDetection,
  frameWidth: number,
  frameHeight: number,
): DetectionObject | null {
  if (frameWidth <= 0 || frameHeight <= 0) return null;
  const centerX = ((detection.box.x_min + detection.box.x_max) / 2) / frameWidth;
  const centerY = ((detection.box.y_min + detection.box.y_max) / 2) / frameHeight;
  let best: DetectionObject | null = null;
  let bestArea = Infinity;
  for (const object of objects) {
    if (object.category !== 'person' && object.category !== 'animal') continue;
    const [x, y, width, height] = object.bbox;
    if (centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height) {
      const area = width * height;
      if (area < bestArea) {
        bestArea = area;
        best = object;
      }
    }
  }
  return best;
}
