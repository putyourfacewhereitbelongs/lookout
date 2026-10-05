import test from 'node:test';
import assert from 'node:assert/strict';
import { narrateScene, narrateSubject, describeAction, describeFramePosition, describeMovement, describeProximity } from '../src/services/sceneNarrator';
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
  assert.match(describeProximity(1.0), /right up close/);
  assert.match(describeProximity(4.2), /about 4\.2 m away/);
  assert.equal(describeMovement([0, 0], 0), 'holding still');
  assert.match(describeMovement([0.05, 0], 7), /running to the right/);
  assert.match(describeMovement([0, 0.05], 1), /toward the camera/);
});

test('posture and movement merge into one natural activity phrase', () => {
  assert.equal(describeAction('standing', 'holding still'), 'standing still');
  assert.equal(describeAction('sitting', 'holding still'), 'sitting still');
  assert.equal(describeAction('walking', 'walking briskly to the right'), 'walking briskly to the right');
  assert.equal(describeAction('walking', 'moving slowly to the left'), 'walking slowly to the left');
  assert.equal(describeAction('walking', 'holding still'), 'walking');
  assert.equal(describeAction('standing', 'moving slowly toward the camera'), 'standing and moving slowly toward the camera');
  assert.equal(describeAction(undefined, undefined), 'visible');
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
  assert.equal(subject.action, 'walking briskly toward the camera');
  assert.match(subject.phrase, /Dana \(family member\) is walking briskly toward the camera in the centre of the frame/);
  assert.ok(subject.attributes.includes('97% face match'));
});

test('an unmatched face is described as unidentified', () => {
  const subject = narrateSubject(base({ isKnown: false, posture: 'standing' }));
  assert.equal(subject.identified, false);
  assert.equal(subject.who, 'an unidentified person');
  assert.equal(subject.action, 'standing still');
  assert.match(subject.phrase, /unidentified person is standing still/);
});

test('scene narration counts who and what is on screen', () => {
  const narration = narrateScene(
    [
      base({ id: 'a', subjectName: 'Dana', isKnown: true, posture: 'standing' }),
      base({ id: 'b', isKnown: false, bbox: [0.7, 0.5, 0.1, 0.2] }),
      base({ id: 'c', category: 'animal', label: 'dog', bbox: [0.1, 0.8, 0.1, 0.1] }),
    ],
    { nightVisionEnabled: true },
  );

  assert.equal(narration.peopleCount, 2);
  assert.deepEqual(narration.knownPeople, ['Dana']);
  assert.equal(narration.unknownPeopleCount, 1);
  assert.match(narration.census, /2 people/);
  assert.match(narration.detailed, /Dana is standing still/);
  assert.match(narration.census, /1 dog/);
  // The summary describes what is happening, subject by subject.
  assert.match(narration.summary, /^Dana is standing still in the centre of the frame/);
  assert.match(narration.summary, /an unidentified person is holding still/);
  // Narration never names the camera it came from.
  assert.ok(!narration.summary.includes('Driveway'));
  assert.ok(!narration.detailed.includes('Driveway'));
  assert.match(narration.detailed, /night vision engaged/);
  assert.equal(narration.subjects.length, 3);
});

test('an empty frame says the view is clear', () => {
  const narration = narrateScene([], {});
  assert.match(narration.summary, /view is clear/);
  assert.equal(narration.census, 'nothing detected');
});

test('crowded scenes summarize with a census plus the leading actions', () => {
  const crowded = [
    base({ id: 'a', subjectName: 'Dana', isKnown: true, posture: 'walking', motionVector: [0, 0.05], speedMph: 3 }),
    base({ id: 'b', isKnown: false, bbox: [0.7, 0.5, 0.1, 0.2], posture: 'standing' }),
    base({ id: 'c', category: 'animal', label: 'dog', bbox: [0.1, 0.8, 0.1, 0.1] }),
    base({ id: 'd', category: 'car', label: 'van', bbox: [0.0, 0.3, 0.3, 0.3] }),
  ];
  const narration = narrateScene(crowded, {});
  assert.match(narration.summary, /The view shows 2 people, 1 dog, 1 vehicle/);
  assert.match(narration.summary, /Dana is walking briskly toward the camera/);
  assert.ok(!narration.summary.includes('camera:'));
});

test('a package is described plainly, and called out in crowded scenes', () => {
  // With room to enumerate, the package gets its own subject clause and the
  // summary does not repeat it as an interpretation.
  const quiet = narrateScene([
    base({ id: 'a', subjectName: 'Dana', isKnown: true, posture: 'standing' }),
    base({ id: 'p', category: 'object', label: 'package', bbox: [0.05, 0.85, 0.1, 0.1] }),
  ], {});
  assert.match(quiet.summary, /a package is in the lower left of the frame/);
  assert.ok(!quiet.summary.includes('left in view'));

  // In a crowded frame the census takes over and the package interpretation
  // is called out explicitly.
  const crowded = narrateScene([
    base({ id: 'a', subjectName: 'Dana', isKnown: true, posture: 'standing' }),
    base({ id: 'b', isKnown: false, bbox: [0.7, 0.5, 0.1, 0.2], posture: 'standing' }),
    base({ id: 'c', category: 'animal', label: 'dog', bbox: [0.1, 0.8, 0.1, 0.1] }),
    base({ id: 'p', category: 'object', label: 'package', bbox: [0.05, 0.85, 0.1, 0.1] }),
  ], {});
  assert.match(crowded.summary, /a package has been left in view/);
});

test('vehicles read as parked or moving', () => {
  const narration = narrateScene([
    base({ id: 'v1', category: 'car', label: 'van', bbox: [0.0, 0.3, 0.3, 0.3] }),
    base({ id: 'v2', category: 'car', label: 'truck', bbox: [0.6, 0.3, 0.3, 0.3], motionVector: [0.06, 0], speedMph: 8 }),
  ], {});
  assert.match(narration.summary, /A van is parked in the left of the frame/);
  assert.match(narration.summary, /a truck is running to the right/);
});

test('narration text never mentions a camera name', () => {
  const narration = narrateScene(
    [base({ id: 'a', subjectName: 'Dana', isKnown: true, posture: 'standing' })],
    { nightVisionEnabled: false },
  );
  assert.ok(!/camera\s*[:;]/i.test(narration.summary));
  assert.ok(!narration.detailed.startsWith('Camera'));
  assert.match(narration.detailed, /^The view shows 1 person\./);
});
