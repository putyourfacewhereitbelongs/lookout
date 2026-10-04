import { AudioVisualCue, AudioCueSource } from '../types';
import {
  CueEventAggregator,
  TemporalTracker,
  classifyFrame,
  extractFeatures,
  ClassificationResult,
} from './audioCueClassifier';

/**
 * Live acoustic analysis across every audio source the app can see: the
 * shared screen/tab, added network cameras that carry audio, the local
 * webcam, and the microphone.
 *
 * Each source gets its own analyser, temporal tracker, and event aggregator,
 * so a bark on the back-garden camera and an alarm on the shared tab are
 * reported as separate, individually labelled cues rather than being mixed
 * into one ambiguous signal.
 *
 * Audio is analysed in-page and never recorded, buffered to disk, or
 * transmitted; only the derived cue labels leave this module.
 */

export type CueListener = (cue: AudioVisualCue) => void;
export type LevelListener = (level: {
  sourceId: string;
  sourceLabel: string;
  dbfs: number;
  result: ClassificationResult;
}) => void;

const FFT_SIZE = 2048;

interface ActiveSource {
  id: string;
  label: string;
  stream: MediaStream;
  owned: boolean;
  node: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Float32Array;
  tracker: TemporalTracker;
  aggregator: CueEventAggregator;
  previousSpectrum?: Float64Array;
}

export class AudioCueService {
  private audioCtx: AudioContext | null = null;
  private sources = new Map<string, ActiveSource>();
  private timer: number | null = null;
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

  /** Ids and labels of every source currently being analysed. */
  get activeSources(): Array<{ id: string; label: string }> {
    return [...this.sources.values()].map(({ id, label }) => ({ id, label }));
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
   * Begin (or update) analysis over the supplied sources. Safe to call
   * repeatedly: sources that are already attached are kept running, new ones
   * are added, and removed ones are detached. When no source carries audio
   * and `microphoneFallback` is set, the microphone is opened instead.
   */
  async start(sources: AudioCueSource[] = [], microphoneFallback = true): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      this.lastError = 'Audio capture is not available in this browser.';
      return false;
    }

    try {
      const usable = sources.filter((source) => source.stream?.getAudioTracks?.().length);

      let resolved = usable;
      if (resolved.length === 0 && microphoneFallback) {
        const mic = await this.openMicrophone();
        if (mic) resolved = [mic];
      }

      if (resolved.length === 0) {
        this.lastError =
          'No audio is available. Re-share your tab or screen with "share audio" enabled, or allow microphone access.';
        this.stop();
        return false;
      }

      const ctx = this.ensureContext();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

      // Detach sources that are no longer present.
      const keep = new Set(resolved.map((source) => source.id));
      [...this.sources.keys()].forEach((id) => {
        if (!keep.has(id)) this.detachSource(id);
      });

      resolved.forEach((source) => this.attachSource(ctx, source));

      if (this.sources.size === 0) {
        this.lastError = 'No audio tracks could be attached for analysis.';
        this.stop();
        return false;
      }

      this.lastError = null;
      this.running = true;
      this.startTimer(ctx);
      return true;
    } catch (error) {
      this.lastError = this.describeError(error);
      this.stop();
      return false;
    }
  }

  /** Convenience wrapper used when only the microphone should be monitored. */
  async startMicrophoneOnly(): Promise<boolean> {
    return this.start([], true);
  }

  private describeError(error: unknown): string {
    const name = (error as DOMException)?.name;
    if (name === 'NotAllowedError') return 'Microphone permission was denied, so audio cues cannot run.';
    if (name === 'NotFoundError') return 'No audio input device was found.';
    return `Audio cue capture failed: ${(error as Error)?.message || 'unknown error'}`;
  }

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    return this.audioCtx;
  }

  private async openMicrophone(): Promise<AudioCueSource | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Keep the raw acoustic signature intact: the browser's cleanup
          // stages would strip exactly the transients we classify on.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      return { id: 'microphone', label: 'Microphone', stream, owned: true };
    } catch (error) {
      this.lastError = this.describeError(error);
      return null;
    }
  }

  private attachSource(ctx: AudioContext, source: AudioCueSource): void {
    const existing = this.sources.get(source.id);
    if (existing && existing.stream === source.stream) return; // already analysing
    if (existing) this.detachSource(source.id);

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0; // raw frames; we do our own smoothing
      const node = ctx.createMediaStreamSource(source.stream);
      node.connect(analyser);
      // Deliberately not connected to ctx.destination: analysing shared-tab
      // audio must never echo it back out of the speakers.

      const frameRateHz = Math.max(8, ctx.sampleRate / FFT_SIZE);
      this.sources.set(source.id, {
        id: source.id,
        label: source.label,
        stream: source.stream,
        owned: Boolean(source.owned),
        node,
        analyser,
        buffer: new Float32Array(analyser.fftSize),
        tracker: new TemporalTracker(frameRateHz),
        aggregator: new CueEventAggregator(),
      });
    } catch (error) {
      console.warn(`Audio cue source "${source.label}" could not be attached:`, error);
    }
  }

  private detachSource(id: string): void {
    const source = this.sources.get(id);
    if (!source) return;
    try {
      source.node.disconnect();
    } catch { /* already torn down */ }
    if (source.owned) source.stream.getTracks().forEach((track) => track.stop());
    this.sources.delete(id);
  }

  private startTimer(ctx: AudioContext): void {
    if (this.timer !== null) return;
    const intervalMs = Math.max(20, Math.round((FFT_SIZE / ctx.sampleRate) * 1000));
    this.timer = window.setInterval(() => this.analyseAllSources(), intervalMs);
  }

  private analyseAllSources(): void {
    const ctx = this.audioCtx;
    if (!ctx) return;
    this.sources.forEach((source) => this.analyseSource(ctx, source));
  }

  private analyseSource(ctx: AudioContext, source: ActiveSource): void {
    // A shared tab can be stopped from the browser's own UI; drop it quietly.
    if (source.stream.getAudioTracks().every((track) => track.readyState === 'ended')) {
      this.detachSource(source.id);
      return;
    }

    source.analyser.getFloatTimeDomainData(source.buffer);
    const { features, spectrum } = extractFeatures(source.buffer, ctx.sampleRate, source.previousSpectrum);
    source.previousSpectrum = spectrum;

    const temporal = source.tracker.push(features);
    const result = classifyFrame(features, temporal);

    this.levelListeners.forEach((listener) =>
      listener({ sourceId: source.id, sourceLabel: source.label, dbfs: features.dbfs, result }),
    );

    const cue = source.aggregator.accept(result, Date.now());
    if (cue) {
      const labelled: AudioVisualCue = { ...cue, sourceId: source.id, sourceLabel: source.label };
      this.cueListeners.forEach((listener) => listener(labelled));
    }
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    [...this.sources.keys()].forEach((id) => this.detachSource(id));
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.running = false;
  }
}

export const audioCueService = new AudioCueService();

/**
 * Pull an audio-bearing MediaStream out of a playing media element, which is
 * how RTSP/HLS/MJPEG camera feeds and demo clips expose their audio. Returns
 * null when the element carries no audio or the browser blocks capture.
 */
export function captureElementAudio(element: HTMLVideoElement | null): MediaStream | null {
  if (!element) return null;
  const capturable = element as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  try {
    const stream = capturable.captureStream?.() ?? capturable.mozCaptureStream?.();
    if (stream && stream.getAudioTracks().length > 0) return stream;
    return null;
  } catch {
    // Cross-origin media taints the element and blocks capture.
    return null;
  }
}
