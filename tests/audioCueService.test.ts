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
  const ok = await service.start([], true);

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
  await service.start([], true);
  service.stop();

  assert.equal(service.isRunning, false);
  assert.equal(harness.stoppedTracks, 1, 'the mic track must be stopped');
  assert.equal(harness.closedContexts, 1, 'the audio context must be closed');
});

function mockStream(label = 'track') {
  const track = { stop() { (track as any).stopped = true; }, kind: 'audio', readyState: 'live', label };
  return {
    track,
    stream: { getAudioTracks: () => [track], getTracks: () => [track] } as any,
  };
}

test('a supplied source stream is used instead of the microphone and is not stopped', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const { track, stream } = mockStream();

  const ok = await service.start([{ id: 'screen', label: 'Shared tab', stream }], true);
  assert.equal(ok, true);
  assert.equal(harness.getUserMediaCalls.length, 0, 'a provided audio source must suppress the mic request');
  assert.deepEqual(service.activeSources, [{ id: 'screen', label: 'Shared tab' }]);

  service.stop();
  assert.notEqual((track as any).stopped, true, 'a stream we do not own must not be stopped');
});

test('the microphone is only opened when no source carries audio', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const silentVideoOnly: any = { getAudioTracks: () => [], getTracks: () => [] };

  await service.start([{ id: 'cam', label: 'Front Door', stream: silentVideoOnly }], true);
  assert.equal(harness.getUserMediaCalls.length, 1, 'an audio-less camera must fall back to the mic');
  assert.deepEqual(service.activeSources, [{ id: 'microphone', label: 'Microphone' }]);
  service.stop();
});

test('microphone fallback can be refused, leaving an explanatory error', async () => {
  const harness = installMockAudio();
  const service = await freshService();

  const ok = await service.start([], false);
  assert.equal(ok, false);
  assert.equal(harness.getUserMediaCalls.length, 0, 'fallback disabled must never touch the mic');
  assert.match(service.error ?? '', /share audio|No audio/i);
});

test('several cameras are analysed as separate labelled sources', async () => {
  installMockAudio();
  const service = await freshService();
  const a = mockStream('a');
  const b = mockStream('b');

  await service.start([
    { id: 'screen', label: 'Shared tab', stream: a.stream },
    { id: 'cam-2', label: 'Back Garden', stream: b.stream },
  ], true);

  assert.equal(service.activeSources.length, 2);
  assert.deepEqual(service.activeSources.map((s: any) => s.label).sort(), ['Back Garden', 'Shared tab']);
  service.stop();
});

test('cues are tagged with the source that produced them', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const { stream } = mockStream();
  const cues: any[] = [];
  service.onCue((cue: any) => cues.push(cue));

  await service.start([{ id: 'screen', label: 'Shared tab', stream }], true);

  const tone = new Float32Array(2048);
  for (let i = 0; i < tone.length; i++) tone[i] = 0.35 * Math.sin((2 * Math.PI * 2000 * i) / 48000);
  harness.setPcm(tone);
  for (let i = 0; i < 30; i++) harness.tick();

  assert.ok(cues.length > 0, 'the shared tab must produce cues');
  assert.equal(cues[0].sourceId, 'screen');
  assert.equal(cues[0].sourceLabel, 'Shared tab');
  service.stop();
});

test('calling start again swaps sources without tearing down the survivors', async () => {
  installMockAudio();
  const service = await freshService();
  const a = mockStream('a');
  const b = mockStream('b');

  await service.start([{ id: 'screen', label: 'Shared tab', stream: a.stream }], true);
  await service.start([
    { id: 'screen', label: 'Shared tab', stream: a.stream },
    { id: 'cam-2', label: 'Back Garden', stream: b.stream },
  ], true);
  assert.equal(service.activeSources.length, 2, 'a newly shared source must be added');

  await service.start([{ id: 'cam-2', label: 'Back Garden', stream: b.stream }], true);
  assert.deepEqual(service.activeSources, [{ id: 'cam-2', label: 'Back Garden' }], 'a stopped share must be detached');
  service.stop();
});

test('a source whose tracks have ended is dropped automatically', async () => {
  const harness = installMockAudio();
  const service = await freshService();
  const { track, stream } = mockStream();

  await service.start([{ id: 'screen', label: 'Shared tab', stream }], true);
  assert.equal(service.activeSources.length, 1);

  // The user pressed the browser's own "stop sharing" button.
  (track as any).readyState = 'ended';
  harness.tick();

  assert.equal(service.activeSources.length, 0, 'an ended share must be detached without error');
  service.stop();
});

test('a denied permission surfaces a readable error and leaves the service stopped', async () => {
  installMockAudio({ fail: 'NotAllowedError' });
  const service = await freshService();
  const ok = await service.start([], true);

  assert.equal(ok, false);
  assert.equal(service.isRunning, false);
  assert.match(service.error ?? '', /permission|denied|No audio/i);
});

test('a loud sustained tone produces a cue through the live pipeline', async () => {
  const harness = installMockAudio();
  const service = await freshService();

  const cues: any[] = [];
  service.onCue((cue: any) => cues.push(cue));
  await service.start([], true);

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
  await service.start([], true);

  harness.setPcm(new Float32Array(2048));
  for (let i = 0; i < 30; i++) harness.tick();

  assert.equal(cues.length, 0, 'an empty room must not generate sound events');
  service.stop();
});
