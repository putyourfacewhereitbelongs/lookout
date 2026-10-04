import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Verifies the microphone lifecycle and privacy guarantees of the audio cue
 * service against a mock Web Audio implementation.
 */

type Harness = {
  getUserMediaCalls: any[];
  stoppedTracks: number;
  closedContexts: number;
  connectedToDestination: boolean;
  intervals: Array<() => void>;
  setPcm: (samples: any) => void;
  tick: () => void;
};

function installMockAudio(seed: { fail?: string } = {}): Harness {
  const harness: Harness = {
    getUserMediaCalls: [],
    stoppedTracks: 0,
    closedContexts: 0,
    connectedToDestination: false,
    intervals: [],
    setPcm: () => {},
    tick: () => {},
  };

  let pcm: Float32Array = new Float32Array(2048) as Float32Array;
  harness.setPcm = (samples: Float32Array) => { pcm = samples as Float32Array; };

  const track = { stop: () => { harness.stoppedTracks++; }, kind: 'audio' };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };

  class MockAnalyser {
    fftSize = 2048;
    smoothingTimeConstant = 0;
    getFloatTimeDomainData(buffer: Float32Array) { buffer.set(pcm.subarray(0, buffer.length)); }
  }

  class MockAudioContext {
    state = 'running';
    sampleRate = 48000;
    destination = { __isDestination: true };
    createAnalyser() { return new MockAnalyser(); }
    createMediaStreamSource() {
      return {
        connect: (node: any) => { if (node?.__isDestination) harness.connectedToDestination = true; },
        disconnect: () => {},
      };
    }
    resume() { return Promise.resolve(); }
    close() { harness.closedContexts++; return Promise.resolve(); }
  }

  (globalThis as any).window = {
    AudioContext: MockAudioContext,
    setInterval: (fn: () => void) => { harness.intervals.push(fn); return harness.intervals.length; },
    clearInterval: (id: number) => { harness.intervals[id - 1] = () => {}; },
  };
  // Node exposes a read-only `navigator`, so it must be replaced by descriptor.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
    mediaDevices: {
      getUserMedia: async (constraints: any) => {
        harness.getUserMediaCalls.push(constraints);
        if (seed.fail) {
          const err: any = new Error('denied');
          err.name = seed.fail;
          throw err;
        }
        return stream;
      },
    },
    },
  });
  (globalThis as any).DOMException = class extends Error {};

  harness.tick = () => harness.intervals.forEach((fn) => fn());
  return harness;
}

async function freshService() {
  const mod = await import(`../src/services/audioCueService?${Math.random()}`);
  return new mod.AudioCueService();
}

test('no microphone is opened until the service is started', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  assert.equal(harness.getUserMediaCalls.length, 0, 'constructing the service must not touch the mic');
  assert.equal(service.isRunning, false);
});

test('start requests raw audio and never routes it to the speakers', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const ok = await service.start();

  assert.equal(ok, true);
  assert.equal(service.isRunning, true);
  assert.equal(harness.getUserMediaCalls.length, 1);

  const constraints = harness.getUserMediaCalls[0];
  assert.equal(constraints.video, false, 'the cue service must not request video');
  assert.equal(constraints.audio.echoCancellation, false, 'raw transients must be preserved');
  assert.equal(constraints.audio.noiseSuppression, false);
  assert.equal(constraints.audio.autoGainControl, false);
  assert.equal(harness.connectedToDestination, false, 'captured audio must never be played back');

  service.stop();
});

test('stop releases the microphone track and closes the audio context', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  await service.start();
  service.stop();

  assert.equal(service.isRunning, false);
  assert.equal(harness.stoppedTracks, 1, 'the mic track must be stopped');
  assert.equal(harness.closedContexts, 1, 'the audio context must be closed');
});

test('an externally supplied stream is reused and not stopped by this service', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const externalTrack = { stop: () => { throw new Error('must not stop a stream we do not own'); }, kind: 'audio' };
  const external: any = { getAudioTracks: () => [externalTrack], getTracks: () => [externalTrack] };

  await service.start(external);
  assert.equal(harness.getUserMediaCalls.length, 0, 'an existing audio track must be reused');
  service.stop();
  assert.equal(harness.stoppedTracks, 0);
});

test('a denied permission surfaces a readable error and leaves the service stopped', async () => {
  installMockAudio({ fail: 'NotAllowedError' });
  const service = await freshService();
  const ok = await service.start();

  assert.equal(ok, false);
  assert.equal(service.isRunning, false);
  assert.match(service.error ?? '', /permission|failed/i);
});

test('a loud sustained tone produces a cue through the live pipeline', async () => {
  const harness = installMockAudio();
  const service = await freshService();

  const cues: any[] = [];
  service.onCue((cue: any) => cues.push(cue));
  await service.start();

  const tone = new Float32Array(2048);
  for (let i = 0; i < tone.length; i++) tone[i] = 0.35 * Math.sin((2 * Math.PI * 2000 * i) / 48000);
  harness.setPcm(tone);

  for (let i = 0; i < 30; i++) harness.tick();

  assert.ok(cues.length > 0, 'a sustained alarm tone must emit at least one cue');
  assert.equal(cues[0].type, 'alarm');
  assert.ok(cues[0].confidence > 0.4);
  service.stop();
});

test('silence produces no cues', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const cues: any[] = [];
  service.onCue((cue: any) => cues.push(cue));
  await service.start();

  harness.setPcm(new Float32Array(2048));
  for (let i = 0; i < 30; i++) harness.tick();

  assert.equal(cues.length, 0, 'an empty room must not generate sound events');
  service.stop();
});
