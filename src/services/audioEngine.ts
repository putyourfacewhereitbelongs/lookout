import { AlertToneType } from '../types';

/** Lightweight notification audio only. Camera audio capture, FFT analysis,
 * speech recognition, and transcription are intentionally not part of Lookout's
 * low-CPU recognition build. */
class AudioEngine {
  private audioCtx: AudioContext | null = null;

  init(): void {}

  private getContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume().catch(() => {});
    return this.audioCtx;
  }

  playAlertTone(type: AlertToneType, volume = 0.5): void {
    if (typeof window === 'undefined') return;
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const frequencies: Record<AlertToneType, [number, number]> = {
        tactical_chime: [880, 1320], intruder_siren: [600, 1100], radar_ping: [1760, 440],
        subtle_pulse: [440, 440], cyber_pulse: [523, 1046], hypersonic_chirp: [2400, 3600], perimeter_horn: [140, 110],
      };
      const [start, end] = frequencies[type] || frequencies.subtle_pulse;
      osc.type = type === 'intruder_siren' || type === 'perimeter_horn' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(start, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), now + 0.22);
      gain.gain.setValueAtTime(Math.max(0.001, Math.min(1, volume)) * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.3);
    } catch {}
  }

  speak(text: string, rate = 1, pitch = 1): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate; utterance.pitch = pitch;
    window.speechSynthesis.speak(utterance);
  }

  speakSceneDescription(text: string): void { this.speak(text); }
}

export const audioEngine = new AudioEngine();
