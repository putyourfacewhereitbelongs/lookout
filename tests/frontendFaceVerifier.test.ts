import assert from 'node:assert/strict';
import test from 'node:test';
import { frontendFaceSupportsDetection, boxOverlap } from '../src/services/frontendFaceVerifier';
import type { CompreFaceDetection } from '../src/types';

const detection = (x = 100, y = 80, size = 100): CompreFaceDetection => ({
  box: { probability: 0.99, x_min: x, y_min: y, x_max: x + size, y_max: y + size },
});

test('front-end face inference supports a matching CompreFace box', () => {
  assert.ok(boxOverlap(detection().box, { x: 108, y: 85, width: 96, height: 100 }, 640, 360) > 0.08);
  assert.equal(frontendFaceSupportsDetection(detection(), [{ x: 108, y: 85, width: 96, height: 100 }], 640, 360), true);
});

test('front-end face inference rejects an unrelated CompreFace box', () => {
  assert.equal(frontendFaceSupportsDetection(detection(), [{ x: 430, y: 200, width: 70, height: 70 }], 640, 360), false);
});

test('center proximity keeps slightly different small-model boxes matched', () => {
  assert.equal(frontendFaceSupportsDetection(
    detection(300, 150, 28),
    [{ x: 317, y: 163, width: 22, height: 22 }],
    640,
    360,
  ), true);
});
