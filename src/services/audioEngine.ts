import { AudioVisualCue, AlertToneType } from '../types';

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private silentMonitor: GainNode | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private analysisFrame: number | null = null;
  private isListening = false;
  private initialized = false;
  private cueCounter = 0;
  private recognition: any = null;
  private transcriptionRecorder: MediaRecorder | null = null;
  private transcriptionTimer: ReturnType<typeof setTimeout> | null = null;
  private transcriptionInFlight = false;
  private pendingTranscriptions: Blob[] = [];
  private speechLikelyInSegment = false;
  private speechActivityFrames = 0;
  private transcriptionStream: MediaStream | null = null;
  private localTranscriber: Promise<any> | null = null;
  private recentCues: AudioVisualCue[] = [];
  private latestFrequencyData: Uint8Array = new Uint8Array(64);

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.getContext();
      // Sound captions start only after the active camera stream is attached.
    } catch {}
  }

  getFrequencyData(): Uint8Array {
    return this.latestFrequencyData;
  }

  getRecentCues(): AudioVisualCue[] {
    return this.recentCues;
  }

  clearCues(): void {
    this.recentCues = [];
  }

  speakSceneDescription(text: string): void {
    this.speak(text);
  }

  startVoiceRecognition(onCommand: (cmd: string) => void): boolean {
    return this.startVoiceCommands(onCommand);
  }

  stopVoiceRecognition(): void {
    this.stopVoiceCommands();
  }

  // Initialize Web Audio Context
  private getContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  // Play synthetic alert tones with custom volume
  playAlertTone(type: AlertToneType, volume: number = 0.5): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const vol = Math.max(0.01, Math.min(1.0, volume));

      if (type === 'tactical_chime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
        gain.gain.setValueAtTime(0.25 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'intruder_siren') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1100, now + 0.2);
        osc.frequency.linearRampToValueAtTime(600, now + 0.4);
        gain.gain.setValueAtTime(0.3 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'radar_ping') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
        gain.gain.setValueAtTime(0.3 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'subtle_pulse') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.2 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'cyber_pulse') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.5, now + 0.24); // C6
        gain.gain.setValueAtTime(0.2 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
      } else if (type === 'hypersonic_chirp') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(3600, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.24);
        gain.gain.setValueAtTime(0.22 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'perimeter_horn') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.3);
        gain.gain.setValueAtTime(0.35 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (err) {
      console.warn('Audio tone play warning:', err);
    }
  }

  // Analyze only audio tracks supplied by the active camera stream.
  startStreamAnalysis(
    stream: MediaStream | null
  ): boolean {
    this.stopStreamAnalysis();
    if (!stream?.getAudioTracks().some((track) => track.readyState === 'live')) {
      this.latestFrequencyData = new Uint8Array(64);
      this.pushTranscriptionStatus('No audio track is available from this stream. Enable microphone or shared-tab audio.');
      return false;
    }
    try {
      const onCueDetected = (cue: AudioVisualCue) => {
        this.recentCues.unshift(cue);
        if (this.recentCues.length > 30) this.recentCues = this.recentCues.slice(0, 30);
      };
      const onSpectrumUpdate = (frequencyData: Uint8Array) => { this.latestFrequencyData = frequencyData; };
      const ctx = this.getContext();
      this.streamSource = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.streamSource.connect(this.analyser);
      // Keep the Web Audio graph pulled without playing the captured audio aloud.
      this.silentMonitor = ctx.createGain();
      this.silentMonitor.gain.value = 0;
      this.analyser.connect(this.silentMonitor);
      this.silentMonitor.connect(ctx.destination);

      this.isListening = true;
      this.startStreamTranscription(stream);
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const waveformArray = new Uint8Array(bufferLength * 2);

      let lastDetectionTime = 0;
      const analyser = this.analyser;

      const processAudio = () => {
        if (!this.isListening || this.analyser !== analyser) return;
        analyser.getByteFrequencyData(dataArray);
        onSpectrumUpdate(dataArray);

        // Analyze frequency profile:
        let sum = 0;
        let highFreqSum = 0;
        let midFreqSum = 0;
        let lowFreqSum = 0;

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          sum += val;
          if (i > bufferLength * 0.6) highFreqSum += val;
          else if (i > bufferLength * 0.2) midFreqSum += val;
          else lowFreqSum += val;
        }

        const avgVolume = sum / bufferLength;
        const now = Date.now();

        // Use time-domain RMS to gate transcription on sustained audible speech.
        analyser.getByteTimeDomainData(waveformArray);
        let squareSum = 0;
        for (const sample of waveformArray) {
          const normalized = (sample - 128) / 128;
          squareSum += normalized * normalized;
        }
        const rms = Math.sqrt(squareSum / waveformArray.length);
        if (rms > 0.01 && rms < 0.95) {
          this.speechActivityFrames++;
        } else {
          this.speechActivityFrames = Math.max(0, this.speechActivityFrames - 1);
        }
        if (this.speechActivityFrames >= 12) {
          this.speechLikelyInSegment = true;
        }

        // Detect distinct sound types if volume threshold reached and cooled down
        if (avgVolume > 40 && now - lastDetectionTime > 2500) {
          lastDetectionTime = now;
          let detectedType: AudioVisualCue['type'] | null = null;
          let label = '';

          if (highFreqSum > midFreqSum * 1.6 && highFreqSum > 3000) {
            detectedType = 'glass';
            label = 'Glass Break / High Transient Alert';
          } else if (lowFreqSum > midFreqSum * 2.0 && lowFreqSum > 4000) {
            detectedType = 'impact';
            label = 'Heavy Impact / Floor Thud';
          } else if (midFreqSum > highFreqSum && midFreqSum > 3500) {
            // Check dog bark harmonic pattern
            detectedType = 'bark';
            label = 'Canine Barking Detected';
          } else if (highFreqSum > 2500 && lowFreqSum < 1500) {
            detectedType = 'alarm';
            label = 'Siren / Smoke Detector Tone';
          } else if (avgVolume > 30 && avgVolume < 60 && lowFreqSum > midFreqSum) {
            detectedType = 'footsteps';
            label = 'Footsteps Approaching';
          }

          if (detectedType) {
            onCueDetected({
              id: `cue-${now}-${++this.cueCounter}-${Math.random().toString(36).substring(2, 8)}`,
              timestamp: now,
              type: detectedType,
              label,
              confidence: Math.min(0.98, 0.7 + avgVolume / 200),
              dbLevel: Math.round(avgVolume * 0.9 + 20),
            });
          }
        }

        this.analysisFrame = requestAnimationFrame(processAudio);
      };

      this.analysisFrame = requestAnimationFrame(processAudio);
      return true;
    } catch (e) {
      console.warn('Camera stream audio analysis unavailable:', e);
      return false;
    }
  }

  stopStreamAnalysis(): void {
    this.isListening = false;
    if (this.transcriptionTimer) clearTimeout(this.transcriptionTimer);
    this.transcriptionTimer = null;
    const recorder = this.transcriptionRecorder;
    this.transcriptionRecorder = null;
    this.transcriptionStream = null;
    this.pendingTranscriptions = [];
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    if (this.analysisFrame !== null) cancelAnimationFrame(this.analysisFrame);
    this.analysisFrame = null;
    try { this.streamSource?.disconnect(); } catch {}
    this.streamSource = null;
    try { this.analyser?.disconnect(); } catch {}
    try { this.silentMonitor?.disconnect(); } catch {}
    this.silentMonitor = null;
    this.analyser = null;
    this.latestFrequencyData = new Uint8Array(64);
  }

  private startStreamTranscription(stream: MediaStream): void {
    if (typeof MediaRecorder === 'undefined') {
      this.pushTranscriptionStatus('Audio recording is not supported by this browser.');
      return;
    }
    const audioStream = new MediaStream(stream.getAudioTracks());
    if (audioStream.getAudioTracks().length === 0) return;
    this.transcriptionStream = audioStream;

    const recordSegment = () => {
      if (!this.isListening || !this.transcriptionStream) return;
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        const recorder = new MediaRecorder(this.transcriptionStream, mimeType ? { mimeType } : undefined);
        const chunks: BlobPart[] = [];
        this.speechLikelyInSegment = false;
        this.speechActivityFrames = 0;
        this.transcriptionRecorder = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const hasAnalyzedSpeech = this.speechLikelyInSegment;
          if (this.isListening) recordSegment();
          const audioContextSuspended = this.audioCtx?.state !== 'running';
          const shouldTranscribe = audioBlob.size > 1500 && (
            hasAnalyzedSpeech || (audioContextSuspended && await this.hasAudibleSpeech(audioBlob))
          );
          if (shouldTranscribe) {
            if (this.transcriptionInFlight) this.pendingTranscriptions.push(audioBlob);
            else void this.transcribeStreamAudio(audioBlob);
          }
        };
        recorder.start();
        this.transcriptionTimer = setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, 10000);
      } catch (error) {
        console.warn('Stream audio transcription unavailable:', error);
      }
    };

    recordSegment();
  }

  private async hasAudibleSpeech(audioBlob: Blob): Promise<boolean> {
    try {
      const OfflineContext = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!OfflineContext) return false;
      const context = new OfflineContext(1, 1, 16000);
      const decoded = await context.decodeAudioData(await audioBlob.arrayBuffer());
      const samples = decoded.getChannelData(0);
      const frameSize = Math.max(1, Math.floor(decoded.sampleRate * 0.02));
      let activeFrames = 0;
      let peakRms = 0;
      for (let start = 0; start < samples.length; start += frameSize) {
        const end = Math.min(samples.length, start + frameSize);
        let squareSum = 0;
        for (let i = start; i < end; i++) squareSum += samples[i] * samples[i];
        const rms = Math.sqrt(squareSum / Math.max(1, end - start));
        if (rms > 0.012 && rms < 0.95) {
          activeFrames++;
          peakRms = Math.max(peakRms, rms);
        }
      }
      return activeFrames >= 12 && peakRms > 0.025;
    } catch {
      // If the browser cannot decode a silent-context segment, skip it rather than
      // asking Whisper to guess from audio that was never confirmed as audible.
      return false;
    }
  }

  private async transcribeStreamAudio(audioBlob: Blob): Promise<void> {
    this.transcriptionInFlight = true;
    try {
      if (!this.localTranscriber) {
        this.pushTranscriptionStatus('Loading the on-device speech model. The first download may take a moment.');
        this.localTranscriber = import('@huggingface/transformers')
          .then(({ pipeline }) => pipeline(
            'automatic-speech-recognition',
            'onnx-community/whisper-tiny.en',
            { device: 'wasm', dtype: 'q8' }
          ))
          .catch((error) => {
            this.localTranscriber = null;
            throw error;
          });
      }
      const transcriber = await this.localTranscriber;
      const audioContext = new AudioContext();
      try {
        const decoded = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
        const sourceLength = decoded.length;
        const targetLength = Math.ceil(sourceLength * 16000 / decoded.sampleRate);
        const samples = new Float32Array(targetLength);
        for (let i = 0; i < targetLength; i++) {
          const sourcePosition = i * decoded.sampleRate / 16000;
          const left = Math.floor(sourcePosition);
          const right = Math.min(left + 1, sourceLength - 1);
          const fraction = sourcePosition - left;
          let mono = 0;
          for (const channel of channels) {
            mono += channel[left] * (1 - fraction) + channel[right] * fraction;
          }
          samples[i] = mono / channels.length;
        }
        const result = await transcriber(samples, { language: 'english', task: 'transcribe' });
        if (!this.isListening) return;
        const transcript = typeof result?.text === 'string' ? result.text.trim() : '';
        if (transcript) {
          this.recentCues.unshift({
            id: `transcript-${Date.now()}-${++this.cueCounter}`,
            timestamp: Date.now(),
            type: 'speech',
            label: transcript,
            confidence: 0.9,
            dbLevel: 0,
          });
          if (this.recentCues.length > 30) this.recentCues = this.recentCues.slice(0, 30);
        }
      } finally {
        await audioContext.close();
      }
    } catch (error) {
      console.warn('Stream audio transcription error:', error);
      this.pushTranscriptionStatus('On-device transcription failed. Check browser support and reload the app.');
    } finally {
      this.transcriptionInFlight = false;
      const pending = this.pendingTranscriptions.shift();
      if (pending && this.isListening) void this.transcribeStreamAudio(pending);
    }
  }

  private pushTranscriptionStatus(message: string): void {
    this.recentCues.unshift({
      id: `transcription-status-${Date.now()}-${++this.cueCounter}`,
      timestamp: Date.now(),
      type: 'status',
      label: message,
      confidence: 1,
      dbLevel: 0,
    });
    if (this.recentCues.length > 30) this.recentCues = this.recentCues.slice(0, 30);
  }

  // Trigger haptic vibration patterns for assistive navigation & alerts
  triggerHaptic(pattern: 'obstacle' | 'threat' | 'curb'): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        switch (pattern) {
          case 'obstacle':
            navigator.vibrate([60, 40, 60]);
            break;
          case 'threat':
            navigator.vibrate([250, 100, 250, 100, 500]);
            break;
          case 'curb':
            navigator.vibrate([100, 50, 120]);
            break;
        }
      } catch (err) {
        // Safe ignore
      }
    }
  }

  // Text-To-Speech scene narration
  speak(text: string, rate: number = 1.0, pitch: number = 1.0): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = Math.max(0.5, Math.min(2.0, rate));
        utterance.pitch = Math.max(0.5, Math.min(2.0, pitch));
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Speech synthesis error', e);
      }
    }
  }

  // Voice Command Listener for hands-free surveillance control
  startVoiceCommands(onCommand: (command: string) => void): boolean {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        onCommand(transcript);
      };

      this.recognition.onerror = (e: any) => {
        console.warn('Voice recognition notice:', e);
      };

      this.recognition.start();
      return true;
    } catch (e) {
      console.warn('Could not start voice recognition', e);
      return false;
    }
  }

  stopVoiceCommands(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
  }
}

export const audioEngine = new AudioEngine();
