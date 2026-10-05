import { DetectionObject, FaceProfile } from '../types';

/**
 * Scene narration.
 *
 * Turns the raw detection list into a human description of what is happening
 * in the image: who is in it (saved name and relationship role when
 * recognition supplies them), what else is in it, where in the frame each
 * subject is, how far away, which way they are moving, and what they appear
 * to be doing. Narration text deliberately never names the camera it came
 * from — the same sentence must read naturally as a caption, a recording
 * title, or a spoken summary regardless of which view produced it.
 */

export interface SubjectNarration {
  /** Detection this line describes. */
  id: string;
  /** "Mom", "an unidentified person", "a golden retriever", "a delivery van". */
  who: string;
  /** Whether the subject was matched against the saved face database. */
  identified: boolean;
  /** Relationship from the face profile, e.g. "family", "delivery courier". */
  role?: string;
  /** What the subject appears to be doing, e.g. "walking briskly to the right". */
  action: string;
  /** Full sentence fragment for this subject. */
  phrase: string;
  /** Short chip text for the subject pill list. */
  chip: string;
  /** Every attribute recognition could read off this subject. */
  attributes: string[];
}

export interface SceneNarration {
  /** One-line spoken/caption summary. */
  summary: string;
  /** Longer multi-clause readout of the whole frame. */
  detailed: string;
  subjects: SubjectNarration[];
  /** "2 people, 1 dog, 1 vehicle" style census. */
  census: string;
  /** Environment clause: lighting, night vision, time of day. */
  environment: string;
  peopleCount: number;
  knownPeople: string[];
  unknownPeopleCount: number;
}

export interface SceneNarrationContext {
  faceProfiles?: FaceProfile[];
  nightVisionEnabled?: boolean;
  lightingCondition?: string;
  now?: number;
}

const ROLE_LABELS: Record<string, string> = {
  family: 'family member',
  friend: 'friend',
  guest: 'guest',
  need_permissions: 'unapproved visitor',
  pet: 'household pet',
  wildlife: 'wildlife',
  intruder: 'flagged intruder',
  unknown: 'unrecognized subject',
};

const EMOTION_PHRASES: Record<string, string> = {
  neutral: 'with a neutral expression',
  alert: 'looking alert',
  friendly: 'looking relaxed and friendly',
  distressed: 'appearing distressed',
  aggressive: 'appearing agitated',
};

const DELIVERY_PATTERN = /(ups|u\.?s\.?p\.?s|fed.?ex|amazon|usps|postal|mail|courier|delivery)/i;
const PACKAGE_PATTERN = /(package|parcel|box|delivery)/i;

/** Horizontal third plus vertical band, e.g. "the lower left of the frame". */
export function describeFramePosition(bbox: [number, number, number, number]): string {
  const [x, y, w, h] = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const horizontal = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'centre';
  const vertical = cy < 0.34 ? 'upper' : cy > 0.66 ? 'lower' : 'middle';
  if (horizontal === 'centre' && vertical === 'middle') return 'the centre of the frame';
  if (horizontal === 'centre') return `the ${vertical} centre of the frame`;
  if (vertical === 'middle') return `the ${horizontal} of the frame`;
  return `the ${vertical} ${horizontal} of the frame`;
}

/** Plain-language range band from the estimated distance. */
export function describeProximity(distanceMeters?: number, bbox?: [number, number, number, number]): string {
  const area = bbox ? bbox[2] * bbox[3] : 0;
  if (typeof distanceMeters === 'number' && distanceMeters > 0) {
    if (distanceMeters < 1.5) return 'right up close';
    if (distanceMeters < 3) return `close by, about ${distanceMeters.toFixed(1)} m away`;
    if (distanceMeters < 8) return `about ${distanceMeters.toFixed(1)} m away`;
    return `far back, roughly ${Math.round(distanceMeters)} m away`;
  }
  if (area > 0.25) return 'filling much of the frame';
  if (area > 0.05) return 'at mid range';
  if (area > 0) return 'small and distant in the frame';
  return '';
}

/** Direction and pace derived from the tracked motion vector. */
export function describeMovement(motionVector?: [number, number], speedMph?: number): string {
  const [vx = 0, vy = 0] = motionVector || [];
  const magnitude = Math.hypot(vx, vy);
  const speed = speedMph || 0;
  if (magnitude < 0.004 && speed < 0.4) return 'holding still';
  const parts: string[] = [];
  if (Math.abs(vx) > Math.abs(vy) * 0.6) parts.push(vx > 0 ? 'to the right' : 'to the left');
  if (Math.abs(vy) > Math.abs(vx) * 0.6) parts.push(vy > 0 ? 'toward the camera' : 'away from the camera');
  const pace = speed > 6 ? 'running' : speed > 2.2 ? 'walking briskly' : 'moving slowly';
  const direction = parts.length ? ` ${parts.join(' and ')}` : '';
  return `${pace}${direction}`;
}

/**
 * Merge posture and movement into one natural activity phrase: "standing
 * still", "sitting still", "walking briskly to the right" — instead of the
 * stilted "walking and walking briskly toward the camera".
 */
export function describeAction(posture?: string, movement?: string): string {
  const pace = movement || '';
  if (posture === 'walking') {
    if (!pace || pace === 'holding still') return 'walking';
    return pace.replace('moving slowly', 'walking slowly');
  }
  if (posture === 'standing' || posture === 'sitting') {
    if (!pace || pace === 'holding still') return `${posture} still`;
    return `${posture} and ${pace}`;
  }
  return pace || 'visible';
}

/**
 * Activity phrase for a detection, aware of what kind of thing it is: people
 * and animals walk, sit, and hold still; a stationary vehicle is "parked";
 * plain objects simply are where they are.
 */
function actionFor(detection: DetectionObject, posture: string | undefined, movement: string | undefined): string {
  if (detection.category === 'person' || detection.category === 'animal') {
    return describeAction(posture, movement);
  }
  if (detection.category === 'car') {
    return !movement || movement === 'holding still' ? 'parked' : movement;
  }
  return '';
}

function describeAppearance(detection: DetectionObject): string[] {
  const bits: string[] = [];
  const genderValue = detection.gender?.value;
  if (genderValue && (detection.gender?.probability ?? 1) > 0.6) {
    bits.push(genderValue.toLowerCase());
  }
  if (detection.age && detection.age.high > 0) {
    bits.push(`roughly ${Math.round(detection.age.low)}–${Math.round(detection.age.high)} years old`);
  }
  return bits;
}

function describeHeading(detection: DetectionObject): string | undefined {
  const yaw = detection.pose?.yaw;
  if (typeof yaw !== 'number') return undefined;
  if (Math.abs(yaw) < 15) return 'facing the camera directly';
  if (Math.abs(yaw) < 45) return yaw > 0 ? 'turned slightly to their right' : 'turned slightly to their left';
  return 'looking away from the camera';
}

function titleOf(detection: DetectionObject, profile?: FaceProfile): { who: string; identified: boolean; role?: string } {
  const name = detection.subjectName || detection.nameTag || profile?.name;
  const known = Boolean(name) && detection.isKnown !== false;
  const role = profile?.role ? ROLE_LABELS[profile.role] || profile.role : undefined;

  if (known && name) return { who: name, identified: true, role };

  switch (detection.category) {
    case 'person':
      return { who: 'an unidentified person', identified: false, role };
    case 'animal':
      return { who: detection.label ? `an unidentified ${detection.label.toLowerCase()}` : 'an unidentified animal', identified: false, role };
    case 'car':
      return { who: detection.label ? `a ${detection.label.toLowerCase()}` : 'a vehicle', identified: false, role };
    default:
      return { who: detection.label ? `a ${detection.label.toLowerCase()}` : 'an unclassified object', identified: false, role };
  }
}

export function narrateSubject(detection: DetectionObject, profiles: FaceProfile[] = []): SubjectNarration {
  const profile = profiles.find(
    (candidate) =>
      (detection.faceId && candidate.id === detection.faceId) ||
      (detection.subjectName && candidate.name.toLowerCase() === detection.subjectName.toLowerCase()),
  );
  const { who, identified, role } = titleOf(detection, profile);

  const attributes: string[] = [];
  const position = describeFramePosition(detection.bbox);
  const proximity = describeProximity(detection.distanceMeters, detection.bbox);
  const movement = describeMovement(detection.motionVector, detection.speedMph);
  const posture = detection.posture && detection.posture !== 'unknown' ? detection.posture : undefined;
  const heading = describeHeading(detection);
  const emotion = detection.emotion ? EMOTION_PHRASES[detection.emotion] : undefined;
  const appearance = describeAppearance(detection);

  if (role) attributes.push(role);
  if (detection.category === 'car') {
    attributes.push(!movement || movement === 'holding still' ? 'parked' : movement);
  } else {
    if (posture) attributes.push(posture);
    if (movement) attributes.push(movement);
  }
  if (proximity) attributes.push(proximity);
  if (heading) attributes.push(heading);
  if (emotion) attributes.push(emotion);
  attributes.push(...appearance);
  if (identified && typeof detection.similarity === 'number' && detection.similarity > 0) {
    attributes.push(`${Math.round(detection.similarity * 100)}% face match`);
  } else if (!identified && detection.confidence > 0) {
    attributes.push(`${Math.round(detection.confidence * 100)}% detection confidence`);
  }
  if (detection.threatLevel === 'critical') attributes.push('flagged critical');
  else if (detection.threatLevel === 'warning') attributes.push('flagged for review');

  const action = actionFor(detection, posture, movement);
  const clause = [
    `${who}${role ? ` (${role})` : ''}${action ? ` is ${action} in ` : ' is in '}${position}`,
    proximity,
    heading,
    emotion,
    appearance.length ? appearance.join(', ') : '',
  ]
    .filter(Boolean)
    .join(', ');

  const chip = [
    detection.subjectName || detection.nameTag || detection.label || 'Unknown',
    posture,
    position.replace('the ', '').replace(' of the frame', ''),
  ]
    .filter(Boolean)
    .join(' • ');

  return { id: detection.id, who, identified, role, action, phrase: clause, chip, attributes };
}

const IRREGULAR_PLURALS: Record<string, string> = { person: 'people', child: 'children', man: 'men', woman: 'women' };

function pluralize(noun: string): string {
  if (IRREGULAR_PLURALS[noun]) return IRREGULAR_PLURALS[noun];
  if (noun.endsWith('s')) return noun;
  return `${noun}s`;
}

/** Upper-case the first letter so each subject reads as its own sentence. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function censusOf(detections: DetectionObject[]): string {
  const counts = new Map<string, number>();
  detections.forEach((detection) => {
    const key =
      detection.category === 'person'
        ? 'person'
        : detection.category === 'animal'
          ? (detection.label || 'animal').toLowerCase()
          : detection.category === 'car'
            ? 'vehicle'
            : (detection.label || 'object').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([key, count]) => `${count} ${count === 1 ? key : pluralize(key)}`)
    .join(', ');
}

function describeEnvironment(context: SceneNarrationContext): string {
  const hour = new Date(context.now ?? Date.now()).getHours();
  const timeOfDay =
    hour < 5 ? 'overnight' : hour < 12 ? 'this morning' : hour < 17 ? 'this afternoon' : hour < 21 ? 'this evening' : 'tonight';
  const lighting = context.lightingCondition
    ? context.lightingCondition.toLowerCase()
    : context.nightVisionEnabled
      ? 'low light'
      : 'normal light';
  const nv = context.nightVisionEnabled ? ' with night vision engaged' : '';
  return `Captured ${timeOfDay} in ${lighting}${nv}`;
}

export function narrateScene(detections: DetectionObject[], context: SceneNarrationContext): SceneNarration {
  const profiles = context.faceProfiles || [];
  const subjects = detections.map((detection) => narrateSubject(detection, profiles));

  const people = detections.filter((detection) => detection.category === 'person');
  const knownPeople = people
    .map((person) => person.subjectName || person.nameTag)
    .filter((name): name is string => Boolean(name))
    .filter((name, index, names) => names.indexOf(name) === index);
  const unknownPeopleCount = people.length - knownPeople.length;
  const environment = describeEnvironment(context);

  if (detections.length === 0) {
    return {
      summary: 'The view is clear — no people, animals, or vehicles in frame.',
      detailed: `Nothing is in view — no people, animals, or vehicles detected. ${environment}.`,
      subjects,
      census: 'nothing detected',
      environment,
      peopleCount: 0,
      knownPeople: [],
      unknownPeopleCount: 0,
    };
  }

  const census = censusOf(detections);
  const packageObject = detections.find((detection) => PACKAGE_PATTERN.test(detection.label || ''));
  const courier = detections.find((detection) => DELIVERY_PATTERN.test(`${detection.label || ''} ${detection.nameTag || ''}`));

  // One short clause per subject describing what they are doing, e.g.
  // "Dana (family member) is standing still in the centre of the frame".
  const actionClause = (index: number) => {
    const subject = subjects[index];
    const detection = detections[index];
    return `${subject.who}${subject.role ? ` (${subject.role})` : ''}${subject.action ? ` is ${subject.action} in ` : ' is in '}${describeFramePosition(detection.bbox)}`;
  };

  // Summary is a genuine description of the scene, not a camera label:
  // lead with what the subjects are doing, and only fall back to a census
  // when the frame is too crowded to enumerate.
  const summaryParts: string[] = [];
  if (subjects.length <= 3) {
    summaryParts.push(...subjects.map((_, index) => actionClause(index)));
  } else {
    summaryParts.push(`the view shows ${census}`);
    summaryParts.push(actionClause(0), actionClause(1));
  }
  if (courier && packageObject) summaryParts.push('a delivery appears to be in progress');
  else if (courier) summaryParts.push('a delivery courier is in view');
  // When the package itself already got a subject clause above, saying it
  // again as an interpretation would be redundant.
  else if (packageObject && subjects.length > 3) summaryParts.push('a package has been left in view');
  const summary = `${sentence(summaryParts.join('; '))}.`;

  const detailed = [
    `The view shows ${census}.`,
    ...subjects.map((subject) => `${sentence(subject.phrase)}.`),
    `${environment}.`,
  ].join(' ');

  return {
    summary,
    detailed,
    subjects,
    census,
    environment,
    peopleCount: people.length,
    knownPeople,
    unknownPeopleCount: Math.max(0, unknownPeopleCount),
  };
}
