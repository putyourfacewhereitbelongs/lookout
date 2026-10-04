import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlausibleFace,
  filterImplausibleFaces,
  FacePresenceTracker,
  MIN_FACE_PROBABILITY,
  MIN_DISTANT_FACE_PROBABILITY,
} from '../src/services/faceDetectionGate';
import { CompreFaceDetection } from '../src/types';

const FRAME_W = 1280;
const FRAME_H = 720;

function box(
  x: number,
  y: number,
  size: number,
  probability = 0.99,
  height = size,
): CompreFaceDetection {
  return {
    box: { x_min: x, y_min: y, x_max: x + size, y_max: y + height, probability },
  };
}

// --- probability floor -----------------------------------------------------

test('a low-probability blob is rejected', () => {
  assert.equal(isPlausibleFace(box(100, 100, 80, 0.45), FRAME_W, FRAME_H), false);
  assert.equal(isPlausibleFace(box(100, 100, 80, 0.70), FRAME_W, FRAME_H), false);
});

test('a confident face is accepted', () => {
  assert.equal(isPlausibleFace(box(100, 100, 80, 0.97), FRAME_W, FRAME_H), true);
});

test('the long-range tiled pass demands a higher probability', () => {
  const borderline = box(100, 100, 80, 0.88);
  assert.equal(isPlausibleFace(borderline, FRAME_W, FRAME_H, 'standard'), true);
  assert.equal(
    isPlausibleFace(borderline, FRAME_W, FRAME_H, 'distant'),
    false,
    'upscaled tiles amplify noise and must clear a stricter bar',
  );
  assert.ok(MIN_DISTANT_FACE_PROBABILITY > MIN_FACE_PROBABILITY);
});

// --- geometry --------------------------------------------------------------

test('absurd aspect ratios are rejected', () => {
  const wideStreak = box(100, 100, 300, 0.99, 40); // 7.5:1 smear
  const tallSliver = box(100, 100, 20, 0.99, 300); // 1:15 edge artefact
  assert.equal(isPlausibleFace(wideStreak, FRAME_W, FRAME_H), false);
  assert.equal(isPlausibleFace(tallSliver, FRAME_W, FRAME_H), false);
});

test('a speck of noise is too small to be a face', () => {
  assert.equal(isPlausibleFace(box(400, 300, 4, 0.99), FRAME_W, FRAME_H), false);
});

test('a box covering the whole frame is rejected', () => {
  const everything: CompreFaceDetection = {
    box: { x_min: 0, y_min: 0, x_max: FRAME_W, y_max: FRAME_H, probability: 0.99 },
  };
  assert.equal(isPlausibleFace(everything, FRAME_W, FRAME_H), false);
});

test('a box mapped far outside the frame is rejected', () => {
  const escaped: CompreFaceDetection = {
    box: { x_min: FRAME_W + 200, y_min: 100, x_max: FRAME_W + 300, y_max: 200, probability: 0.99 },
  };
  assert.equal(isPlausibleFace(escaped, FRAME_W, FRAME_H), false, 'tile mapping artefacts must not survive');
});

test('filtering keeps only the plausible detections', () => {
  const detections = [
    box(100, 100, 90, 0.98),
    box(300, 200, 5, 0.99),
    box(500, 300, 200, 0.40),
    box(700, 200, 100, 0.95),
  ];
  const kept = filterImplausibleFaces(detections, FRAME_W, FRAME_H);
  assert.equal(kept.length, 2);
});

// --- temporal persistence --------------------------------------------------

test('a one-frame flicker never reports a face', () => {
  const tracker = new FacePresenceTracker(3, 3);
  const result = tracker.update([box(100, 100, 90)]);
  assert.equal(result.facePresent, false, 'a single sighting is not a person');
  assert.equal(result.confirmed.length, 0);
  assert.equal(result.pendingCount, 1);
});

test('pareidolia jumping around the frame is never confirmed', () => {
  const tracker = new FacePresenceTracker(3, 3);
  // Wood grain / foliage: a "face" appears somewhere different each scan.
  const positions = [[50, 50], [600, 400], [200, 650], [1100, 80], [800, 300]];
  let present = false;
  positions.forEach(([x, y]) => {
    if (tracker.update([box(x, y, 70)]).facePresent) present = true;
  });
  assert.equal(present, false, 'uncorrelated blobs must never confirm a face');
});

test('a person standing still is confirmed after the required scans', () => {
  const tracker = new FacePresenceTracker(3, 3);
  assert.equal(tracker.update([box(400, 300, 100)]).facePresent, false);
  assert.equal(tracker.update([box(402, 301, 100)]).facePresent, false);
  const third = tracker.update([box(404, 303, 101)]);
  assert.equal(third.facePresent, true, 'three consistent sightings confirm a real face');
  assert.equal(third.confirmed.length, 1);
});

test('a walking person stays confirmed as they move across the frame', () => {
  const tracker = new FacePresenceTracker(3, 3);
  let confirmedThroughout = true;
  for (let i = 0; i < 12; i++) {
    const result = tracker.update([box(300 + i * 25, 300, 100)]);
    if (i >= 2 && !result.facePresent) confirmedThroughout = false;
  }
  assert.ok(confirmedThroughout, 'steady motion must not break the track');
});

test('a confirmed person survives a brief detector dropout', () => {
  const tracker = new FacePresenceTracker(3, 3);
  for (let i = 0; i < 3; i++) tracker.update([box(400, 300, 100)]);
  assert.equal(tracker.update([]).facePresent, true, 'one missed scan must not clear the scene');
  assert.equal(tracker.update([]).facePresent, true);
});

test('presence clears once the person is gone for long enough', () => {
  const tracker = new FacePresenceTracker(3, 3);
  for (let i = 0; i < 4; i++) tracker.update([box(400, 300, 100)]);
  tracker.update([]);
  tracker.update([]);
  assert.equal(tracker.update([]).facePresent, false, 'an empty scene must eventually report clear');
  assert.equal(tracker.confirmedCount, 0);
});

test('reset clears all accumulated confirmation', () => {
  const tracker = new FacePresenceTracker(3, 3);
  for (let i = 0; i < 4; i++) tracker.update([box(400, 300, 100)]);
  assert.equal(tracker.confirmedCount, 1);
  tracker.reset();
  assert.equal(tracker.confirmedCount, 0);
  assert.equal(tracker.update([box(400, 300, 100)]).facePresent, false, 'must re-confirm from scratch');
});

test('two people are tracked independently', () => {
  const tracker = new FacePresenceTracker(3, 3);
  for (let i = 0; i < 3; i++) tracker.update([box(200, 300, 90), box(900, 300, 90)]);
  assert.equal(tracker.confirmedCount, 2);
  const result = tracker.update([box(200, 300, 90), box(900, 300, 90)]);
  assert.equal(result.confirmed.length, 2);
});

test('end to end: a noisy empty scene produces no face presence', () => {
  const tracker = new FacePresenceTracker(3, 3);
  // Simulate 30 scans of an empty driveway: occasional low-probability
  // pareidolia at random places, all of which the gate should swallow.
  let seed = 99;
  const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let everPresent = false;

  for (let scan = 0; scan < 30; scan++) {
    const raw: CompreFaceDetection[] = [];
    if (random() < 0.4) {
      raw.push(box(Math.floor(random() * 1100), Math.floor(random() * 600), 40 + random() * 60, 0.5 + random() * 0.45));
    }
    const plausible = filterImplausibleFaces(raw, FRAME_W, FRAME_H);
    if (tracker.update(plausible).facePresent) everPresent = true;
  }

  assert.equal(everPresent, false, 'an empty scene must never announce a face');
});

// --- runtime reconfiguration ------------------------------------------------

test('configure() retunes confirmation strictness on the next scan', () => {
  const tracker = new FacePresenceTracker();
  const face = box(100, 100, 80);
  let result = tracker.update([face]);
  assert.equal(result.facePresent, false);

  // Low sensitivity now demands four agreeing scans.
  tracker.configure({ framesToConfirm: 4 });
  result = tracker.update([face]);
  result = tracker.update([face]);
  assert.equal(result.facePresent, false, 'three scans must not confirm when four are required');
  result = tracker.update([face]);
  assert.equal(result.facePresent, true, 'the fourth scan confirms');

  // High sensitivity confirms a new track on the very next scan.
  tracker.reset();
  tracker.configure({ framesToConfirm: 1 });
  result = tracker.update([face]);
  assert.equal(result.facePresent, true);
});
