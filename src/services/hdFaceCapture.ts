import type { CompreFaceBox } from '../types';

/**
 * Face recognition should receive real camera pixels, not the 640px display
 * thumbnail. 1920px is Full HD and is a useful upper bound for a low-CPU
 * browser pipeline; cameras that are 4K or larger are sampled down only to
 * this size, never enlarged before recognition.
 */
export const HD_FACE_MAX_WIDTH = 1920;
export const HD_FACE_MAX_HEIGHT = 1080;
export const HD_FACE_REFERENCE_MAX_EDGE = 1024;
export const MIN_SHARP_FACE_EDGE = 64;
// This is intentionally a low floor: webcams differ in exposure, but a
// completely defocused crop has almost no local edge variance at all.
export const MIN_FACE_REFERENCE_SHARPNESS = 6;

export interface NativeHdFrame {
  canvas: HTMLCanvasElement;
  imageBase64: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  sharpness: number;
}

export interface HdFaceReference {
  imageBase64: string;
  width: number;
  height: number;
  sourceFaceWidth: number;
  sourceFaceHeight: number;
  sharpness: number;
}

export interface FaceReferenceOptions {
  maxEdge?: number;
  quality?: number;
  paddingX?: number;
  paddingY?: number;
  minimumFaceEdge?: number;
  minimumSharpness?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Keeps the camera's aspect ratio while applying an HD ceiling. */
export function getHdFrameDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = HD_FACE_MAX_WIDTH,
  maxHeight = HD_FACE_MAX_HEIGHT,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(sourceWidth));
  const safeHeight = Math.max(1, Math.round(sourceHeight));
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

/**
 * A small, deterministic edge-variance score. It is intentionally calculated
 * on a downsampled image so the five-frame enrollment burst does not consume
 * a full CPU core on an inexpensive machine.
 */
export function calculateSharpnessFromGrayscale(
  grayscale: Uint8Array,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3 || grayscale.length < width * height) return 0;
  let sum = 0;
  let sumSquared = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian =
        grayscale[index - width] +
        grayscale[index - 1] +
        grayscale[index + 1] +
        grayscale[index + width] -
        grayscale[index] * 4;
      sum += laplacian;
      sumSquared += laplacian * laplacian;
      count += 1;
    }
  }

  if (!count) return 0;
  const mean = sum / count;
  return Math.max(0, sumSquared / count - mean * mean);
}

/** Scores a canvas using at most a 320px-wide sample. */
export function calculateCanvasSharpness(canvas: HTMLCanvasElement): number {
  try {
    const sampleWidth = Math.min(320, Math.max(3, canvas.width));
    const sampleHeight = Math.max(3, Math.round(canvas.height * sampleWidth / Math.max(1, canvas.width)));
    const sample = document.createElement('canvas');
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'medium';
    context.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const grayscale = new Uint8Array(sampleWidth * sampleHeight);
    for (let index = 0; index < grayscale.length; index += 1) {
      const offset = index * 4;
      grayscale[index] = Math.round(
        pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114,
      );
    }
    return calculateSharpnessFromGrayscale(grayscale, sampleWidth, sampleHeight);
  } catch {
    return 0;
  }
}

/** Captures one frame at native camera detail, capped at Full HD. */
export function captureNativeHdFrame(
  video: HTMLVideoElement,
  maxWidth = HD_FACE_MAX_WIDTH,
  quality = 0.94,
): NativeHdFrame | null {
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  const dimensions = getHdFrameDimensions(video.videoWidth, video.videoHeight, maxWidth, HD_FACE_MAX_HEIGHT);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(video, 0, 0, dimensions.width, dimensions.height);

  return {
    canvas,
    imageBase64: canvas.toDataURL('image/jpeg', quality),
    width: dimensions.width,
    height: dimensions.height,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    sharpness: calculateCanvasSharpness(canvas),
  };
}

function waitForNextCameraFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 50);
    }
  });
}

/**
 * Captures a short native-resolution burst and keeps the sharpest frame. This
 * is used for enrollment and manual retakes, not for every live recognition
 * tick, so it improves reference quality without adding continuous CPU load.
 */
export async function captureSharpNativeFrame(
  video: HTMLVideoElement,
  attempts = 5,
  maxWidth = HD_FACE_MAX_WIDTH,
): Promise<NativeHdFrame | null> {
  let best: NativeHdFrame | null = null;
  const frameCount = Math.max(1, Math.min(7, Math.round(attempts)));
  for (let index = 0; index < frameCount; index += 1) {
    const frame = captureNativeHdFrame(video, maxWidth, 0.96);
    if (frame && (!best || frame.sharpness > best.sharpness)) best = frame;
    if (index < frameCount - 1) await waitForNextCameraFrame();
  }
  return best;
}

/**
 * Crops a CompreFace face box from a native/HD frame without stretching the
 * face. The crop is kept proportional, mildly enhanced, and exported with a
 * 1024px long edge for a high-resolution enrollment reference.
 */
export function createHdFaceReference(
  sourceCanvas: HTMLCanvasElement,
  box: CompreFaceBox,
  options: FaceReferenceOptions = {},
): HdFaceReference | null {
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const faceWidth = box.x_max - box.x_min;
  const faceHeight = box.y_max - box.y_min;
  const minimumFaceEdge = options.minimumFaceEdge ?? MIN_SHARP_FACE_EDGE;
  if (sourceWidth <= 0 || sourceHeight <= 0 || faceWidth < minimumFaceEdge || faceHeight < minimumFaceEdge) return null;

  const paddingX = options.paddingX ?? 0.30;
  const paddingY = options.paddingY ?? 0.38;
  const left = clamp(box.x_min - faceWidth * paddingX, 0, sourceWidth - 1);
  const top = clamp(box.y_min - faceHeight * paddingY, 0, sourceHeight - 1);
  const right = clamp(box.x_max + faceWidth * paddingX, left + 1, sourceWidth);
  const bottom = clamp(box.y_max + faceHeight * paddingY, top + 1, sourceHeight);
  const cropWidth = Math.max(1, Math.round(right - left));
  const cropHeight = Math.max(1, Math.round(bottom - top));
  const maxEdge = options.maxEdge ?? HD_FACE_REFERENCE_MAX_EDGE;
  // Normalize every accepted crop to a 1024px-long-edge reference. This is a
  // deliberate final enrollment upscale; recognition itself still uses the
  // native HD frame, so the reference never pretends interpolation recovered
  // detail that the camera did not capture.
  const scale = maxEdge / Math.max(cropWidth, cropHeight);
  const outputWidth = Math.max(1, Math.round(cropWidth * scale));
  const outputHeight = Math.max(1, Math.round(cropHeight * scale));

  const crop = document.createElement('canvas');
  crop.width = outputWidth;
  crop.height = outputHeight;
  const context = crop.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // A restrained contrast lift helps an otherwise good webcam frame without
  // inventing facial detail or hiding a genuinely out-of-focus capture.
  context.filter = 'contrast(1.06) brightness(1.02)';
  context.drawImage(sourceCanvas, left, top, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
  context.filter = 'none';
  const sharpness = calculateCanvasSharpness(crop);
  if (sharpness > 0 && sharpness < (options.minimumSharpness ?? MIN_FACE_REFERENCE_SHARPNESS)) return null;

  return {
    imageBase64: crop.toDataURL('image/jpeg', options.quality ?? 0.96),
    width: outputWidth,
    height: outputHeight,
    sourceFaceWidth: faceWidth,
    sourceFaceHeight: faceHeight,
    sharpness,
  };
}

function loadImage(imageBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The HD face reference could not be decoded.'));
    image.src = imageBase64;
  });
}

/**
 * One clear photo is expanded into a few conservative enrollment references.
 * They are all derived from the same native capture; no fake detail is added.
 */
export async function createEnrollmentVariants(imageBase64: string): Promise<string[]> {
  try {
    const image = await loadImage(imageBase64);
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const variants: string[] = [imageBase64];

    const mirror = document.createElement('canvas');
    mirror.width = width;
    mirror.height = height;
    const mirrorContext = mirror.getContext('2d');
    if (mirrorContext) {
      mirrorContext.translate(width, 0);
      mirrorContext.scale(-1, 1);
      mirrorContext.imageSmoothingEnabled = true;
      mirrorContext.imageSmoothingQuality = 'high';
      mirrorContext.drawImage(image, 0, 0, width, height);
      variants.push(mirror.toDataURL('image/jpeg', 0.96));
    }

    const tight = document.createElement('canvas');
    const insetX = Math.round(width * 0.06);
    const insetY = Math.round(height * 0.06);
    tight.width = Math.max(1, width - insetX * 2);
    tight.height = Math.max(1, height - insetY * 2);
    const tightContext = tight.getContext('2d');
    if (tightContext && tight.width > 32 && tight.height > 32) {
      tightContext.imageSmoothingEnabled = true;
      tightContext.imageSmoothingQuality = 'high';
      tightContext.filter = 'contrast(1.04) brightness(1.01)';
      tightContext.drawImage(image, insetX, insetY, tight.width, tight.height, 0, 0, tight.width, tight.height);
      tightContext.filter = 'none';
      variants.push(tight.toDataURL('image/jpeg', 0.96));
    }

    return [...new Set(variants)];
  } catch {
    return [imageBase64];
  }
}
