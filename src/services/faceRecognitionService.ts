import { CompreFaceDetection, DetectionObject } from '../types';

const PERSON_TRACK_RETENTION_MS = 2200;

export class FaceRecognitionService {
  private static instance: FaceRecognitionService;
  private isProcessing = false;
  private lastRecognitionError = '';

  getLastRecognitionError(): string {
    return this.lastRecognitionError;
  }

  static getInstance(): FaceRecognitionService {
    if (!FaceRecognitionService.instance) {
      FaceRecognitionService.instance = new FaceRecognitionService();
    }
    return FaceRecognitionService.instance;
  }

  /**
   * Calls CompreFace through the backend proxy with landmarks only to reduce inference time.
   */
  async recognize(imageBase64: string): Promise<CompreFaceDetection[]> {
    if (this.isProcessing) return [];
    this.isProcessing = true;

    try {
      const res = await fetch('/api/recognition/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        this.lastRecognitionError = data.error || `Recognition request failed (${res.status}).`;
        return [];
      }

      const data = await res.json();
      this.lastRecognitionError = '';
      return Array.isArray(data.result) ? data.result : [];
    } catch (err) {
      this.lastRecognitionError = err instanceof Error ? err.message : 'Recognition service is unavailable.';
      console.warn('FaceRecognition recognize error:', err);
      return [];
    } finally {
      this.isProcessing = false;
    }
  }

  isReliableMatch(detection: CompreFaceDetection, threshold: number): boolean {
    const [best, runnerUp] = [...(detection.subjects || [])].sort((a, b) => b.similarity - a.similarity);
    return Boolean(best && best.similarity >= Math.max(0.90, threshold) &&
      (!runnerUp || best.similarity - runnerUp.similarity >= 0.08));
  }

  /**
   * Fetch all registered subjects from CompreFace database
   */
  async getSubjects(): Promise<string[]> {
    const res = await fetch('/api/recognition/subjects');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `CompreFace subjects request failed (${res.status}).`);
    }
    return Array.isArray(data.subjects) ? data.subjects : [];
  }

  async getSubjectImages(): Promise<Record<string, string>> {
    const res = await fetch('/api/recognition/subject-images');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `CompreFace face-images request failed (${res.status}).`);
    }
    return data.images && typeof data.images === 'object' ? data.images : {};
  }

  /**
   * Enroll a new face image for a subject
   */
  async enrollFace(subject: string, imageBase64: string): Promise<any> {
    try {
      const res = await fetch('/api/recognition/faces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, imageBase64 }),
      });
      return await res.json();
    } catch (err) {
      console.warn('Enroll face error:', err);
      return { success: false };
    }
  }

  /**
   * Check connection status to CompreFace service
   */
  async checkStatus(): Promise<{
    online: boolean;
    endpoint: string;
    subjectCount: number;
    subjects: string[];
  }> {
    try {
      const res = await fetch('/api/recognition/status');
      return await res.json();
    } catch (err: any) {
      return {
        online: false,
        endpoint: '',
        subjectCount: 0,
        subjects: [],
      };
    }
  }

  /**
   * Calls the server's vision-backed object detection endpoint.
   */
  async detectObjects(imageBase64: string): Promise<DetectionObject[]> {
    try {
      const res = await fetch('/api/vision/detect-objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.objects) ? data.objects : [];
    } catch (err) {
      console.warn('Real object detection error:', err);
      return [];
    }
  }

  /**
   * Correlates CompreFace detections with currently tracked objects.
   * Generates or updates bounding boxes, normalized landmarks, and identification labels.
   */
  correlateDetections(
    currentObjects: DetectionObject[],
    detections: CompreFaceDetection[],
    imgWidth: number,
    imgHeight: number,
    matchThreshold = 0.65,
    animalNames: string[] = []
  ): DetectionObject[] {
    const now = Date.now();
    const updated: DetectionObject[] = [...currentObjects];

    // Other non-person objects (cars, animals, objects) are preserved
    const knownAnimalNames = new Set(animalNames.map((name) => name.toLowerCase()));
    const isKnownAnimalObject = (o: DetectionObject) =>
      o.category === 'animal' && knownAnimalNames.has((o.subjectName || o.nameTag || o.label).toLowerCase());
    const nonPersonObjects = updated.filter((o) => o.category !== 'person' && !isKnownAnimalObject(o));
    const existingPersons = updated.filter((o) => o.category === 'person' || isKnownAnimalObject(o));

    const matchedPersonIds = new Set<string>();

    detections.forEach((d, detIdx) => {
      // Normalize face coordinates
      if (!Number.isFinite(imgWidth) || !Number.isFinite(imgHeight) || imgWidth <= 0 || imgHeight <= 0) return;
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      const fx = clamp(d.box.x_min / imgWidth);
      const fy = clamp(d.box.y_min / imgHeight);
      const fw = clamp((d.box.x_max - d.box.x_min) / imgWidth);
      const fh = clamp((d.box.y_max - d.box.y_min) / imgHeight);
      if (fw <= 0 || fh <= 0) return;

      // CompreFace returns the face rectangle. Add only a little clearance for
      // hair/head movement; don't expand it down across the shoulders.
      const targetX = clamp(fx - fw * 0.08);
      const targetY = clamp(fy - fh * 0.10);
      const targetW = Math.min(1 - targetX, fw * 1.16);
      const targetH = Math.min(1 - targetY, fh * 1.20);
      const targetBbox: [number, number, number, number] = [targetX, targetY, targetW, targetH];
      // The HUD remains head-sized. Semantic segmentation gets a generous
      // person-sized crop so it can retain the visible body, arms, and legs.
      // This is input context only: the renderer never displays this rectangle
      // unless the segmentation model returns actual subject pixels.
      const silhouetteX = clamp(fx - fw * 1.10);
      const silhouetteY = clamp(fy - fh * 0.32);
      const silhouetteW = Math.min(1 - silhouetteX, fw * 3.20);
      const silhouetteH = Math.min(1 - silhouetteY, fh * 9.00);
      const targetSilhouetteBbox: [number, number, number, number] = [silhouetteX, silhouetteY, silhouetteW, silhouetteH];

      // Normalize facial landmarks (5 points)
      const normLandmarks: [number, number][] = (d.landmarks || []).map(([lx, ly]) => [
        Math.max(0, Math.min(1, lx / imgWidth)),
        Math.max(0, Math.min(1, ly / imgHeight)),
      ]);

      // Check subject match
      const rankedSubjects = [...(d.subjects || [])].sort((a, b) => b.similarity - a.similarity);
      const topSubject = rankedSubjects[0] || null;
      // Similarity scores from face APIs can be optimistic for tiny, blurry,
      // or profile-view faces. Require a high absolute score and a clear lead.
      const isRecognized = this.isReliableMatch(d, matchThreshold);
      const isRecognizedAnimal = Boolean(
        isRecognized && topSubject && animalNames.some((name) => name.toLowerCase() === topSubject.subject.toLowerCase())
      );
      const category = isRecognizedAnimal ? 'animal' : 'person';

      let subjectName = '';
      let label = '';
      let nameTag = '';

      if (isRecognized && topSubject) {
        subjectName = topSubject.subject;
        const pct = Math.round(topSubject.similarity * 100);
        label = `${topSubject.subject.toUpperCase()} (${pct}%)`;
        nameTag = topSubject.subject;
      } else {
        const genderStr = d.gender?.value ? d.gender.value.toUpperCase() : 'PERSON';
        const ageEst = d.age ? `~${Math.round((d.age.low + d.age.high) / 2)}y` : '';
        label = `UNKNOWN ${genderStr} ${ageEst}`.trim();
        nameTag = label;
      }

      // Find closest existing tracked person using centroid distance
      const centerTargetX = targetX + targetW / 2;
      const centerTargetY = targetY + targetH / 2;

      let bestMatch: DetectionObject | null = null;
      let bestAssociationCost = Number.POSITIVE_INFINITY;

      for (const p of existingPersons) {
        if (matchedPersonIds.has(p.id)) continue;
        const [px, py, pw, ph] = p.targetBbox || p.bbox;
        const centerX = px + pw / 2;
        const centerY = py + ph / 2;
        const dist = Math.hypot(centerTargetX - centerX, centerTargetY - centerY);
        const overlapW = Math.max(0, Math.min(targetX + targetW, px + pw) - Math.max(targetX, px));
        const overlapH = Math.max(0, Math.min(targetY + targetH, py + ph) - Math.max(targetY, py));
        const intersection = overlapW * overlapH;
        const union = targetW * targetH + pw * ph - intersection;
        const overlap = union > 0 ? intersection / union : 0;
        const maxDistance = Math.max(0.10, Math.min(0.20, Math.hypot(Math.max(targetW, pw), Math.max(targetH, ph)) * 1.8));
        const sameKnownIdentity = Boolean(
          isRecognized && subjectName && p.isKnown &&
          p.subjectName?.toLowerCase() === subjectName.toLowerCase()
        );
        if (overlap < 0.02 && dist > (sameKnownIdentity ? maxDistance * 1.5 : maxDistance)) continue;
        const associationCost = (dist / maxDistance) * 0.65 + (1 - overlap) * 0.35 - (sameKnownIdentity ? 0.25 : 0);
        if (associationCost < bestAssociationCost) {
          bestAssociationCost = associationCost;
          bestMatch = p;
        }
      }

      if (bestMatch) {
        // Update existing tracked person
        matchedPersonIds.add(bestMatch.id);
        const previousTarget = bestMatch.targetBbox || bestMatch.bbox;
        const sameKnownIdentity = isRecognized && bestMatch.isKnown && bestMatch.subjectName === subjectName;
        const measurementWeight = sameKnownIdentity ? 0.68 : 0.55;
        bestMatch.targetBbox = targetBbox.map((value, index) =>
          previousTarget[index] * (1 - measurementWeight) + value * measurementWeight
        ) as [number, number, number, number];
        const previousSilhouetteTarget = bestMatch.targetSilhouetteBbox || bestMatch.silhouetteBbox || targetSilhouetteBbox;
        bestMatch.targetSilhouetteBbox = targetSilhouetteBbox.map((value, index) =>
          previousSilhouetteTarget[index] * (1 - measurementWeight) + value * measurementWeight
        ) as [number, number, number, number];
        bestMatch.motionVector = [0, 0];
        bestMatch.label = label;
        bestMatch.nameTag = nameTag;
        bestMatch.category = category;
        bestMatch.isKnown = isRecognized;
        bestMatch.subjectName = subjectName || bestMatch.subjectName;
        bestMatch.confidence = topSubject ? topSubject.similarity : d.box.probability;
        bestMatch.age = d.age;
        bestMatch.gender = d.gender;
        bestMatch.pose = d.pose;
        bestMatch.landmarks = normLandmarks;
        bestMatch.lastSeenTime = now;
      } else {
        // Spawn newly identified tracked person
        const newId = `${category}-cf-${now}-${detIdx}`;
        matchedPersonIds.add(newId);
        existingPersons.push({
          id: newId,
          label,
          nameTag,
          category,
          confidence: topSubject ? topSubject.similarity : d.box.probability,
          bbox: targetBbox,
          targetBbox,
          silhouetteBbox: targetSilhouetteBbox,
          targetSilhouetteBbox,
          threatLevel: isRecognized ? 'none' : 'warning',
          motionVector: [0, 0],
          distanceMeters: Number((1.8 + Math.random() * 0.8).toFixed(1)),
          speedMph: 0.0,
          isKnown: isRecognized,
          subjectName,
          age: d.age,
          gender: d.gender,
          pose: d.pose,
          landmarks: normLandmarks,
          similarity: topSubject?.similarity,
          lastSeenTime: now,
          silhouetteColor: isRecognized ? '#3b82f6' : '#ef4444',
        });
      }
    });

    // Keep briefly through missed frames, then drop immediately once the retention window expires.
    const activePersons = existingPersons.filter((p) => {
      if (matchedPersonIds.has(p.id)) return true;
      return typeof p.lastSeenTime === 'number' && now - p.lastSeenTime < PERSON_TRACK_RETENTION_MS;
    });

    return [...nonPersonObjects, ...activePersons];
  }

  /**
   * Correlates real detected objects (laptops, phones, cups, pets, vehicles, etc.)
   * from the vision detector with current objects without disturbing tracked people.
   */
  correlateObjectDetections(
    currentObjects: DetectionObject[],
    newObjects: DetectionObject[]
  ): DetectionObject[] {
    const now = Date.now();
    const persons = currentObjects.filter((o) => o.category === 'person');
    const existingItems = currentObjects.filter((o) => o.category !== 'person');

    const matchedIds = new Set<string>();
    const updatedItems = [...existingItems];

    newObjects.forEach((fresh) => {
      const [fx, fy, fw, fh] = fresh.bbox;
      const fcx = fx + fw / 2;
      const fcy = fy + fh / 2;

      let bestMatch: DetectionObject | null = null;
      let minDistance = 0.3;

      for (const item of updatedItems) {
        if (matchedIds.has(item.id)) continue;
        if (item.category !== fresh.category) continue;

        const [ix, iy, iw, ih] = item.bbox;
        const icx = ix + iw / 2;
        const icy = iy + ih / 2;
        const dist = Math.hypot(fcx - icx, fcy - icy);
        const intersectionW = Math.max(0, Math.min(fx + fw, ix + iw) - Math.max(fx, ix));
        const intersectionH = Math.max(0, Math.min(fy + fh, iy + ih) - Math.max(fy, iy));
        const intersection = intersectionW * intersectionH;
        const union = fw * fh + iw * ih - intersection;
        const overlap = union > 0 ? intersection / union : 0;
        // Prefer overlap; allow modest label variation (e.g. "Dog" to "Golden Retriever")
        // when the box remains spatially consistent.
        if (overlap >= 0.15 || (dist < minDistance && item.label.toLowerCase() === fresh.label.toLowerCase())) {
          minDistance = dist;
          bestMatch = item;
        }
      }

      if (bestMatch) {
        matchedIds.add(bestMatch.id);
        const [px, py] = bestMatch.bbox;
        bestMatch.targetBbox = fresh.bbox;
        bestMatch.motionVector = [(fx - px) * 0.3, (fy - py) * 0.3];
        bestMatch.label = fresh.label;
        bestMatch.nameTag = fresh.nameTag || fresh.label;
        bestMatch.confidence = fresh.confidence;
        bestMatch.distanceMeters = fresh.distanceMeters;
        bestMatch.lastSeenTime = now;
      } else {
        matchedIds.add(fresh.id);
        updatedItems.push({ ...fresh, lastSeenTime: fresh.lastSeenTime || now });
      }
    });

    // Keep objects seen within last 4000ms
    const activeItems = updatedItems.filter((it) => {
      if (matchedIds.has(it.id)) return true;
      return it.lastSeenTime && now - it.lastSeenTime < 4000;
    });

    return [...persons, ...activeItems];
  }

  /**
   * 60 FPS physics interpolation loop: smoothly moves bounding boxes and reticles
   * towards their detected targets, locking and following the person without jitter.
   * NO simulated ambient drift!
   */
  stepPhysicsTracking(objects: DetectionObject[]): DetectionObject[] {
    const now = performance.now();
    return objects
      .filter((obj) => obj.category !== 'person' || (typeof obj.lastSeenTime === 'number' && Date.now() - obj.lastSeenTime < PERSON_TRACK_RETENTION_MS))
      .map((obj) => {
      if (!obj.targetBbox) return obj;

      const [curX, curY, curW, curH] = obj.bbox;
      const [tgtX, tgtY, tgtW, tgtH] = obj.targetBbox;
      const deltaMs = obj.lastPhysicsTime ? Math.max(0, Math.min(100, now - obj.lastPhysicsTime)) : 16.67;
      const smoothing = 1 - Math.exp(-deltaMs / 85);
      const newX = curX + (tgtX - curX) * smoothing;
      const newY = curY + (tgtY - curY) * smoothing;
      const newW = curW + (tgtW - curW) * smoothing;
      const newH = curH + (tgtH - curH) * smoothing;

      const silhouetteBbox = obj.silhouetteBbox && obj.targetSilhouetteBbox
        ? obj.silhouetteBbox.map((value, index) =>
            value + (obj.targetSilhouetteBbox![index] - value) * smoothing
          ) as [number, number, number, number]
        : obj.silhouetteBbox;

      return {
        ...obj,
        bbox: [newX, newY, newW, newH],
        silhouetteBbox,
        motionVector: [0, 0],
        lastPhysicsTime: now,
      };
    });
  }
}

export const faceRecognitionService = FaceRecognitionService.getInstance();
