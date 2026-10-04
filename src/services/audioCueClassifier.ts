import { AudioVisualCue } from '../types';

/**
 * Real-time acoustic event classification.
 *
 * This is a genuine signal-processing pipeline, not a lookup table: each frame
 * of microphone PCM is windowed, transformed with a radix-2 FFT, reduced to a
 * standard set of psychoacoustic features (RMS/dBFS, spectral centroid,
 * rolloff, flatness, crest, zero-crossing rate, band energies, spectral flux),
 * and then scored against acoustic signatures for each cue type. Temporal
 * structure — onset sharpness, decay rate, syllabic modulation, and transient
 * periodicity — is tracked across frames, because several of these classes are
 * separable only in time (a footstep sequence and a single impact have nearly
 * identical spectra; their rhythm is what differs).
 *
 * Everything here is pure and DOM-free so it can be exercised against
 * synthesized waveforms under `node --test`.
 */

export type AudioCueType = AudioVisualCue['type'];

export interface SpectralFeatures {
  /** Root-mean-square amplitude of the frame, 0..1. */
  rms: number;
  /** RMS expressed in dBFS (negative; 0 dBFS is full scale). */
  dbfs: number;
  /** Energy-weighted mean frequency in Hz. */
  centroid: number;
  /** Frequency below which 85% of the spectral energy lies, in Hz. */
  rolloff85: number;
  /** Geometric/arithmetic mean ratio: ~1 is white noise, ~0 is a pure tone. */
  flatness: number;
  /** Peak-to-RMS ratio of the waveform; high for sharp transients. */
  crest: number;
  /** Zero crossings per sample, 0..1. Tracks high-frequency/noisy content. */
  zcr: number;
  /** Positive-only spectral change from the previous frame (onset strength). */
  flux: number;
  /** Fraction of total energy in 20-250 Hz. */
  lowBand: number;
  /** Fraction of total energy in 250-2000 Hz. */
  midBand: number;
  /** Fraction of total energy in 2-6 kHz. */
  highBand: number;
  /** Fraction of total energy above 6 kHz. */
  brillianceBand: number;
  /** Energy share held by the single strongest bin: tonality indicator. */
  tonalPeakRatio: number;
  /** Frequency of the strongest bin, in Hz. */
  dominantFrequency: number;
  /** Count of harmonically related peaks above the noise floor. */
  harmonicCount: number;
}

export interface ClassificationResult {
  type: AudioCueType;
  label: string;
  confidence: number;
  dbLevel: number;
  /** Per-class scores, useful for debugging and for the UI meter. */
  scores: Record<AudioCueType, number>;
}

// ---------------------------------------------------------------------------
// FFT
// ---------------------------------------------------------------------------

/** In-place iterative radix-2 Cooley-Tukey FFT. `re`/`im` length must be 2^k. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error('FFT length must be a power of two');

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Hann-windowed magnitude spectrum (single-sided) of a PCM frame. */
export function magnitudeSpectrum(samples: Float32Array | Float64Array): Float64Array {
  const n = 1 << Math.floor(Math.log2(samples.length));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Hann window suppresses spectral leakage from the frame boundaries.
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = samples[i] * w;
  }
  fft(re, im);
  const half = n >> 1;
  const mags = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    mags[i] = Math.hypot(re[i], im[i]) / half;
  }
  return mags;
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

function bandEnergy(mags: Float64Array, sampleRate: number, lowHz: number, highHz: number): number {
  const binHz = sampleRate / 2 / mags.length;
  const start = Math.max(0, Math.floor(lowHz / binHz));
  const end = Math.min(mags.length - 1, Math.ceil(highHz / binHz));
  let sum = 0;
  for (let i = start; i <= end; i++) sum += mags[i] * mags[i];
  return sum;
}

/** Count peaks at near-integer multiples of the fundamental (voiced speech). */
function countHarmonics(mags: Float64Array, sampleRate: number, fundamentalHz: number): number {
  if (fundamentalHz < 50 || fundamentalHz > 1000) return 0;
  const binHz = sampleRate / 2 / mags.length;
  let noiseFloor = 0;
  for (let i = 0; i < mags.length; i++) noiseFloor += mags[i];
  noiseFloor /= mags.length;
  let count = 0;
  for (let harmonic = 2; harmonic <= 8; harmonic++) {
    const bin = Math.round((fundamentalHz * harmonic) / binHz);
    if (bin >= mags.length - 1) break;
    const local = Math.max(mags[bin - 1], mags[bin], mags[bin + 1]);
    if (local > noiseFloor * 3) count++;
  }
  return count;
}

export function extractFeatures(
  samples: Float32Array | Float64Array,
  sampleRate: number,
  previousSpectrum?: Float64Array,
): { features: SpectralFeatures; spectrum: Float64Array } {
  const mags = magnitudeSpectrum(samples);
  const binHz = sampleRate / 2 / mags.length;

  let sumSquares = 0;
  let peak = 0;
  let crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSquares += s * s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
    if (i > 0 && ((s >= 0 && samples[i - 1] < 0) || (s < 0 && samples[i - 1] >= 0))) crossings++;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const dbfs = rms > 0 ? 20 * Math.log10(rms) : -120;
  const zcr = crossings / samples.length;
  const crest = rms > 1e-9 ? peak / rms : 0;

  let totalPower = 0;
  let weighted = 0;
  let logSum = 0;
  let maxMag = 0;
  let maxBin = 0;
  for (let i = 0; i < mags.length; i++) {
    const power = mags[i] * mags[i];
    totalPower += power;
    weighted += power * i * binHz;
    logSum += Math.log(power + 1e-20);
    if (mags[i] > maxMag) {
      maxMag = mags[i];
      maxBin = i;
    }
  }

  const centroid = totalPower > 1e-20 ? weighted / totalPower : 0;
  const arithmeticMean = totalPower / mags.length;
  const geometricMean = Math.exp(logSum / mags.length);
  const flatness = arithmeticMean > 1e-20 ? Math.min(1, geometricMean / arithmeticMean) : 0;

  let cumulative = 0;
  let rolloff85 = 0;
  for (let i = 0; i < mags.length; i++) {
    cumulative += mags[i] * mags[i];
    if (cumulative >= totalPower * 0.85) {
      rolloff85 = i * binHz;
      break;
    }
  }

  let flux = 0;
  if (previousSpectrum && previousSpectrum.length === mags.length) {
    for (let i = 0; i < mags.length; i++) {
      const diff = mags[i] - previousSpectrum[i];
      if (diff > 0) flux += diff * diff;
    }
    flux = Math.sqrt(flux);
  }

  const safeTotal = totalPower > 1e-20 ? totalPower : 1;
  const dominantFrequency = maxBin * binHz;

  const features: SpectralFeatures = {
    rms,
    dbfs,
    centroid,
    rolloff85,
    flatness,
    crest,
    zcr,
    flux,
    lowBand: bandEnergy(mags, sampleRate, 20, 250) / safeTotal,
    midBand: bandEnergy(mags, sampleRate, 250, 2000) / safeTotal,
    highBand: bandEnergy(mags, sampleRate, 2000, 6000) / safeTotal,
    brillianceBand: bandEnergy(mags, sampleRate, 6000, sampleRate / 2) / safeTotal,
    tonalPeakRatio: (maxMag * maxMag) / safeTotal,
    dominantFrequency,
    harmonicCount: countHarmonics(mags, sampleRate, dominantFrequency),
  };

  return { features, spectrum: mags };
}

// ---------------------------------------------------------------------------
// Temporal context
// ---------------------------------------------------------------------------

export interface TemporalContext {
  /** Sharp energy rise versus the recent running average. */
  onsetStrength: number;
  /** How fast energy is falling off, 0..1. Glass and impacts decay fast. */
  decayRate: number;
  /** Strength of 3-8 Hz amplitude modulation — the syllabic rate of speech. */
  syllabicModulation: number;
  /** Strength of 0.5-3 Hz transient periodicity — a walking cadence. */
  stepPeriodicity: number;
  /** Frames since the last detected onset. */
  framesSinceOnset: number;
  /** How stable the dominant frequency has been — alarms hold a steady pitch. */
  pitchStability: number;
}

const HISTORY_FRAMES = 64;

export class TemporalTracker {
  private energyHistory: number[] = [];
  private pitchHistory: number[] = [];
  private onsetHistory: number[] = [];
  private framesSinceOnset = HISTORY_FRAMES;

  constructor(private readonly frameRateHz: number) {}

  reset(): void {
    this.energyHistory = [];
    this.pitchHistory = [];
    this.onsetHistory = [];
    this.framesSinceOnset = HISTORY_FRAMES;
  }

  push(features: SpectralFeatures): TemporalContext {
    this.energyHistory.push(features.rms);
    this.pitchHistory.push(features.dominantFrequency);
    if (this.energyHistory.length > HISTORY_FRAMES) this.energyHistory.shift();
    if (this.pitchHistory.length > HISTORY_FRAMES) this.pitchHistory.shift();

    const history = this.energyHistory;
    const baselineWindow = history.slice(0, -1).slice(-16);
    const baseline = baselineWindow.length
      ? baselineWindow.reduce((a, b) => a + b, 0) / baselineWindow.length
      : features.rms;

    const onsetStrength = baseline > 1e-6 ? Math.max(0, (features.rms - baseline) / baseline) : 0;
    const isOnset = onsetStrength > 1.5 && features.rms > 0.01;
    this.onsetHistory.push(isOnset ? 1 : 0);
    if (this.onsetHistory.length > HISTORY_FRAMES) this.onsetHistory.shift();
    this.framesSinceOnset = isOnset ? 0 : Math.min(HISTORY_FRAMES, this.framesSinceOnset + 1);

    // Decay: compare current energy against the local peak of the recent past.
    const recentPeak = Math.max(features.rms, ...history.slice(-12));
    const decayRate = recentPeak > 1e-6 ? Math.max(0, 1 - features.rms / recentPeak) : 0;

    return {
      onsetStrength,
      decayRate,
      syllabicModulation: this.modulationStrength(3, 8),
      stepPeriodicity: this.transientPeriodicity(),
      framesSinceOnset: this.framesSinceOnset,
      pitchStability: this.pitchStability(),
    };
  }

  /**
   * Energy-envelope modulation strength inside a frequency band, measured with
   * a Goertzel-style projection of the envelope onto the band's centre rate.
   */
  private modulationStrength(lowHz: number, highHz: number): number {
    const env = this.energyHistory;
    if (env.length < 16) return 0;
    const mean = env.reduce((a, b) => a + b, 0) / env.length;
    if (mean < 1e-6) return 0;
    const centred = env.map((v) => v - mean);
    const energy = centred.reduce((a, b) => a + b * b, 0);
    if (energy < 1e-12) return 0;

    let best = 0;
    for (let rate = lowHz; rate <= highHz; rate += 0.5) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < centred.length; i++) {
        const phase = (2 * Math.PI * rate * i) / this.frameRateHz;
        re += centred[i] * Math.cos(phase);
        im += centred[i] * Math.sin(phase);
      }
      const power = (re * re + im * im) / (centred.length * energy);
      if (power > best) best = power;
    }
    return Math.min(1, best * 4);
  }

  /** Detects an evenly spaced train of onsets, i.e. a walking cadence. */
  private transientPeriodicity(): number {
    const onsetFrames: number[] = [];
    this.onsetHistory.forEach((v, i) => { if (v) onsetFrames.push(i); });
    if (onsetFrames.length < 3) return 0;

    const gaps: number[] = [];
    for (let i = 1; i < onsetFrames.length; i++) gaps.push(onsetFrames[i] - onsetFrames[i - 1]);
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (meanGap <= 0) return 0;

    const cadenceHz = this.frameRateHz / meanGap;
    if (cadenceHz < 0.5 || cadenceHz > 3.5) return 0;

    const variance = gaps.reduce((a, g) => a + (g - meanGap) ** 2, 0) / gaps.length;
    const regularity = 1 / (1 + variance / Math.max(1, meanGap));
    return Math.min(1, regularity);
  }

  /** 1 when the dominant frequency barely moves, 0 when it jumps around. */
  private pitchStability(): number {
    const recent = this.pitchHistory.slice(-12).filter((p) => p > 40);
    if (recent.length < 6) return 0;
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean < 40) return 0;
    const deviation = Math.sqrt(recent.reduce((a, p) => a + (p - mean) ** 2, 0) / recent.length);
    return Math.max(0, 1 - deviation / (mean * 0.15));
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const CUE_LABELS: Record<AudioCueType, string> = {
  speech: 'Voices / speech detected',
  bark: 'Dog barking',
  glass: 'Glass breaking or shattering',
  impact: 'Heavy impact or bang',
  alarm: 'Alarm or siren tone',
  footsteps: 'Footsteps approaching',
  status: 'Ambient background',
};

/** Noise floor under which we report ambient status rather than guessing. */
export const SILENCE_DBFS = -55;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Triangular membership: 1 inside [lo,hi], tapering to 0 across the margins. */
function band(value: number, lo: number, hi: number, margin: number): number {
  if (value >= lo && value <= hi) return 1;
  if (value < lo) return clamp01(1 - (lo - value) / margin);
  return clamp01(1 - (value - hi) / margin);
}

export function classifyFrame(features: SpectralFeatures, temporal: TemporalContext): ClassificationResult {
  const f = features;
  const t = temporal;

  const scores: Record<AudioCueType, number> = {
    speech: 0, bark: 0, glass: 0, impact: 0, alarm: 0, footsteps: 0, status: 0,
  };

  // Below the noise floor nothing is classifiable.
  if (f.dbfs < SILENCE_DBFS) {
    return { type: 'status', label: CUE_LABELS.status, confidence: 0, dbLevel: f.dbfs, scores };
  }

  // --- Speech: voiced harmonics, mid-band energy, 3-8 Hz syllabic envelope ---
  scores.speech =
    0.30 * band(f.centroid, 300, 2200, 1200) +
    0.22 * clamp01(f.midBand * 1.6) +
    0.20 * t.syllabicModulation +
    0.18 * clamp01(f.harmonicCount / 4) +
    0.10 * band(f.dominantFrequency, 80, 350, 220) -
    0.25 * clamp01(f.flatness * 2) -
    0.15 * clamp01(f.brillianceBand * 2);

  // --- Glass: dense very-high-frequency noise, sharp attack, fast decay ---
  scores.glass =
    0.32 * clamp01((f.brillianceBand - 0.12) * 3.2) +
    0.20 * clamp01((f.zcr - 0.15) * 4) +
    0.18 * clamp01(f.flatness * 1.8) +
    0.16 * clamp01(t.onsetStrength / 3) +
    0.14 * band(f.rolloff85, 5000, 24000, 2500) -
    0.30 * clamp01(f.lowBand * 2.5) -
    0.15 * clamp01(f.tonalPeakRatio * 4);

  // --- Impact: low-frequency dominant transient, sharp onset, fast decay ---
  scores.impact =
    0.34 * clamp01((f.lowBand - 0.25) * 2.6) +
    0.24 * clamp01(t.onsetStrength / 2.5) +
    0.16 * clamp01(f.crest / 6) +
    0.14 * clamp01(t.decayRate * 1.5) +
    0.12 * band(f.centroid, 0, 700, 500) -
    0.25 * t.syllabicModulation -
    0.20 * clamp01(f.brillianceBand * 3) -
    // A single bang is an impact; the same thud repeating on a regular
    // cadence is someone walking, so established periodicity hands the
    // frame to the footsteps class.
    0.35 * t.stepPeriodicity;

  // --- Alarm: sustained, highly tonal, stable pitch in the 500 Hz-4 kHz range ---
  // Frequency and sustain are treated as gates rather than as additive terms:
  // a tonal 80 Hz thump is an impact, not a siren, however stable its pitch,
  // and a genuine alarm rings on rather than decaying inside one frame.
  const alarmFrequencyGate = band(f.dominantFrequency, 500, 4500, 350);
  const alarmSustainGate = clamp01(1 - t.onsetStrength / 5);
  scores.alarm =
    alarmFrequencyGate *
    alarmSustainGate *
    (0.40 * clamp01((f.tonalPeakRatio - 0.05) * 6) +
      0.28 * t.pitchStability +
      0.22 * clamp01(1 - f.flatness * 6) +
      0.10 * clamp01(1 - t.decayRate));


  // --- Bark: short broadband mid burst, strong onset, few stable harmonics ---
  scores.bark =
    0.28 * band(f.centroid, 700, 3000, 1200) +
    0.22 * clamp01(t.onsetStrength / 2) +
    0.18 * clamp01(f.midBand * 1.5) +
    0.16 * clamp01(t.decayRate * 1.4) +
    0.10 * band(f.crest, 3, 12, 4) +
    0.06 * clamp01(f.flatness * 2) -
    0.28 * t.pitchStability -
    0.22 * t.syllabicModulation;

  // --- Footsteps: quiet, repeated low-mid thuds at a 0.5-3 Hz cadence ---
  scores.footsteps =
    0.40 * t.stepPeriodicity +
    0.20 * clamp01((f.lowBand - 0.2) * 2.4) +
    0.16 * band(f.centroid, 100, 1200, 700) +
    0.14 * band(f.dbfs, -45, -18, 14) +
    0.10 * clamp01(t.decayRate * 1.3) -
    0.25 * clamp01(f.brillianceBand * 3) -
    0.20 * t.pitchStability;

  // --- Status: steady low-level ambience with no transient structure ---
  scores.status =
    0.40 * clamp01(1 - t.onsetStrength) +
    0.30 * band(f.dbfs, -55, -38, 10) +
    0.30 * clamp01(1 - Math.max(t.syllabicModulation, t.stepPeriodicity));

  let bestType: AudioCueType = 'status';
  let bestScore = -Infinity;
  (Object.keys(scores) as AudioCueType[]).forEach((key) => {
    scores[key] = clamp01(scores[key]);
    if (scores[key] > bestScore) {
      bestScore = scores[key];
      bestType = key;
    }
  });

  // Confidence reflects both absolute score and the margin over the runner-up,
  // so an ambiguous frame does not get reported as a firm detection.
  const sorted = (Object.values(scores) as number[]).sort((a, b) => b - a);
  const margin = sorted[0] - (sorted[1] ?? 0);
  const confidence = clamp01(bestScore * 0.65 + margin * 1.4);

  return { type: bestType, label: CUE_LABELS[bestType], confidence, dbLevel: f.dbfs, scores };
}

/** Minimum confidence before a frame is promoted to a reported cue. */
export const CUE_REPORT_THRESHOLD = 0.42;

/**
 * Smooths frame-level decisions into stable events: a class must win several
 * consecutive frames before it is emitted, and the same class will not be
 * re-emitted until it has gone quiet, so one bark is one cue and not thirty.
 */
export class CueEventAggregator {
  private candidate: AudioCueType | null = null;
  private candidateFrames = 0;
  private lastEmitted: AudioCueType | null = null;
  private lastEmittedAt = 0;
  private peakConfidence = 0;
  private peakDb = -120;

  constructor(
    private readonly framesToConfirm = 2,
    private readonly retriggerMs = 1200,
  ) {}

  reset(): void {
    this.candidate = null;
    this.candidateFrames = 0;
    this.lastEmitted = null;
    this.peakConfidence = 0;
  }

  accept(result: ClassificationResult, now: number): AudioVisualCue | null {
    if (result.type === 'status' || result.confidence < CUE_REPORT_THRESHOLD) {
      this.candidate = null;
      this.candidateFrames = 0;
      this.peakConfidence = 0;
      if (now - this.lastEmittedAt > this.retriggerMs) this.lastEmitted = null;
      return null;
    }

    if (result.type === this.candidate) {
      this.candidateFrames++;
      this.peakConfidence = Math.max(this.peakConfidence, result.confidence);
      this.peakDb = Math.max(this.peakDb, result.dbLevel);
    } else {
      this.candidate = result.type;
      this.candidateFrames = 1;
      this.peakConfidence = result.confidence;
      this.peakDb = result.dbLevel;
    }

    if (this.candidateFrames < this.framesToConfirm) return null;
    if (this.lastEmitted === result.type && now - this.lastEmittedAt < this.retriggerMs) return null;

    this.lastEmitted = result.type;
    this.lastEmittedAt = now;
    const cue: AudioVisualCue = {
      id: `cue-${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      type: result.type,
      label: result.label,
      confidence: Number(this.peakConfidence.toFixed(3)),
      dbLevel: Number(this.peakDb.toFixed(1)),
    };
    this.peakConfidence = 0;
    this.peakDb = -120;
    return cue;
  }
}

export const CUE_SEVERITY: Record<AudioCueType, 'info' | 'warning' | 'critical'> = {
  glass: 'critical',
  alarm: 'critical',
  impact: 'warning',
  bark: 'warning',
  footsteps: 'warning',
  speech: 'info',
  status: 'info',
};

export { CUE_LABELS };
