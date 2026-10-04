import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fft,
  magnitudeSpectrum,
  extractFeatures,
  classifyFrame,
  TemporalTracker,
  CueEventAggregator,
  SILENCE_DBFS,
} from '../src/services/audioCueClassifier';

const SAMPLE_RATE = 48000;
const FRAME = 2048;
const FRAME_RATE = SAMPLE_RATE / FRAME; // ~23.4 analysis frames/sec

// --- signal generators -----------------------------------------------------

function sine(freq: number, amplitude = 0.3, length = FRAME, phase = 0): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase);
  return out;
}

/** Deterministic PRNG so the tests never flake. */
function makeRandom(seed = 12345) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function highpassNoise(amplitude: number, length = FRAME, seed = 7): Float32Array {
  const rnd = makeRandom(seed);
  const out = new Float32Array(length);
  let prev = 0;
  for (let i = 0; i < length; i++) {
    const white = rnd() * 2 - 1;
    // First-difference emphasises high frequencies (a crude +6 dB/oct tilt).
    out[i] = amplitude * (white - prev) * 0.5;
    prev = white;
  }
  return out;
}

function lowThud(amplitude: number, length = FRAME, decay = 6): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const env = Math.exp((-decay * i) / length);
    out[i] = amplitude * env * (Math.sin((2 * Math.PI * 80 * i) / SAMPLE_RATE) + 0.5 * Math.sin((2 * Math.PI * 140 * i) / SAMPLE_RATE));
  }
  return out;
}

/** Voiced speech: a glottal fundamental plus a decaying harmonic series. */
function voiced(fundamental: number, amplitude = 0.3, length = FRAME): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sample = 0;
    for (let h = 1; h <= 8; h++) {
      sample += (1 / h) * Math.sin((2 * Math.PI * fundamental * h * i) / SAMPLE_RATE);
    }
    out[i] = amplitude * sample * 0.4;
  }
  return out;
}

function scale(frame: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) out[i] = frame[i] * gain;
  return out;
}

function silence(length = FRAME): Float32Array {
  return new Float32Array(length);
}

/** Run a sequence of frames through the full pipeline and return the last result. */
function runSequence(frames: Float32Array[]) {
  const tracker = new TemporalTracker(FRAME_RATE);
  let previous: Float64Array | undefined;
  let last = null as ReturnType<typeof classifyFrame> | null;
  const all: ReturnType<typeof classifyFrame>[] = [];
  for (const frame of frames) {
    const { features, spectrum } = extractFeatures(frame, SAMPLE_RATE, previous);
    previous = spectrum;
    const temporal = tracker.push(features);
    last = classifyFrame(features, temporal);
    all.push(last);
  }
  return { last: last!, all };
}

// --- FFT correctness -------------------------------------------------------

test('FFT matches a known DFT result', () => {
  const re = Float64Array.from([1, 0, 0, 0]);
  const im = new Float64Array(4);
  fft(re, im);
  // An impulse transforms to a flat spectrum of ones.
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(re[i] - 1) < 1e-9, `bin ${i} real part`);
    assert.ok(Math.abs(im[i]) < 1e-9, `bin ${i} imaginary part`);
  }
});

test('FFT rejects non power-of-two input', () => {
  assert.throws(() => fft(new Float64Array(3), new Float64Array(3)), /power of two/);
});

test('spectrum peaks at the frequency of a pure tone', () => {
  const mags = magnitudeSpectrum(sine(1000, 0.5));
  const binHz = SAMPLE_RATE / 2 / mags.length;
  let maxBin = 0;
  for (let i = 1; i < mags.length; i++) if (mags[i] > mags[maxBin]) maxBin = i;
  const peakHz = maxBin * binHz;
  assert.ok(Math.abs(peakHz - 1000) < binHz * 2, `peak at ${peakHz.toFixed(0)} Hz, expected ~1000 Hz`);
});

// --- feature extraction ----------------------------------------------------

test('features separate a low tone from high-frequency noise', () => {
  const low = extractFeatures(sine(120, 0.4), SAMPLE_RATE).features;
  const high = extractFeatures(highpassNoise(0.4), SAMPLE_RATE).features;

  assert.ok(low.centroid < high.centroid, 'noise must have a higher spectral centroid');
  assert.ok(low.lowBand > high.lowBand, 'the 120 Hz tone must hold more low-band energy');
  assert.ok(high.brillianceBand > low.brillianceBand, 'noise must hold more energy above 6 kHz');
  assert.ok(high.flatness > low.flatness, 'noise must be spectrally flatter than a tone');
  assert.ok(high.zcr > low.zcr, 'noise must cross zero more often');
  assert.ok(low.tonalPeakRatio > high.tonalPeakRatio, 'a tone concentrates energy in one bin');
});

test('dBFS tracks amplitude and silence reads as the floor', () => {
  const loud = extractFeatures(sine(440, 0.5), SAMPLE_RATE).features;
  const quiet = extractFeatures(sine(440, 0.01), SAMPLE_RATE).features;
  assert.ok(loud.dbfs > quiet.dbfs + 20, 'a 34 dB amplitude drop must be reflected in dBFS');
  assert.ok(extractFeatures(silence(), SAMPLE_RATE).features.dbfs <= -119);
});

test('voiced speech shows a harmonic stack', () => {
  const { features } = extractFeatures(voiced(140, 0.4), SAMPLE_RATE);
  assert.ok(features.harmonicCount >= 3, `expected harmonics, got ${features.harmonicCount}`);
});

test('spectral flux rises when the spectrum changes', () => {
  const first = extractFeatures(sine(300, 0.3), SAMPLE_RATE);
  const steady = extractFeatures(sine(300, 0.3), SAMPLE_RATE, first.spectrum).features;
  const changed = extractFeatures(highpassNoise(0.5), SAMPLE_RATE, first.spectrum).features;
  assert.ok(changed.flux > steady.flux * 5, 'a spectral jump must produce far more flux');
});

// --- classification --------------------------------------------------------

test('silence is reported as ambient status with zero confidence', () => {
  const { features } = extractFeatures(silence(), SAMPLE_RATE);
  const temporal = new TemporalTracker(FRAME_RATE).push(features);
  const result = classifyFrame(features, temporal);
  assert.equal(result.type, 'status');
  assert.equal(result.confidence, 0);
  assert.ok(features.dbfs < SILENCE_DBFS);
});

test('a sustained steady tone classifies as an alarm', () => {
  const frames = Array.from({ length: 24 }, () => sine(2000, 0.35));
  const { last } = runSequence(frames);
  assert.equal(last.type, 'alarm');
  assert.ok(last.confidence > 0.4, `confidence ${last.confidence}`);
});

test('a bright noise burst classifies as breaking glass', () => {
  const frames = [
    ...Array.from({ length: 10 }, () => scale(highpassNoise(0.004, FRAME, 3), 1)),
    highpassNoise(0.6, FRAME, 11),
    highpassNoise(0.5, FRAME, 12),
  ];
  const { last } = runSequence(frames);
  assert.equal(last.type, 'glass');
});

test('a low-frequency transient classifies as an impact', () => {
  const frames = [
    ...Array.from({ length: 10 }, () => scale(lowThud(0.003), 1)),
    lowThud(0.7),
    lowThud(0.5),
  ];
  const { last } = runSequence(frames);
  assert.equal(last.type, 'impact');
});

test('a modulated harmonic signal classifies as speech', () => {
  // Syllabic amplitude modulation at ~5 Hz over a voiced harmonic stack.
  const frames = Array.from({ length: 40 }, (_, i) => {
    const env = 0.55 + 0.45 * Math.sin((2 * Math.PI * 5 * i) / FRAME_RATE);
    const fundamental = 150 + 25 * Math.sin((2 * Math.PI * 1.7 * i) / FRAME_RATE);
    return scale(voiced(fundamental, 0.32), env);
  });
  const { last } = runSequence(frames);
  assert.equal(last.type, 'speech');
});

test('an evenly spaced train of soft thuds classifies as footsteps', () => {
  // A step roughly every 12 frames ≈ 1.9 Hz cadence.
  const frames: Float32Array[] = [];
  for (let i = 0; i < 60; i++) {
    frames.push(i % 12 === 0 ? lowThud(0.12) : scale(lowThud(0.004), 1));
  }
  const { all } = runSequence(frames);
  const tail = all.slice(-24);
  assert.ok(tail.some((r) => r.type === 'footsteps'), 'a walking cadence must register as footsteps');
});

test('classes are distinguished from one another, not all collapsing to one label', () => {
  const alarm = runSequence(Array.from({ length: 24 }, () => sine(2000, 0.35))).last.type;
  const glass = runSequence([
    ...Array.from({ length: 10 }, () => highpassNoise(0.004, FRAME, 3)),
    highpassNoise(0.6, FRAME, 11),
    highpassNoise(0.5, FRAME, 12),
  ]).last.type;
  const impact = runSequence([
    ...Array.from({ length: 10 }, () => lowThud(0.003)),
    lowThud(0.7),
    lowThud(0.5),
  ]).last.type;
  assert.equal(new Set([alarm, glass, impact]).size, 3, `expected 3 distinct labels, got ${[alarm, glass, impact]}`);
});

// --- event aggregation -----------------------------------------------------

test('aggregator requires consecutive frames before emitting a cue', () => {
  const aggregator = new CueEventAggregator(2, 1000);
  const frame = (type: any, confidence: number) => ({
    type, label: 'x', confidence, dbLevel: -20, scores: {} as any,
  });

  assert.equal(aggregator.accept(frame('glass', 0.8), 1000), null, 'first frame must not emit');
  const cue = aggregator.accept(frame('glass', 0.85), 1040);
  assert.ok(cue, 'second consecutive frame must emit');
  assert.equal(cue!.type, 'glass');
  assert.equal(cue!.confidence, 0.85, 'cue carries the peak confidence');
});

test('aggregator suppresses repeats inside the retrigger window', () => {
  const aggregator = new CueEventAggregator(2, 1000);
  const frame = { type: 'bark' as const, label: 'x', confidence: 0.9, dbLevel: -20, scores: {} as any };
  aggregator.accept(frame, 0);
  assert.ok(aggregator.accept(frame, 50), 'first cue emits');
  assert.equal(aggregator.accept(frame, 400), null, 'repeat inside window suppressed');
  assert.equal(aggregator.accept(frame, 700), null, 'still suppressed');
  assert.ok(aggregator.accept(frame, 2000), 'emits again after the window');
});

test('aggregator ignores low-confidence and ambient frames', () => {
  const aggregator = new CueEventAggregator(2, 1000);
  const weak = { type: 'glass' as const, label: 'x', confidence: 0.1, dbLevel: -70, scores: {} as any };
  aggregator.accept(weak, 0);
  assert.equal(aggregator.accept(weak, 50), null, 'below-threshold frames never emit');

  const ambient = { type: 'status' as const, label: 'x', confidence: 0.99, dbLevel: -50, scores: {} as any };
  aggregator.accept(ambient, 100);
  assert.equal(aggregator.accept(ambient, 150), null, 'ambient status is never emitted as a cue');
});
