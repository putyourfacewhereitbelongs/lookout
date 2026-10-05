import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FaceRecognitionService,
  mapDetectionFromTile,
  mergeFaceDetections,
  shouldRunLongRangeTiles,
  topSubjectOf,
} from '../src/services/faceRecognitionService';
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

test('honors the sensitive setting for distant faces without going below the safety floor', () => {
  assert.equal(service.isReliableMatch(detection([{ subject: 'Alex', similarity: 0.89 }]), 0.75), true);
  assert.equal(service.isReliableMatch(detection([{ subject: 'Alex', similarity: 0.84 }]), 0.75), false);
});

test('rejects close competing identity scores', () => {
  assert.equal(service.isReliableMatch(detection([
    { subject: 'Alex', similarity: 0.96 },
    { subject: 'Alec', similarity: 0.91 },
  ]), 0.92), false);
});

test('maps an enlarged long-range tile back into source-frame coordinates', () => {
  const mapped = mapDetectionFromTile({
    box: { probability: 0.8, x_min: 200, y_min: 100, x_max: 600, y_max: 300 },
    landmarks: [[400, 200]],
  }, { x: 100, y: 50, width: 400, height: 200 }, 800, 400);

  assert.deepEqual(mapped.box, { probability: 0.8, x_min: 200, y_min: 100, x_max: 400, y_max: 200 });
  assert.deepEqual(mapped.landmarks, [[300, 150]]);
});

test('keeps the strongest face observation from overlapping long-range tiles', () => {
  const weaker = detection([{ subject: 'Alex', similarity: 0.90 }]);
  const stronger = {
    ...detection([{ subject: 'Alex', similarity: 0.95 }]),
    box: { probability: 0.8, x_min: 110, y_min: 90, x_max: 310, y_max: 290 },
  };
  const separate = {
    ...detection([{ subject: 'Bea', similarity: 0.93 }]),
    box: { probability: 0.9, x_min: 600, y_min: 120, x_max: 760, y_max: 300 },
  };

  const merged = mergeFaceDetections([weaker, stronger, separate]);
  assert.equal(merged.length, 2);
  assert.equal(merged.some((item) => item.subjects?.[0].similarity === 0.95), true);
  assert.equal(merged.some((item) => item.subjects?.[0].subject === 'Bea'), true);
});

test('requests long-range tiles only for absent or small faces', () => {
  assert.equal(shouldRunLongRangeTiles([], 1920, 1080), true);
  assert.equal(shouldRunLongRangeTiles([detection()], 1920, 1080), true);
  const largeFace = {
    ...detection(),
    box: { probability: 0.99, x_min: 300, y_min: 200, x_max: 800, y_max: 800 },
  };
  assert.equal(shouldRunLongRangeTiles([largeFace], 1920, 1080), false);
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
  const stale = { ...recent, id: 'stale-face', lastSeenTime: Date.now() - 7000 };
  const remaining = service.correlateDetections([recent, stale], [], 400, 400, 0.92);
  assert.deepEqual(remaining.map((item) => item.id), [recent.id]);

  const expired = { ...recent, lastSeenTime: Date.now() - 7000 };
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

// --- settings-driven identity gating ---------------------------------------

test('a borderline identity needs the alert margin above the naming threshold', () => {
  const borderline = detection([{ subject: 'Alex', similarity: 0.94 }]);
  // Naming at the default 92% slider succeeds...
  assert.equal(service.isReliableMatch(borderline, 0.92), true);
  // ...but the conservative gate asks for more before alerting.
  assert.equal(service.isConservativeMatch(borderline, 0.92), false);
});

test('the conservative gate follows the similarity slider down to its floor', () => {
  const weak = detection([{ subject: 'Alex', similarity: 0.9 }]);
  assert.equal(service.isConservativeMatch(weak, 0.85), true);
  assert.equal(service.isConservativeMatch(weak, 0.92), false);
  const strong = detection([{ subject: 'Alex', similarity: 0.98 }]);
  assert.equal(service.isConservativeMatch(strong, 0.92), true);
});

test('a 97% match is still announced at every slider position that used to announce it', () => {
  // Regression guard: a raised slider must not push the alert requirement
  // past 97%, or previously recognized people stop being announced.
  const match = detection([{ subject: 'Alex', similarity: 0.97 }]);
  for (const slider of [0.85, 0.92, 0.95, 0.96, 0.97]) {
    assert.equal(service.isConservativeMatch(match, slider), true, `slider ${slider} must still alert a 97% match`);
  }
  // Above 97% the slider itself is the requirement, as it always was.
  assert.equal(service.isConservativeMatch(match, 0.98), false);
  const excellent = detection([{ subject: 'Alex', similarity: 0.99 }]);
  assert.equal(service.isConservativeMatch(excellent, 0.98), true);
});

test('the conservative gate still rejects ambiguous runner-up scores and weak boxes', () => {
  const ambiguous = detection([
    { subject: 'Alex', similarity: 0.98 },
    { subject: 'Alec', similarity: 0.93 },
  ]);
  assert.equal(service.isConservativeMatch(ambiguous, 0.92), false);
  const weakBox = {
    ...detection([{ subject: 'Alex', similarity: 0.98 }]),
    box: { probability: 0.5, x_min: 100, y_min: 80, x_max: 300, y_max: 280 },
  };
  assert.equal(service.isConservativeMatch(weakBox, 0.92), false);
});

test('the top subject is ranked by similarity, not by list order', () => {
  const shuffled = detection([
    { subject: 'Alec', similarity: 0.91 },
    { subject: 'Alex', similarity: 0.97 },
  ]);
  assert.equal(topSubjectOf(shuffled)?.subject, 'Alex');
  assert.equal(topSubjectOf(detection()), null);
});

// --- gateway threshold forwarding and negative/noise profiles ------------------

test('forwards the detector floor and drops negative/noise profile matches', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({
      result: [
        detection([{ subject: 'Background_Noise', similarity: 0.94 }]),
        detection([{ subject: 'Alex', similarity: 0.95 }]),
      ],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const droppedBefore = service.negativeSubjectDropped;
    const result = await service.recognize('data:image/jpeg;base64,AAAA', 1280, 720, 0.82);

    // The detector threshold rides along so CompreFace filters at the gateway.
    assert.equal(capturedBody.detProbThreshold, 0.82);
    assert.equal(capturedBody.detectionProfile, 'standard');

    // Known noise never reaches the pipeline; real identities survive.
    assert.equal(result.length, 1);
    assert.equal(topSubjectOf(result[0])?.subject, 'Alex');
    assert.equal(service.negativeSubjectDropped - droppedBefore, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ordinary subject names are never mistaken for negative profiles', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    result: [detection([{ subject: 'Brian', similarity: 0.96 }])],
  }), { status: 200 })) as typeof fetch;

  try {
    const droppedBefore = service.negativeSubjectDropped;
    const result = await service.recognize('data:image/jpeg;base64,AAAA', 1280, 720);
    assert.equal(result.length, 1);
    assert.equal(service.negativeSubjectDropped - droppedBefore, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
