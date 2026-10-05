import { CompreFaceDetection } from '../types';

/** A browser-native second opinion for CompreFace detections. */
export interface FrontendFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrontendFaceDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox: FrontendFaceBox }>>;
}

export function boxOverlap(a: CompreFaceDetection['box'], b: FrontendFaceBox, frameWidth: number, frameHeight: number): number {
  const left = Math.max(a.x_min, b.x);
  const top = Math.max(a.y_min, b.y);
  const right = Math.min(a.x_max, b.x + b.width);
  const bottom = Math.min(a.y_max, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const areaA = Math.max(0, a.x_max - a.x_min) * Math.max(0, a.y_max - a.y_min);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const union = areaA + areaB - intersection;
  if (union <= 0 || frameWidth <= 0 || frameHeight <= 0) return 0;
  return intersection / union;
}

/**
 * The native FaceDetector is a detector, not an identity database. It is used
 * as a browser-side corroborating inference pass: CompreFace still receives
 * every frame and remains authoritative for the subject name, while a box
 * that only CompreFace sees is treated as a likely false positive when the
 * browser has its own face result for this frame.
 */
export function frontendFaceSupportsDetection(
  detection: CompreFaceDetection,
  frontendFaces: FrontendFaceBox[],
  frameWidth: number,
  frameHeight: number,
): boolean {
  return frontendFaces.some((face) => {
    const overlap = boxOverlap(detection.box, face, frameWidth, frameHeight);
    if (overlap >= 0.08) return true;
    const detectorCenterX = face.x + face.width / 2;
    const detectorCenterY = face.y + face.height / 2;
    const detectionCenterX = (detection.box.x_min + detection.box.x_max) / 2;
    const detectionCenterY = (detection.box.y_min + detection.box.y_max) / 2;
    const scale = Math.max(24, Math.min(face.width, face.height, detection.box.x_max - detection.box.x_min, detection.box.y_max - detection.box.y_min));
    return Math.hypot(detectorCenterX - detectionCenterX, detectorCenterY - detectionCenterY) <= scale * 1.25;
  });
}

function browserFaceDetector(): FrontendFaceDetectorLike | null {
  if (typeof window === 'undefined') return null;
  const Candidate = (window as unknown as { FaceDetector?: new (options?: unknown) => FrontendFaceDetectorLike }).FaceDetector;
  if (typeof Candidate !== 'function') return null;
  try {
    return new Candidate({ fastMode: false, maxDetectedFaces: 20 });
  } catch {
    return null;
  }
}

class FrontendFaceVerifier {
  private detector: FrontendFaceDetectorLike | null | undefined;
  private unavailable = false;

  async verify(frame: HTMLCanvasElement, detections: CompreFaceDetection[]): Promise<CompreFaceDetection[]> {
    if (!detections.length || this.unavailable) return detections;
    if (this.detector === undefined) this.detector = browserFaceDetector();
    if (!this.detector) {
      this.unavailable = true;
      return detections;
    }

    try {
      const frontendFaces = (await this.detector.detect(frame))
        .map((face) => face?.boundingBox)
        .filter((box): box is FrontendFaceBox => Boolean(box && box.width > 0 && box.height > 0));
      // Fail open when the browser detector cannot see a face. This matters
      // for tiny/dark faces and ensures the second model never suppresses a
      // valid CompreFace result merely because its own model is weaker.
      if (!frontendFaces.length) return detections;
      return detections.filter((detection) => frontendFaceSupportsDetection(
        detection,
        frontendFaces,
        frame.width,
        frame.height,
      ));
    } catch {
      // Browser FaceDetector is still experimental and may reject canvas
      // inputs on some devices. CompreFace remains fully functional there.
      return detections;
    }
  }
}

export const frontendFaceVerifier = new FrontendFaceVerifier();
