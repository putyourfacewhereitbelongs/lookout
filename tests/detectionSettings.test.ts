import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_PET_MATCH_THRESHOLD,
  confirmationScans,
  conservativeIdentityThreshold,
  deliveryLabelAllowed,
  detectionCenter,
  detectionCenterInZone,
  detectionPassesCategory,
  faceProbabilityFloor,
  findTrackForDetection,
  identityThreshold,
  isHexColor,
  isNegativeSubject,
  petMatchThreshold,
  unknownFaceAlertKey,
} from '../src/services/detectionSettings';
import { PetMatchConfirmer, PetMatch } from '../src/services/petRecognitionService';
import { CategorySensitivity, CompreFaceDetection, DetectionObject, DetectionSensitivities } from '../src/types';
import { MIN_FACE_PROBABILITY } from '../src/services/faceDetectionGate';

function category(overrides: Partial<CategorySensitivity> = {}): CategorySensitivity {
  return {
    enabled: true,
    sensitivity: 70,
    confidenceThreshold: 0.6,
    highlightColor: '#ef4444',
    triggerAlert: true,
    audibleChime: false,
    detectionZone: 'full_frame',
    ...overrides,
  };
}

function detection(overrides: Partial<CompreFaceDetection['box']> = {}): CompreFaceDetection {
  return {
    box: { probability: 0.95, x_min: 500, y_min: 260, x_max: 660, y_max: 420, ...overrides },
  };
}

const FRAME_W = 1280;
const FRAME_H = 720;

// --- identity thresholds ---------------------------------------------------

test('the face match slider is honored across its full range', () => {
  assert.equal(identityThreshold(0.85), 0.85);
  assert.equal(identityThreshold(0.92), 0.92);
  assert.equal(identityThreshold(0.99), 0.99);
});

test('out-of-range or invalid slider values fall back to safe bounds', () => {
  assert.equal(identityThreshold(0.4), 0.85);
  assert.equal(identityThreshold(Number.NaN), 0.92);
  assert.equal(identityThreshold(0), 0.92);
});

test('alert identification stays a step above the naming threshold', () => {
  assert.equal(conservativeIdentityThreshold(0.85), 0.9);
  assert.equal(conservativeIdentityThreshold(0.92), 0.97);
  assert.equal(conservativeIdentityThreshold(0.99), 0.99);
  for (const preference of [0.85, 0.88, 0.9, 0.92, 0.95, 0.97]) {
    assert.ok(
      conservativeIdentityThreshold(preference) >= identityThreshold(preference),
      `alert gate must never sit below the naming threshold at ${preference}`,
    );
  }
});

test('raising the slider never makes alerts stricter than the shipped 97% behavior', () => {
  // Before the slider was live, alerts effectively required 97% (or the
  // slider when it was above 0.97). A high slider value must not silently
  // demand more than that, or people who used to be recognized stop being
  // announced.
  const oldEffectiveAlertThreshold = (slider: number) => Math.max(0.97, slider);
  for (const slider of [0.85, 0.88, 0.9, 0.92, 0.93, 0.94, 0.95, 0.96, 0.97, 0.98, 0.99]) {
    assert.ok(
      conservativeIdentityThreshold(slider) <= oldEffectiveAlertThreshold(slider) + 1e-9,
      `alert threshold at slider ${slider} regressed beyond the previous release`,
    );
  }
  assert.equal(conservativeIdentityThreshold(0.95), 0.97);
  assert.equal(conservativeIdentityThreshold(0.96), 0.97);
  assert.equal(conservativeIdentityThreshold(0.97), 0.97);
  assert.equal(conservativeIdentityThreshold(0.98), 0.98);
});

// --- detection confidence floor ---------------------------------------------

test('the category confidence slider can only raise the built-in false-positive floor', () => {
  assert.equal(faceProbabilityFloor(category({ confidenceThreshold: 0.3 })), MIN_FACE_PROBABILITY);
  assert.equal(faceProbabilityFloor(category({ confidenceThreshold: 0.6 })), MIN_FACE_PROBABILITY);
  assert.equal(faceProbabilityFloor(category({ confidenceThreshold: 0.9 })), 0.9);
  assert.equal(faceProbabilityFloor(category({ confidenceThreshold: 5 })), 0.99);
});

// --- confirmation strictness -------------------------------------------------

test('the sensitivity slider maps to consecutive confirmation scans', () => {
  assert.equal(confirmationScans(100), 1);
  assert.equal(confirmationScans(90), 1);
  assert.equal(confirmationScans(70), 2);
  assert.equal(confirmationScans(60), 2);
  assert.equal(confirmationScans(50), 3);
  assert.equal(confirmationScans(40), 3);
  assert.equal(confirmationScans(30), 5);
  assert.equal(confirmationScans(10), 6);
  // The shipped default of 70 confirms after two agreeing scans.
  assert.equal(confirmationScans(70), 2);
});

// --- pet matching threshold ---------------------------------------------------

test('pet matching never drops below the stricter base floor', () => {
  assert.equal(petMatchThreshold(category({ confidenceThreshold: 0.5 })), BASE_PET_MATCH_THRESHOLD);
  assert.equal(petMatchThreshold(category({ confidenceThreshold: 0.6 })), BASE_PET_MATCH_THRESHOLD);
  assert.equal(petMatchThreshold(category({ confidenceThreshold: 0.9 })), 0.9);
});

// --- monitored zones -----------------------------------------------------------

test('detection centers are normalized to the frame', () => {
  const center = detectionCenter(detection(), FRAME_W, FRAME_H);
  assert.ok(Math.abs(center.x - (580 / 1280)) < 1e-9);
  assert.ok(Math.abs(center.y - (340 / 720)) < 1e-9);
});

test('the central zone keeps mid-frame faces and drops edge faces', () => {
  const central = category({ detectionZone: 'central_zone' });
  assert.equal(detectionCenterInZone(detection(), FRAME_W, FRAME_H, 'central_zone'), true);
  const edge = detection({ x_min: 10, x_max: 170, y_min: 260, y_max: 420 });
  assert.equal(detectionCenterInZone(edge, FRAME_W, FRAME_H, 'central_zone'), false);
  assert.equal(detectionPassesCategory(edge, FRAME_W, FRAME_H, central), false);
});

test('the perimeter zone does the opposite of the central zone', () => {
  const perimeter = category({ detectionZone: 'perimeter_only' });
  const edge = detection({ x_min: 10, x_max: 170, y_min: 260, y_max: 420 });
  assert.equal(detectionCenterInZone(edge, FRAME_W, FRAME_H, 'perimeter_only'), true);
  assert.equal(detectionCenterInZone(detection(), FRAME_W, FRAME_H, 'perimeter_only'), false);
  assert.equal(detectionPassesCategory(detection(), FRAME_W, FRAME_H, perimeter), false);
});

test('a disabled category lets nothing through', () => {
  assert.equal(detectionPassesCategory(detection(), FRAME_W, FRAME_H, category({ enabled: false })), false);
});

test('the confidence floor filters weak detections', () => {
  const strict = category({ confidenceThreshold: 0.94 });
  assert.equal(detectionPassesCategory(detection({ probability: 0.9 }), FRAME_W, FRAME_H, strict), false);
  assert.equal(detectionPassesCategory(detection({ probability: 0.96 }), FRAME_W, FRAME_H, strict), true);
});

// --- unknown-face alert grid ---------------------------------------------------

test('the unknown-face alert key is stable inside a grid cell', () => {
  const first = unknownFaceAlertKey('cam-1', 0.31, 0.52);
  assert.equal(unknownFaceAlertKey('cam-1', 0.33, 0.55), first);
});

test('the unknown-face alert key changes across cells and cameras', () => {
  assert.notEqual(unknownFaceAlertKey('cam-1', 0.1, 0.1), unknownFaceAlertKey('cam-1', 0.8, 0.1));
  assert.notEqual(unknownFaceAlertKey('cam-1', 0.1, 0.1), unknownFaceAlertKey('cam-2', 0.1, 0.1));
});

// --- delivery notifier gates -----------------------------------------------------

function sensitivities(overrides: Partial<DetectionSensitivities> = {}): DetectionSensitivities {
  return {
    fixedCameraGuard: false,
    people: category(),
    threats: category(),
    animals: category(),
    cars: category({ enabled: true }),
    objects: category({ enabled: true }),
    weather: category(),
    ...overrides,
  };
}

test('delivery labels follow the vehicles and objects category switches', () => {
  const base = sensitivities();
  assert.equal(deliveryLabelAllowed('Delivery truck in the driveway', base), true);
  assert.equal(deliveryLabelAllowed('Package on the doorstep', base), true);

  const noCars = sensitivities({ cars: category({ enabled: false }) });
  assert.equal(deliveryLabelAllowed('Delivery truck in the driveway', noCars), false);
  assert.equal(deliveryLabelAllowed('Package on the doorstep', noCars), true);

  const noObjects = sensitivities({ objects: category({ enabled: false }) });
  assert.equal(deliveryLabelAllowed('Package on the doorstep', noObjects), false);
  assert.equal(deliveryLabelAllowed('Delivery truck in the driveway', noObjects), true);
});

// --- hex color guard ---------------------------------------------------------------

test('only well-formed colors are treated as highlight colors', () => {
  assert.equal(isHexColor('#ef4444'), true);
  assert.equal(isHexColor('#fff'), true);
  assert.equal(isHexColor('rgb(1, 2, 3)'), false);
  assert.equal(isHexColor('javascript:alert(1)'), false);
  assert.equal(isHexColor(42), false);
});

// --- pet match corroboration ---------------------------------------------------------

function petMatch(name: string, similarity = 0.9): PetMatch {
  return {
    profile: {
      id: `fp-${name}`,
      name,
      subjectType: 'animal',
      role: 'pet',
      thumbnail: '',
      snapshots: [],
      clusterId: `cluster-${name}`,
      similarityScore: similarity,
      firstSeen: 0,
      lastSeen: 0,
    },
    similarity,
  };
}

test('a single pet-photo match is never enough to name a subject', () => {
  const confirmer = new PetMatchConfirmer();
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Max')), null);
});

test('a second agreeing scan confirms the pet', () => {
  const confirmer = new PetMatchConfirmer();
  confirmer.confirm('cell-0-0', petMatch('Max'), 1_000);
  const confirmed = confirmer.confirm('cell-0-0', petMatch('Max'), 2_000);
  assert.equal(confirmed?.profile.name, 'Max');
});

test('a disagreement resets the confirmation track', () => {
  const confirmer = new PetMatchConfirmer();
  confirmer.confirm('cell-0-0', petMatch('Max'), 1_000);
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Bella'), 2_000), null);
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Bella'), 3_000)?.profile.name, 'Bella');
});

test('an expired corroboration window starts over', () => {
  const confirmer = new PetMatchConfirmer(1_000);
  confirmer.confirm('cell-0-0', petMatch('Max'), 1_000);
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Max'), 5_000), null);
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Max'), 6_000)?.profile.name, 'Max');
});

test('separate detection tracks confirm independently', () => {
  const confirmer = new PetMatchConfirmer();
  confirmer.confirm('cell-0-0', petMatch('Max'), 1_000);
  assert.equal(confirmer.confirm('cell-2-1', petMatch('Max'), 2_000), null);
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Max'), 3_000)?.profile.name, 'Max');
  assert.equal(confirmer.confirm('cell-2-1', petMatch('Max'), 4_000)?.profile.name, 'Max');
});

test('a lost match clears that track only', () => {
  const confirmer = new PetMatchConfirmer();
  confirmer.confirm('cell-0-0', petMatch('Max'), 1_000);
  confirmer.confirm('cell-1-1', petMatch('Bella'), 1_000);
  assert.equal(confirmer.confirm('cell-0-0', null, 2_000), null);
  assert.equal(confirmer.confirm('cell-0-0', petMatch('Max'), 3_000), null);
  assert.equal(confirmer.confirm('cell-1-1', petMatch('Bella'), 3_000)?.profile.name, 'Bella');
});

// --- negative / noise subject profiles ----------------------------------------

test('recognizes negative/noise subject profile names', () => {
  assert.equal(isNegativeSubject('Background_Noise'), true);
  assert.equal(isNegativeSubject('background_noise'), true);
  assert.equal(isNegativeSubject('unknown_classifiers'), true);
  assert.equal(isNegativeSubject(' Negative_Samples '), true);
  assert.equal(isNegativeSubject('do_not_match'), true);
  assert.equal(isNegativeSubject('Brian'), false);
  assert.equal(isNegativeSubject('Background Noisy'), false);
  assert.equal(isNegativeSubject(''), false);
  assert.equal(isNegativeSubject(null), false);
  assert.equal(isNegativeSubject(undefined), false);
});

// --- tracked-object lookup for per-face state ---------------------------------

test('finds the tightest tracked object containing the detection center', () => {
  const objects = [
    { id: 'big', category: 'person', bbox: [0, 0, 0.9, 0.9] },
    { id: 'tight', category: 'person', bbox: [0.4, 0.4, 0.2, 0.2] },
    { id: 'car', category: 'car', bbox: [0.4, 0.4, 0.2, 0.2] },
  ] as unknown as DetectionObject[];
  const inside = { box: { x_min: 500, y_min: 400, x_max: 560, y_max: 460 } } as CompreFaceDetection;
  assert.equal(findTrackForDetection(objects, inside, 1000, 900)?.id, 'tight');
  const outside = { box: { x_min: 950, y_min: 850, x_max: 990, y_max: 890 } } as CompreFaceDetection;
  assert.equal(findTrackForDetection(objects, outside, 1000, 900), null);
});
