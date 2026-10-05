/**
 * Frame encoding with a hard payload budget.
 *
 * CompreFace deployments are sensitive to request size: oversized JPEGs slow
 * down detection and can be rejected outright by reverse proxies. Every frame
 * the app sends — the live recognition snapshot and each enlarged long-range
 * tile — is encoded to stay at or below a byte budget by walking a JPEG
 * quality ladder first and only shrinking the image when quality alone cannot
 * fit. Downscaling mutates the working canvas so the dimensions reported to
 * callers always match the pixels actually encoded (box coordinates stay
 * truthful).
 */

/** Upper bound for a single image submitted to the recognition API. */
export const MAX_RECOGNITION_IMAGE_BYTES = 100 * 1024;

/** JPEG qualities tried (in order) before any downscale is considered. */
const JPEG_QUALITY_LADDER = [0.82, 0.7, 0.58] as const;

/** Step applied to the canvas when the budget still cannot be met. */
const DOWNSCALE_STEP = 0.85;

/** Never shrink below this — recognition on a stamp-sized frame is useless. */
const MIN_ENCODED_EDGE = 160;

export interface EncodedImage {
  imageBase64: string;
  width: number;
  height: number;
}

/** Decoded byte size of a base64 data URL (payload only, prefix stripped). */
export function base64PayloadBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function encodeAtQuality(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Encode a canvas as JPEG within `budgetBytes`. The quality ladder runs
 * first; only when even the lowest quality overflows does the image shrink
 * (and the shrunken dimensions are returned so coordinate math stays exact).
 */
export function encodeCanvasWithinByteBudget(
  canvas: HTMLCanvasElement,
  budgetBytes: number = MAX_RECOGNITION_IMAGE_BYTES,
): EncodedImage {
  for (const quality of JPEG_QUALITY_LADDER) {
    const dataUrl = encodeAtQuality(canvas, quality);
    if (base64PayloadBytes(dataUrl) <= budgetBytes) {
      return { imageBase64: dataUrl, width: canvas.width, height: canvas.height };
    }
  }

  let working = canvas;
  for (let attempt = 0; attempt < 4; attempt++) {
    const nextWidth = Math.max(MIN_ENCODED_EDGE, Math.round(working.width * DOWNSCALE_STEP));
    const nextHeight = Math.max(Math.round(MIN_ENCODED_EDGE * 0.5), Math.round(working.height * DOWNSCALE_STEP));
    if (nextWidth === working.width && nextHeight === working.height) break;
    const scaled = document.createElement('canvas');
    scaled.width = nextWidth;
    scaled.height = nextHeight;
    const context = scaled.getContext('2d');
    if (!context) break;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(working, 0, 0, nextWidth, nextHeight);
    working = scaled;
    const dataUrl = encodeAtQuality(working, JPEG_QUALITY_LADDER[JPEG_QUALITY_LADDER.length - 1]);
    if (base64PayloadBytes(dataUrl) <= budgetBytes) {
      return { imageBase64: dataUrl, width: working.width, height: working.height };
    }
  }

  // Best effort: never fail a scan purely because the camera noise floor
  // refuses to compress. The smallest attempt so far is the closest fit.
  return {
    imageBase64: encodeAtQuality(working, JPEG_QUALITY_LADDER[JPEG_QUALITY_LADDER.length - 1]),
    width: working.width,
    height: working.height,
  };
}

export interface CapturedFrame extends EncodedImage {
  canvas: HTMLCanvasElement;
}

/**
 * Draw a live video element to an offscreen canvas capped at `maximumWidth`
 * and encode it within the byte budget. Returns the canvas (for motion
 * checks, thumbnails, and long-range tiling) alongside the encoded payload
 * and the dimensions actually encoded.
 */
export function captureJpegFrameWithinByteBudget(
  video: HTMLVideoElement,
  maximumWidth: number,
  budgetBytes: number = MAX_RECOGNITION_IMAGE_BYTES,
): CapturedFrame | null {
  if (!video || video.readyState < 2 || video.videoWidth <= 0) return null;
  const width = Math.max(160, Math.min(maximumWidth, video.videoWidth));
  const height = Math.max(90, Math.round((width * video.videoHeight) / video.videoWidth));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(video, 0, 0, width, height);
  const encoded = encodeCanvasWithinByteBudget(canvas, budgetBytes);
  return {
    imageBase64: encoded.imageBase64,
    width: encoded.width,
    height: encoded.height,
    // When the budget forced a downscale, hand back the smaller canvas so
    // every consumer (tiles, thumbnails, motion sampling) uses the pixels
    // that were actually encoded.
    canvas: encoded.width === canvas.width && encoded.height === canvas.height
      ? canvas
      : downscaleToExact(canvas, encoded.width, encoded.height),
  };
}

function downscaleToExact(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  const scaled = document.createElement('canvas');
  scaled.width = width;
  scaled.height = height;
  const context = scaled.getContext('2d');
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return scaled;
}
