import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64PayloadBytes,
  encodeCanvasWithinByteBudget,
  MAX_RECOGNITION_IMAGE_BYTES,
} from '../src/services/imageEncoding';

// --- base64 budget math --------------------------------------------------------

test('computes the decoded byte size of base64 data URLs', () => {
  assert.equal(base64PayloadBytes('AA=='), 1);
  assert.equal(base64PayloadBytes('AAA'), 2);
  assert.equal(base64PayloadBytes('QUJD'), 3); // "ABC"
  assert.equal(base64PayloadBytes('data:image/jpeg;base64,QUJD'), 3);
  assert.equal(base64PayloadBytes(''), 0);
});

test('the recognition payload budget stays at 100KB', () => {
  assert.equal(MAX_RECOGNITION_IMAGE_BYTES, 100 * 1024);
});

// --- budgeted canvas encoding ---------------------------------------------------

interface FakeCanvasOptions {
  width: number;
  height: number;
  /** Data URLs returned per toDataURL call; the last entry repeats. */
  dataUrls: string[];
}

function fakeCanvas({ width, height, dataUrls }: FakeCanvasOptions) {
  let calls = 0;
  return {
    width,
    height,
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => {
      const url = dataUrls[Math.min(calls, dataUrls.length - 1)];
      calls += 1;
      return url;
    },
  } as unknown as HTMLCanvasElement;
}

function smallUrl(): string {
  // 768 decoded bytes — comfortably within any test budget.
  return `data:image/jpeg;base64,${'A'.repeat(1024)}`;
}

function hugeUrl(): string {
  // ~150KB decoded — over the 100KB budget at every quality.
  return `data:image/jpeg;base64,${'A'.repeat(204800)}`;
}

test('keeps the canvas untouched when the first quality fits the budget', () => {
  const url = smallUrl();
  const canvas = fakeCanvas({ width: 1280, height: 720, dataUrls: [url] });
  const encoded = encodeCanvasWithinByteBudget(canvas, MAX_RECOGNITION_IMAGE_BYTES);
  assert.equal(encoded.imageBase64, url);
  assert.equal(encoded.width, 1280);
  assert.equal(encoded.height, 720);
});

test('walks the quality ladder before shrinking the image', () => {
  const fitting = smallUrl();
  const canvas = fakeCanvas({ width: 1280, height: 720, dataUrls: [hugeUrl(), hugeUrl(), fitting] });
  const encoded = encodeCanvasWithinByteBudget(canvas, MAX_RECOGNITION_IMAGE_BYTES);
  assert.equal(encoded.imageBase64, fitting);
  assert.equal(encoded.width, 1280);
  assert.equal(encoded.height, 720);
});

test('downscales and reports the shrunken dimensions when quality alone cannot fit', () => {
  const original = (globalThis as any).document;
  let created = 0;
  (globalThis as any).document = {
    createElement: () => {
      created += 1;
      // The downscaled canvas encodes small enough on its first try.
      return fakeCanvas({ width: 1020, height: 680, dataUrls: [smallUrl()] });
    },
  };
  try {
    const canvas = fakeCanvas({ width: 1200, height: 800, dataUrls: [hugeUrl()] });
    const encoded = encodeCanvasWithinByteBudget(canvas, MAX_RECOGNITION_IMAGE_BYTES);
    assert.ok(created >= 1, 'expected the encoder to downscale via a fresh canvas');
    assert.equal(encoded.width, 1020);
    assert.equal(encoded.height, 680);
    assert.equal(encoded.imageBase64, smallUrl());
  } finally {
    (globalThis as any).document = original;
  }
});

test('never fails outright when the budget cannot be met', () => {
  const original = (globalThis as any).document;
  (globalThis as any).document = {
    createElement: () => fakeCanvas({ width: 160, height: 90, dataUrls: [hugeUrl()] }),
  };
  try {
    const canvas = fakeCanvas({ width: 160, height: 90, dataUrls: [hugeUrl()] });
    const encoded = encodeCanvasWithinByteBudget(canvas, MAX_RECOGNITION_IMAGE_BYTES);
    // Best effort: still returns an encoded frame with truthful dimensions.
    assert.equal(typeof encoded.imageBase64, 'string');
    assert.ok(encoded.imageBase64.length > 0);
  } finally {
    (globalThis as any).document = original;
  }
});
