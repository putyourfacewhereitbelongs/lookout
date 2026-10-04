import test from 'node:test';
import assert from 'node:assert/strict';
import { DetectionObject, DetectionSensitivities, NightVisionSettings, RedSilhouetteSettings, VideoProcessingSettings, AccessibilitySettings } from '../src/types';

/**
 * These tests guard the wiring between the settings panel and the render
 * pipeline. The red silhouette, background erase, and accessibility overlays
 * were previously threaded into processFrame but never invoked, so toggling
 * them in Settings changed nothing on screen.
 */

type Call = { op: string; args: unknown[] };

function makeCtx(calls: Call[]): any {
  const record = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  const ctx: any = {
    // Style assignments are recorded like draw calls so tests can assert colors.
    set strokeStyle(value: unknown) { calls.push({ op: 'set:strokeStyle', args: [value] }); },
    set fillStyle(value: unknown) { calls.push({ op: 'set:fillStyle', args: [value] }); },
    canvas: { width: 1280, height: 720 },
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    setLineDash: record('setLineDash'),
    measureText: (text: string) => ({ width: text.length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return ctx;
}

function setupDom(calls: Call[]) {
  const ctx = makeCtx(calls);
  const canvas: any = { width: 1280, height: 720, getContext: () => ctx };
  (globalThis as any).document = { createElement: () => canvas };
  (globalThis as any).HTMLVideoElement = class {};
  (globalThis as any).HTMLCanvasElement = class {};
  (globalThis as any).performance = globalThis.performance ?? { now: () => 0 };
  return canvas;
}

const detection = (overrides: Partial<DetectionObject> = {}): DetectionObject => ({
  id: 'd1',
  label: 'Dana',
  category: 'person',
  confidence: 0.95,
  bbox: [0.3, 0.3, 0.2, 0.4],
  threatLevel: 'none',
  motionVector: [0, 0],
  distanceMeters: 3,
  speedMph: 0,
  subjectName: 'Dana',
  isKnown: true,
  ...overrides,
});

const nightVision: NightVisionSettings = {
  enabled: false, preset: 'starlight_color', gain: 1, chromaBoost: 1, irPhosphorBalance: 0.5,
  spectralDenoise: 0.5, luminescenceEnhancement: 1, tintHue: 120,
};
const redSilhouetteOff: RedSilhouetteSettings = {
  enabled: false, targetPeople: true, targetAnimals: true, opacity: 0.7, edgePrecision: 3,
  highSpeedTrackingSensitivity: 'balanced',
};
const videoProcessingOff: VideoProcessingSettings = {
  videoBackgroundErase: false, upscaling8K: false, imageProfile: 'standard',
  alertToneEnabled: false, alertToneType: 'tactical_chime',
};
const accessibilityOff: AccessibilitySettings = {
  visuallyImpairedObstacleOverlay: false, floorElevationSensor: false, hapticFeedback: false,
  voiceCommandsAndNarration: false, audioVisualCues: false,
};

async function render(
  calls: Call[],
  overrides: {
    redSilhouette?: Partial<RedSilhouetteSettings>;
    videoProcessing?: Partial<VideoProcessingSettings>;
    accessibility?: Partial<AccessibilitySettings>;
    detections?: DetectionObject[];
    detectionSensitivities?: DetectionSensitivities;
  } = {},
) {
  const canvas = setupDom(calls);
  const { VideoProcessor } = await import('../src/services/videoProcessor');
  const processor = new VideoProcessor();
  processor.init(canvas);
  const video: any = { readyState: 4 };
  Object.setPrototypeOf(video, (globalThis as any).HTMLVideoElement.prototype);
  processor.processFrame(
    video,
    canvas,
    overrides.detections ?? [detection()],
    nightVision,
    { ...redSilhouetteOff, ...overrides.redSilhouette },
    { ...videoProcessingOff, ...overrides.videoProcessing },
    { ...accessibilityOff, ...overrides.accessibility },
    overrides.detectionSensitivities,
  );
  return calls;
}

function sensitivitiesWith(peopleColor: string): DetectionSensitivities {
  const category = (highlightColor: string) => ({
    enabled: true, sensitivity: 70, confidenceThreshold: 0.6, highlightColor,
    triggerAlert: true, audibleChime: false, detectionZone: 'full_frame' as const,
  });
  return {
    fixedCameraGuard: false,
    people: category(peopleColor),
    threats: category('#dc2626'),
    animals: category('#10b981'),
    cars: category('#f59e0b'),
    objects: category('#06b6d4'),
    weather: category('#8b5cf6'),
  };
}

test('red silhouette toggle actually paints the subject', async () => {
  const off: Call[] = [];
  await render(off);
  const offEllipses = off.filter((c) => c.op === 'ellipse').length;

  const on: Call[] = [];
  await render(on, { redSilhouette: { enabled: true } });
  const onEllipses = on.filter((c) => c.op === 'ellipse').length;

  assert.ok(onEllipses > offEllipses, 'enabling the red silhouette must draw subject fills');
});

test('red silhouette respects the people and animal target switches', async () => {
  const peopleOnly: Call[] = [];
  await render(peopleOnly, {
    redSilhouette: { enabled: true, targetPeople: false, targetAnimals: true },
    detections: [detection()],
  });
  assert.equal(peopleOnly.filter((c) => c.op === 'ellipse').length, 0, 'a person must not be filled when targetPeople is off');

  const animals: Call[] = [];
  await render(animals, {
    redSilhouette: { enabled: true, targetPeople: false, targetAnimals: true },
    detections: [detection({ category: 'animal', label: 'dog' })],
  });
  assert.ok(animals.filter((c) => c.op === 'ellipse').length > 0, 'an animal must be filled when targetAnimals is on');
});

test('background erase dims the frame when enabled', async () => {
  const off: Call[] = [];
  await render(off);
  const on: Call[] = [];
  await render(on, { videoProcessing: { videoBackgroundErase: true } });
  assert.ok(on.filter((c) => c.op === 'fillRect').length > off.filter((c) => c.op === 'fillRect').length);
});

test('accessibility overlays draw obstacle labels and the elevation line', async () => {
  const calls: Call[] = [];
  await render(calls, { accessibility: { visuallyImpairedObstacleOverlay: true, floorElevationSensor: true } });
  const texts = calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
  assert.ok(texts.some((t) => t.includes('OBSTACLE: DANA')), 'obstacle overlay must label the subject');
  assert.ok(calls.some((c) => c.op === 'setLineDash'), 'floor elevation sensor must draw its dashed line');
});

test('image profile and upscaling settings reach the canvas', async () => {
  const base: Call[] = [];
  await render(base);
  const styled: Call[] = [];
  await render(styled, { videoProcessing: { imageProfile: 'tactical_noir', upscaling8K: true } });
  assert.ok(styled.length > base.length, 'profile and upscaling passes must add draw operations');
});

test('the recognition name plate is drawn large, outlined, and in white', async () => {
  const calls: Call[] = [];
  const ctxCalls = await render(calls);

  const strokeText = ctxCalls.find((c) => c.op === 'strokeText');
  const fillText = ctxCalls.find((c) => c.op === 'fillText' && String(c.args[0]).includes('Dana'));
  assert.ok(strokeText, 'label must have a dark outline pass for contrast');
  assert.ok(fillText, 'label must render the recognized name');
  assert.equal(String(fillText!.args[0]), 'Dana');
});

test('the HUD box color follows the category highlight color setting', async () => {
  const withSettings: Call[] = [];
  await render(withSettings, { detectionSensitivities: sensitivitiesWith('#3b82f6') });
  assert.ok(
    withSettings.some((c) => c.op === 'set:strokeStyle' && c.args[0] === '#3b82f6'),
    'the configured people highlight color must reach the HUD stroke style'
  );

  const fallback: Call[] = [];
  await render(fallback);
  assert.ok(
    !fallback.some((c) => c.op === 'set:strokeStyle' && c.args[0] === '#3b82f6'),
    'without settings the custom color must not appear'
  );
  assert.ok(
    fallback.some((c) => c.op === 'set:strokeStyle' && c.args[0] === '#ef4444'),
    'person boxes fall back to the built-in red'
  );
});
