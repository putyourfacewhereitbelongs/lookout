import { AudioVisualCue } from '../types';
import {
  CueEventAggregator,
  TemporalTracker,
  classifyFrame,
  extractFeatures,
  ClassificationResult,
} from './audioCueClassifier';

/**
 * Live microphone capture feeding the acoustic classifier.
 *
 * Audio is only ever requested while the "audio-visual cues" accessibility
 * setting is on, analysis happens entirely in-page, and no audio is recorded,
 * buffered to disk, or transmitted — only the derived cue labels leave this
 * module.
 */

export type CueListener = (cue: AudioVisualCue) => void;
export type LevelListener = (level: { dbfs: number; result: ClassificationResult }) => void;

const FFT_SIZE = 2048;

export class AudioCueService {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private buffer: Float32Array = new Float32Array(FFT_SIZE);
  private previousSpectrum: Float64Array | undefined;
  private tracker: TemporalTracker | null = null;
  private aggregator = new CueEventAggregator();
  private cueListeners = new Set<CueListener>();
  private levelListeners = new Set<LevelListener>();
  private running = false;
  private lastError: string | null = null;

  get isRunning(): boolean {
    return this.running;
  }

  get error(): string | null {
    return this.lastError;
  }

  onCue(listener: CueListener): () => void {
    this.cueListeners.add(listener);
    return () => this.cueListeners.delete(listener);
  }

  onLevel(listener: LevelListener): () => void {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  /**
   * Begin listening. Reuses an existing stream's audio track when the camera
   * already provides one, otherwise requests microphone access directly.
   */
  async start(existingStream?: MediaStream | null): Promise<boolean> {
    if (this.running) return true;
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      this.lastError = 'Audio capture is not available in this browser.';
      return false;
    }

    try {
      let stream = existingStream && existingStream.getAudioTracks().length > 0 ? existingStream : null;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            // Keep the raw acoustic signature intact: the browser's cleanup
            // stages would strip exactly the transients we classify on.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
        this.stream = stream;
      }

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioCtxClass();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0; // raw frames; we do our own smoothing
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      // Deliberately not connected to ctx.destination: no monitoring feedback.

      this.audioCtx = ctx;
      this.analyser = analyser;
      this.source = source;
      this.buffer = new Float32Array(analyser.fftSize);
      this.previousSpectrum = undefined;

      const frameRateHz = ctx.sampleRate / analyser.fftSize;
      this.tracker = new TemporalTracker(Math.max(8, frameRateHz));
      this.aggregator.reset();
      this.running = true;
      this.lastError = null;

      const intervalMs = Math.max(20, Math.round(1000 / Math.max(8, frameRateHz)));
      this.timer = window.setInterval(() => this.analyseFrame(), intervalMs);
      return true;
    } catch (error) {
      this.lastError =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Microphone permission was denied, so audio cues cannot run.'
          : `Audio cue capture failed: ${(error as Error)?.message || 'unknown error'}`;
      this.stop();
      return false;
    }
  }

  private analyseFrame(): void {
    const analyser = this.analyser;
    const ctx = this.audioCtx;
    const tracker = this.tracker;
    if (!analyser || !ctx || !tracker) return;

    analyser.getFloatTimeDomainData(this.buffer);
    const { features, spectrum } = extractFeatures(this.buffer, ctx.sampleRate, this.previousSpectrum);
    this.previousSpectrum = spectrum;

    const temporal = tracker.push(features);
    const result = classifyFrame(features, temporal);

    this.levelListeners.forEach((listener) => listener({ dbfs: features.dbfs, result }));

    const cue = this.aggregator.accept(result, Date.now());
    if (cue) this.cueListeners.forEach((listener) => listener(cue));
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    // Only release tracks this service opened itself.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.tracker?.reset();
    this.aggregator.reset();
    this.previousSpectrum = undefined;
    this.running = false;
  }
}

export const audioCueService = new AudioCueService();
