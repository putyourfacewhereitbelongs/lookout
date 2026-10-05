import { CompreFaceBox } from '../types';

export interface FaceThumbnailOptions {
  /** Detection box in recognition-frame coordinates. */
  box: Pick<CompreFaceBox, 'x_min' | 'x_max' | 'y_min' | 'y_max'>;
  /** Width/height of the recognition frame the box came from. */
  frameWidth: number;
  frameHeight: number;
  /** Native camera element, preferred for sharpness when available. */
  video?: HTMLVideoElement | null;
  /** Fallback source when the native video is unavailable. */
  fallback?: HTMLCanvasElement | null;
  /** Square output edge in pixels. */
  outputSize?: number;
  /** JPEG quality. */
  quality?: number;
  /** Extra margin around the detected face, as a fraction of its size. */
  padding?: number;
}

/**
 * Crop a square, padded face thumbnail from the sharpest available source.
 *
 * Recognition runs on a compact frame, so the box is mapped back onto the
 * camera's native pixels before the crop is scaled to a consistent square. That
 * keeps notification avatars and saved profile photos crisp instead of soft and
 * stretched.
 */
export function createFaceThumbnail(options: FaceThumbnailOptions): string | undefined {
  const { box, frameWidth, frameHeight, video, fallback } = options;
  if (!box || frameWidth <= 0 || frameHeight <= 0) return undefined;

  const outputSize = options.outputSize ?? 1024;
  const padding = options.padding ?? 0.28;
  const faceWidth = box.x_max - box.x_min;
  const faceHeight = box.y_max - box.y_min;
  if (faceWidth <= 0 || faceHeight <= 0) return undefined;

  const squareSize = Math.max(faceWidth + faceWidth * padding * 2, faceHeight + faceHeight * padding * 2);
  const centerX = (box.x_min + box.x_max) / 2;
  const centerY = (box.y_min + box.y_max) / 2;
  const sx = Math.max(0, Math.min(frameWidth - squareSize, centerX - squareSize / 2));
  const sy = Math.max(0, Math.min(frameHeight - squareSize, centerY - squareSize / 2));
  const cropSize = Math.min(squareSize, frameWidth - sx, frameHeight - sy);
  if (cropSize <= 0) return undefined;

  const useVideo = video && video.videoWidth > 0 && video.readyState >= 2;
  const source: CanvasImageSource | null = useVideo ? video : fallback || null;
  if (!source) return undefined;
  const sourceWidth = useVideo ? video!.videoWidth : frameWidth;
  const sourceHeight = useVideo ? video!.videoHeight : frameHeight;
  const scaleX = sourceWidth / frameWidth;
  const scaleY = sourceHeight / frameHeight;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = outputSize;
  cropCanvas.height = outputSize;
  const context = cropCanvas.getContext('2d');
  if (!context) return undefined;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    sx * scaleX,
    sy * scaleY,
    cropSize * scaleX,
    cropSize * scaleY,
    0,
    0,
    outputSize,
    outputSize
  );
  return cropCanvas.toDataURL('image/jpeg', options.quality ?? 0.94);
}

// --- Enrollment reference-photo validation ----------------------------------
//
// CompreFace embeds whatever pixels it is given. Tiny or oddly-shaped
// reference photos — and especially tight face-only crops — produce weak
// embeddings that mismatch live frames, so enrollment is validated app-side
// before anything reaches the recognizer.

export interface EnrollmentImageCheck {
  ok: boolean;
  reason?: string;
}

/** Smallest acceptable reference-photo edge in pixels. */
export const MIN_ENROLLMENT_EDGE = 200;
/** Aspect band a usable portrait falls in (rejects strips and slivers). */
export const MIN_ENROLLMENT_ASPECT = 0.45;
export const MAX_ENROLLMENT_ASPECT = 2.2;

/**
 * Validate a reference photo before it is enrolled. Checks that the image
 * loads, is large enough to embed well, and has a sane portrait shape.
 * Head-and-shoulders framing itself cannot be verified automatically — the
 * capture side already pads album captures for exactly that reason — but
 * everything measurable is enforced here.
 */
export async function validateEnrollmentImage(imageSource: string): Promise<EnrollmentImageCheck> {
  if (!imageSource) return { ok: false, reason: 'No reference photo was provided.' };
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('image could not be decoded'));
      image.src = imageSource;
    });
    if (dimensions.width < MIN_ENROLLMENT_EDGE || dimensions.height < MIN_ENROLLMENT_EDGE) {
      return {
        ok: false,
        reason: `Reference photo is too small (${dimensions.width}×${dimensions.height}px). Use at least ${MIN_ENROLLMENT_EDGE}×${MIN_ENROLLMENT_EDGE}px.`,
      };
    }
    const aspect = dimensions.width / dimensions.height;
    if (aspect < MIN_ENROLLMENT_ASPECT || aspect > MAX_ENROLLMENT_ASPECT) {
      return {
        ok: false,
        reason: 'Reference photo has an extreme shape. Use a normal portrait photo with the full head and shoulders in frame.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Reference photo could not be read. Choose a valid image file.' };
  }
}
