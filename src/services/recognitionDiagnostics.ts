/**
 * Session-level recognition activity, recorded by the live recognition cycle
 * and shown in Settings -> Face Database.
 *
 * When recognition silently stops naming someone, the cause is almost always
 * one of the gates (master switch, category switch, confidence floor, monitored
 * zone, similarity thresholds, confirmation scans) or a failing recognizer —
 * all of which are invisible in the live view. These counters make every step
 * of the pipeline observable at a glance: how many faces were seen, how many
 * each gate let through, and exactly what the gates are set to right now.
 */

/** The pipeline gates in effect during the most recent recognition scan. */
export interface RecognitionGateState {
  masterEnabled: boolean;
  peopleEnabled: boolean;
  animalsEnabled: boolean;
  /** Effective detector confidence floor (>= the built-in 82% guard). */
  confidenceFloor: number;
  detectionZone: 'full_frame' | 'central_zone' | 'perimeter_only';
  /** Similarity needed before the HUD shows a name. */
  namingThreshold: number;
  /** Similarity needed before a name raises an alert or DVR event. */
  alertThreshold: number;
  /** Consecutive scans a face must appear in before it is reported. */
  confirmationScans: number;
}

export interface RecognitionActivity {
  /** Completed recognition scans this session. */
  cycles: number;
  /** Face boxes that reached the pipeline (already past the noise gate). */
  facesSeen: number;
  /** Faces dropped by the category confidence floor. */
  droppedBelowFloor: number;
  /** Faces dropped by the monitored-zone setting. */
  droppedOutsideZone: number;
  /** Face sightings awaiting their confirmation scans. */
  pendingConfirmation: number;
  /** Face sightings confirmed present by consecutive scans. */
  confirmedFaces: number;
  /** Confirmed faces that cleared the naming threshold (name on the HUD). */
  namedOnHud: number;
  /** Confirmed faces that cleared the alert threshold ("X identified"). */
  identifiedFaces: number;
  /** "Unidentified person" reports raised. */
  unknownPersonReports: number;
  /** Scans where a pet-photo candidate match was found. */
  petCandidateScans: number;
  /** Pet matches confirmed by a second agreeing scan. */
  petConfirmedScans: number;
  /** Implausible boxes filtered by the noise gate (cumulative). */
  implausibleBoxesSuppressed: number;
  /** Recognition requests that failed. */
  recognitionErrors: number;
  /** Timestamp of the last recorded scan, or null before the first one. */
  lastCycleAt: number | null;
  /** Gates recorded by the most recent scan. */
  gates: RecognitionGateState | null;
}

const EMPTY_ACTIVITY: RecognitionActivity = {
  cycles: 0,
  facesSeen: 0,
  droppedBelowFloor: 0,
  droppedOutsideZone: 0,
  pendingConfirmation: 0,
  confirmedFaces: 0,
  namedOnHud: 0,
  identifiedFaces: 0,
  unknownPersonReports: 0,
  petCandidateScans: 0,
  petConfirmedScans: 0,
  implausibleBoxesSuppressed: 0,
  recognitionErrors: 0,
  lastCycleAt: null,
  gates: null,
};

export interface RecognitionCycleInput {
  facesSeen: number;
  droppedBelowFloor: number;
  droppedOutsideZone: number;
  pendingConfirmation: number;
  confirmedFaces: number;
  namedOnHud: number;
  identifiedFaces: number;
  implausibleBoxesSuppressed: number;
  gates: RecognitionGateState;
}

type Listener = (activity: Readonly<RecognitionActivity>) => void;

class RecognitionDiagnostics {
  private activity: RecognitionActivity = { ...EMPTY_ACTIVITY };
  private listeners = new Set<Listener>();

  /** Record one completed scan of the recognition cycle. */
  recordCycle(input: RecognitionCycleInput): void {
    this.activity.cycles += 1;
    this.activity.facesSeen += input.facesSeen;
    this.activity.droppedBelowFloor += input.droppedBelowFloor;
    this.activity.droppedOutsideZone += input.droppedOutsideZone;
    this.activity.pendingConfirmation += input.pendingConfirmation;
    this.activity.confirmedFaces += input.confirmedFaces;
    this.activity.namedOnHud += input.namedOnHud;
    this.activity.identifiedFaces += input.identifiedFaces;
    this.activity.implausibleBoxesSuppressed = input.implausibleBoxesSuppressed;
    this.activity.lastCycleAt = Date.now();
    this.activity.gates = { ...input.gates };
    this.emit();
  }

  /** An unknown-face report was raised. */
  recordUnknownPerson(): void {
    this.activity.unknownPersonReports += 1;
    this.emit();
  }

  /** A local pet-photo candidate match was observed (not yet confirmed). */
  recordPetCandidate(): void {
    this.activity.petCandidateScans += 1;
    this.emit();
  }

  /** A pet match was confirmed by a second agreeing scan. */
  recordPetConfirmed(): void {
    this.activity.petConfirmedScans += 1;
    this.emit();
  }

  /** A recognition request failed. */
  recordRecognitionError(): void {
    this.activity.recognitionErrors += 1;
    this.emit();
  }

  getActivity(): Readonly<RecognitionActivity> {
    return { ...this.activity, gates: this.activity.gates ? { ...this.activity.gates } : null };
  }

  reset(): void {
    this.activity = { ...EMPTY_ACTIVITY };
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getActivity());
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    const snapshot = this.getActivity();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const recognitionDiagnostics = new RecognitionDiagnostics();
