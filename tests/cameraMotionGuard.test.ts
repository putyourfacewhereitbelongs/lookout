import assert from 'node:assert/strict';
import test from 'node:test';
import { isGlobalCameraMotion } from '../src/services/cameraMotionGuard';

test('detects broad scene changes that are consistent with camera movement', () => {
  const still = new Uint8Array(32 * 18).fill(70);
  const shifted = new Uint8Array(32 * 18).fill(130);
  assert.equal(isGlobalCameraMotion(still, shifted), true);
});

test('does not treat a localized moving subject as camera movement', () => {
  const still = new Uint8Array(32 * 18).fill(70);
  const subjectMoved = still.slice();
  subjectMoved.fill(180, 120, 240);
  assert.equal(isGlobalCameraMotion(still, subjectMoved), false);
});

test('ignores unchanged or incompatible frame samples', () => {
  const still = new Uint8Array(32 * 18).fill(90);
  assert.equal(isGlobalCameraMotion(still, still.slice()), false);
  assert.equal(isGlobalCameraMotion(still, new Uint8Array(10).fill(150)), false);
  assert.equal(isGlobalCameraMotion(new Uint8Array(), new Uint8Array()), false);
});
