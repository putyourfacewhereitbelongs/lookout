import test from 'node:test';
import assert from 'node:assert/strict';
import { recognitionDiagnostics, RecognitionActivity, RecognitionGateState } from '../src/services/recognitionDiagnostics';

function gates(overrides: Partial<RecognitionGateState> = {}): RecognitionGateState {
  return {
    masterEnabled: true,
    peopleEnabled: true,
    animalsEnabled: true,
    confidenceFloor: 0.82,
    detectionZone: 'full_frame',
    namingThreshold: 0.92,
    alertThreshold: 0.97,
    confirmationScans: 3,
    ...overrides,
  };
}

test('counters accumulate across recorded scans', () => {
  recognitionDiagnostics.reset();
  recognitionDiagnostics.recordCycle({
    facesSeen: 2, droppedBelowFloor: 0, droppedOutsideZone: 0,
    pendingConfirmation: 1, confirmedFaces: 1, namedOnHud: 1, identifiedFaces: 1,
    implausibleBoxesSuppressed: 4, gates: gates(),
  });
  recognitionDiagnostics.recordCycle({
    facesSeen: 3, droppedBelowFloor: 1, droppedOutsideZone: 1,
    pendingConfirmation: 2, confirmedFaces: 1, namedOnHud: 0, identifiedFaces: 0,
    implausibleBoxesSuppressed: 6, gates: gates({ namingThreshold: 0.9 }),
  });

  const activity = recognitionDiagnostics.getActivity();
  assert.equal(activity.cycles, 2);
  assert.equal(activity.facesSeen, 5);
  assert.equal(activity.droppedBelowFloor, 1);
  assert.equal(activity.droppedOutsideZone, 1);
  assert.equal(activity.pendingConfirmation, 3);
  assert.equal(activity.confirmedFaces, 2);
  assert.equal(activity.namedOnHud, 1);
  assert.equal(activity.identifiedFaces, 1);
  // Cumulative counters from the recognizer are stored as-is.
  assert.equal(activity.implausibleBoxesSuppressed, 6);
  assert.ok(activity.lastCycleAt !== null);
});

test('the most recent scan overwrites the gate snapshot', () => {
  recognitionDiagnostics.reset();
  recognitionDiagnostics.recordCycle({
    facesSeen: 0, droppedBelowFloor: 0, droppedOutsideZone: 0,
    pendingConfirmation: 0, confirmedFaces: 0, namedOnHud: 0, identifiedFaces: 0,
    implausibleBoxesSuppressed: 0, gates: gates({ peopleEnabled: false, confidenceFloor: 0.95 }),
  });

  const activity = recognitionDiagnostics.getActivity();
  assert.equal(activity.gates?.peopleEnabled, false);
  assert.equal(activity.gates?.confidenceFloor, 0.95);
});

test('unknown, pet, and error events are counted separately', () => {
  recognitionDiagnostics.reset();
  recognitionDiagnostics.recordUnknownPerson();
  recognitionDiagnostics.recordUnknownPerson();
  recognitionDiagnostics.recordPetCandidate();
  recognitionDiagnostics.recordPetConfirmed();
  recognitionDiagnostics.recordRecognitionError();

  const activity = recognitionDiagnostics.getActivity();
  assert.equal(activity.unknownPersonReports, 2);
  assert.equal(activity.petCandidateScans, 1);
  assert.equal(activity.petConfirmedScans, 1);
  assert.equal(activity.recognitionErrors, 1);
});

test('subscribers are notified of every update and can unsubscribe', () => {
  recognitionDiagnostics.reset();
  let notifications = 0;
  const unsubscribe = recognitionDiagnostics.subscribe(() => { notifications += 1; });
  // The subscription delivers the current state immediately.
  assert.equal(notifications, 1);

  recognitionDiagnostics.recordUnknownPerson();
  assert.equal(notifications, 2);

  unsubscribe();
  recognitionDiagnostics.recordUnknownPerson();
  assert.equal(notifications, 2);
});

test('getActivity returns a defensive copy', () => {
  recognitionDiagnostics.reset();
  recognitionDiagnostics.recordCycle({
    facesSeen: 1, droppedBelowFloor: 0, droppedOutsideZone: 0,
    pendingConfirmation: 0, confirmedFaces: 1, namedOnHud: 1, identifiedFaces: 0,
    implausibleBoxesSuppressed: 0, gates: gates(),
  });

  const first = recognitionDiagnostics.getActivity() as RecognitionActivity;
  first.facesSeen = 999;
  if (first.gates) first.gates.peopleEnabled = false;
  const second = recognitionDiagnostics.getActivity();
  assert.equal(second.facesSeen, 1);
  assert.equal(second.gates?.peopleEnabled, true);
});

test('reset clears the whole session', () => {
  recognitionDiagnostics.recordUnknownPerson();
  recognitionDiagnostics.reset();
  const activity = recognitionDiagnostics.getActivity();
  assert.equal(activity.cycles, 0);
  assert.equal(activity.facesSeen, 0);
  assert.equal(activity.unknownPersonReports, 0);
  assert.equal(activity.gates, null);
  assert.equal(activity.lastCycleAt, null);
});
