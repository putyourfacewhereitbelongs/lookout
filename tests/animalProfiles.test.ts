import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { StorageService } from '../src/services/db';

const store = new Map<string, string>();
const originalDateNow = Date.now;
let clock = 1_000_000;
let storageWrites = 0;

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { storageWrites++; store.set(key, value); },
      removeItem: (key: string) => store.delete(key),
    },
  });
  Date.now = () => clock;
  clock = 1_000_000;
  StorageService.saveFaceProfiles([]);
  storageWrites = 0;
});

afterEach(() => {
  Date.now = originalDateNow;
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

test('adds an animal as a local reference instead of assigning a face-match score', () => {
  const profile = StorageService.addManualProfile({
    name: 'Mochi',
    subjectType: 'animal',
    role: 'pet',
    thumbnail: 'data:image/jpeg;base64,pet-photo',
  });

  assert.equal(profile.name, 'Mochi');
  assert.equal(profile.subjectType, 'animal');
  assert.equal(profile.similarityScore, 0);
  assert.deepEqual(profile.snapshots, ['data:image/jpeg;base64,pet-photo']);
});

test('catalogs later animal views as reference photos at a bounded interval', () => {
  const first = StorageService.catalogDetectedAnimal('track-1', 'Dog', 'Captured', 'photo-one', 0.8);
  clock += 16_000;
  const second = StorageService.catalogDetectedAnimal('track-1', 'Dog', 'Captured', 'photo-two', 0.8);

  assert.equal(second.id, first.id);
  assert.deepEqual(second.snapshots, ['photo-one', 'photo-two']);
  clock += 1_000;
  StorageService.catalogDetectedAnimal('track-1', 'Dog', 'Captured', 'photo-three', 0.8);
  assert.deepEqual(StorageService.getFaceProfiles()[0].snapshots, ['photo-one', 'photo-two']);
});

test('saving an animal name persists its animal type and trusted role', () => {
  const profile = StorageService.catalogDetectedAnimal('track-2', 'Cat', 'Captured', 'cat-photo', 0.7);
  StorageService.updateProfileNameAndRole(profile.id, 'Mochi', 'pet', 'House cat', 'animal');

  const saved = StorageService.getFaceProfiles()[0];
  assert.equal(saved.name, 'Mochi');
  assert.equal(saved.subjectType, 'animal');
  assert.equal(saved.role, 'pet');
});

test('throttles repeated unknown-face thumbnail writes', () => {
  StorageService.catalogUnknownFace('Unknown Subject', 'person', 'Captured', 'face-one');
  const writesAfterFirstDetection = storageWrites;
  StorageService.catalogUnknownFace('Unknown Subject', 'person', 'Captured', 'face-two');
  assert.equal(storageWrites, writesAfterFirstDetection);

  clock += 10_001;
  StorageService.catalogUnknownFace('Unknown Subject', 'person', 'Captured', 'face-three');
  assert.equal(StorageService.getFaceProfiles()[0].snapshots.length, 2);
});

test('throttles repeated known-face last-seen writes', () => {
  const profile = StorageService.addManualProfile({
    name: 'Alex', subjectType: 'person', role: 'family', thumbnail: 'person-photo',
  });
  storageWrites = 0;
  StorageService.updateFaceLastSeenByName(profile.name);
  const writesAfterFirstMatch = storageWrites;
  StorageService.updateFaceLastSeenByName(profile.name);
  assert.equal(storageWrites, writesAfterFirstMatch);

  clock += 10_001;
  StorageService.updateFaceLastSeenByName(profile.name);
  assert.equal(storageWrites, writesAfterFirstMatch + 1);
});
