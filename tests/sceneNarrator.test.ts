import test from 'node:test';
import assert from 'node:assert/strict';
import { narrateScene, narrateSubject, describeFramePosition, describeMovement, describeProximity } from '../src/services/sceneNarrator';
import { DetectionObject, FaceProfile } from '../src/types';

const base = (overrides: Partial<DetectionObject> = {}): DetectionObject => ({
  id: 'd1',
  label: 'Person',
  category: 'person',
  confidence: 0.91,
  bbox: [0.4, 0.4, 0.2, 0.2],
  threatLevel: 'none',
  motionVector: [0, 0],
  distanceMeters: 4,
  speedMph: 0,
  ...overrides,
});

test('frame position names the third and band', () => {
  assert.equal(describeFramePosition([0.4, 0.4, 0.2, 0.2]), 'the centre of the frame');
  assert.equal(describeFramePosition([0.0, 0.7, 0.1, 0.2]), 'the lower left of the frame');
  assert.equal(describeFramePosition([0.8, 0.0, 0.1, 0.1]), 'the upper right of the frame');
});

test('proximity and movement read in plain language', () => {
  assert.match(describeProximity(1.0), /right up against the lens/);
  assert.match(describeProximity(4.2), /4\.2 m from the camera/);
  assert.equal(describeMovement([0, 0], 0), 'holding still');
  assert.match(describeMovement([0.05, 0], 7), /running right/);
  assert.match(describeMovement([0, 0.05], 1), /toward the camera/);
});

test('a recognized person is named with their role and behaviour', () => {
  const profiles: FaceProfile[] = [{
    id: 'f1', name: 'Dana', subjectType: 'person', role: 'family', thumbnail: '', snapshots: [],
    clusterId: 'c1', similarityScore: 0.98, firstSeen: 0, lastSeen: 0,
  }];
  const subject = narrateSubject(base({
    subjectName: 'Dana', faceId: 'f1', isKnown: true, similarity: 0.97,
    posture: 'walking', motionVector: [0, 0.05], speedMph: 3, emotion: 'friendly',
  }), profiles);

  assert.equal(subject.identified, true);
  assert.equal(subject.who, 'Dana');
  assert.equal(subject.role, 'family member');
  assert.match(subject.phrase, /Dana \(family member\) is walking and walking briskly toward the camera/);
  assert.ok(subject.attributes.includes('97% face match'));
});

test('an unmatched face is described as unidentified', () => {
  const subject = narrateSubject(base({ isKnown: false, posture: 'standing' }));
  assert.equal(subject.identified, false);
  assert.equal(subject.who, 'an unidentified person');
  assert.match(subject.phrase, /unidentified person is standing/);
});

test('scene narration counts who and what is on screen', () => {
  const narration = narrateScene(
    [
      base({ id: 'a', subjectName: 'Dana', isKnown: true, posture: 'standing' }),
      base({ id: 'b', isKnown: false, bbox: [0.7, 0.5, 0.1, 0.2] }),
      base({ id: 'c', category: 'animal', label: 'dog', bbox: [0.1, 0.8, 0.1, 0.1] }),
    ],
    { cameraName: 'Driveway', nightVisionEnabled: true },
  );

  assert.equal(narration.peopleCount, 2);
  assert.deepEqual(narration.knownPeople, ['Dana']);
  assert.equal(narration.unknownPeopleCount, 1);
  assert.match(narration.census, /2 people/);
  assert.match(narration.detailed, /Dana is standing/);
  assert.match(narration.census, /1 dog/);
  assert.match(narration.summary, /Driveway: Dana plus 1 unidentified person on screen/);
  assert.match(narration.detailed, /night vision engaged/);
  assert.equal(narration.subjects.length, 3);
});

test('an empty frame says the view is clear', () => {
  const narration = narrateScene([], { cameraName: 'Backyard' });
  assert.match(narration.summary, /view is clear/);
  assert.equal(narration.census, 'nothing detected');
});
