import assert from 'node:assert/strict';
import test from 'node:test';
import { isGlobalCameraMotion, createLocalMotionState, observeLocalMotion } from '../src/services/cameraMotionGuard';

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


// --- local motion sampling (recognition debounce) -----------------------------

function stubDocumentWithSampleCanvas(grayscales: number[][]) {
  const original = (globalThis as any).document;
  let call = 0;
  (globalThis as any).document = {
    createElement: () => {
      const index = Math.min(call, grayscales.length - 1);
      call += 1;
      const gray = grayscales[index];
      const data = new Uint8Array(32 * 18 * 4);
      for (let i = 0; i < gray.length; i++) {
        data[i * 4] = gray[i];
        data[i * 4 + 1] = gray[i];
        data[i * 4 + 2] = gray[i];
        data[i * 4 + 3] = 255;
      }
      return {
        width: 32,
        height: 18,
        getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) }),
      };
    },
  };
  return () => { (globalThis as any).document = original; };
}

test('the first local motion sample always counts as motion', () => {
  const restore = stubDocumentWithSampleCanvas([new Array(32 * 18).fill(100)]);
  try {
    const state = createLocalMotionState();
    const sample = observeLocalMotion(state, {} as CanvasImageSource);
    assert.equal(sample.hasMotion, true);
  } finally {
    restore();
  }
});

test('a still scene produces no motion and no frame is sent', () => {
  const still = new Array(32 * 18).fill(100);
  const restore = stubDocumentWithSampleCanvas([still, still.slice(), still.slice()]);
  try {
    const state = createLocalMotionState();
    observeLocalMotion(state, {} as CanvasImageSource);
    const sample = observeLocalMotion(state, {} as CanvasImageSource);
    assert.equal(sample.hasMotion, false);
    assert.equal(sample.changedFraction, 0);
  } finally {
    restore();
  }
});

test('a subject moving through the frame triggers motion', () => {
  const before = new Array(32 * 18).fill(100);
  const after = before.slice();
  // ~5% of the sampled pixels change hard: a person walking through.
  for (let i = 100; i < 130; i++) after[i] = 220;
  const restore = stubDocumentWithSampleCanvas([before, after]);
  try {
    const state = createLocalMotionState();
    observeLocalMotion(state, {} as CanvasImageSource);
    const sample = observeLocalMotion(state, {} as CanvasImageSource);
    assert.equal(sample.hasMotion, true);
    assert.ok(sample.changedFraction >= 0.025);
  } finally {
    restore();
  }
});

test('a single flickering pixel is compression noise, not motion', () => {
  const before = new Array(32 * 18).fill(100);
  const after = before.slice();
  after[7] = 200;
  const restore = stubDocumentWithSampleCanvas([before, after]);
  try {
    const state = createLocalMotionState();
    observeLocalMotion(state, {} as CanvasImageSource);
    const sample = observeLocalMotion(state, {} as CanvasImageSource);
    assert.equal(sample.hasMotion, false);
  } finally {
    restore();
  }
});
