import assert from 'node:assert/strict';
import test from 'node:test';
import { FaceRecognitionService } from '../src/services/faceRecognitionService';
import type { CompreFaceDetection, DetectionObject } from '../src/types';

const service = new FaceRecognitionService();

function detection(subjects: Array<{ subject: string; similarity: number }> = []): CompreFaceDetection {
  return {
    box: { probability: 0.98, x_min: 100, y_min: 80, x_max: 300, y_max: 280 },
    subjects,
    landmarks: [[140, 150], [250, 151], [195, 190], [155, 230], [235, 230]],
  };
}

test('accepts a high, unambiguous identity match', () => {
  assert.equal(service.isReliableMatch(detection([{ subject: 'Alex', similarity: 0.95 }]), 0.92), true);
});

test('rejects matches below the safety floor even if the configured threshold is lower', () => {
  assert.equal(service.isReliableMatch(detection([{ subject: 'Alex', similarity: 0.89 }]), 0.75), false);
});

test('rejects close competing identity scores', () => {
  assert.equal(service.isReliableMatch(detection([
    { subject: 'Alex', similarity: 0.96 },
    { subject: 'Alec', similarity: 0.91 },
  ]), 0.92), false);
});

test('correlates every returned landmark into normalized frame coordinates', () => {
  const objects = service.correlateDetections([], [detection()], 400, 400, 0.92);
  assert.equal(objects.length, 1);
  assert.deepEqual(objects[0].landmarks, [
    [0.35, 0.375], [0.625, 0.3775], [0.4875, 0.475], [0.3875, 0.575], [0.5875, 0.575],
  ]);
  assert.equal(objects[0].isKnown, false);
});

test('keeps the recognition box close to the detected head instead of extending over shoulders', () => {
  const face = detection();
  face.box = { probability: 0.98, x_min: 140, y_min: 100, x_max: 220, y_max: 180 };
  const [person] = service.correlateDetections([], [face], 400, 400, 0.92);
  const [, , , height] = person.bbox;
  assert.ok(height <= 0.25, `expected a head-sized box, got normalized height ${height}`);
  assert.ok((person.silhouetteBbox?.[3] || 0) > height * 2, 'the person tint should use a larger segmentation region than the head label box');
});

test('retains one track through small frame-to-frame face movement', () => {
  const firstDetection = detection();
  const [first] = service.correlateDetections([], [firstDetection], 400, 400, 0.92);
  const shifted = detection();
  shifted.box.x_min += 12;
  shifted.box.x_max += 12;
  const next = service.correlateDetections([first], [shifted], 400, 400, 0.92);

  assert.equal(next.length, 1);
  assert.equal(next[0].id, first.id);
});

test('keeps the same head box attached through a larger position change', () => {
  const firstDetection = detection();
  firstDetection.box = { probability: 0.98, x_min: 140, y_min: 100, x_max: 220, y_max: 180 };
  const [first] = service.correlateDetections([], [firstDetection], 400, 400, 0.92);
  const firstX = first.targetBbox![0];

  const shifted = detection();
  shifted.box = { probability: 0.98, x_min: 185, y_min: 105, x_max: 265, y_max: 185 };
  const next = service.correlateDetections([first], [shifted], 400, 400, 0.92);

  assert.equal(next.length, 1);
  assert.equal(next[0].id, first.id);
  assert.ok(next[0].targetBbox![0] > firstX, 'the tracked box should move toward the new face position');
});

test('removes a person track after face observations stop', () => {
  const [recent] = service.correlateDetections([], [detection()], 400, 400, 0.92);
  const stale = { ...recent, id: 'stale-face', lastSeenTime: Date.now() - 5000 };
  const remaining = service.correlateDetections([recent, stale], [], 400, 400, 0.92);
  assert.deepEqual(remaining.map((item) => item.id), [recent.id]);

  const expired = { ...recent, lastSeenTime: Date.now() - 5000 };
  assert.deepEqual(service.stepPhysicsTracking([expired]), []);
});

test('time-based tracking smoothing moves toward a target without overshooting', () => {
  const tracked = {
    ...({} as DetectionObject),
    id: 'smooth-1',
    bbox: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number],
    targetBbox: [0.5, 0.4, 0.2, 0.2] as [number, number, number, number],
    motionVector: [0.3, 0.2] as [number, number],
  };
  const [smoothed] = service.stepPhysicsTracking([tracked]);
  assert.ok(smoothed.bbox[0] > 0.1 && smoothed.bbox[0] < 0.5);
  assert.ok(smoothed.bbox[1] > 0.1 && smoothed.bbox[1] < 0.4);
  assert.deepEqual(smoothed.motionVector, [0, 0]);
});

test('preserves non-person objects while matching face detections', () => {
  const existing = [{
    id: 'car-1', label: 'CAR', category: 'car', confidence: 0.9,
    bbox: [0.1, 0.1, 0.3, 0.3], threatLevel: 'none', motionVector: [0, 0],
  }] as unknown as DetectionObject[];
  const objects = service.correlateDetections(existing, [detection()], 400, 400, 0.92);
  assert.equal(objects.some((object) => object.id === 'car-1'), true);
  assert.equal(objects.filter((object) => object.category === 'person').length, 1);
});
