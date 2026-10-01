export type SubjectMaskCategory = 'person' | 'animal';

export interface SubjectMask {
  width: number;
  height: number;
  /** Binary alpha copied directly from the segmentation model. */
  alpha: Uint8Array;
  category: SubjectMaskCategory;
  edgePrecision: number;
  updatedAt: number;
}

export interface SubjectMaskAnchor {
  /** Normalized to the submitted crop. */
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SegmentationMaskLike {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface SegmentationCandidate {
  label: string | null;
  score: number | null;
  mask: SegmentationMaskLike;
}

interface SubjectMaskRequest {
  id: string;
  category: SubjectMaskCategory;
  crop: HTMLCanvasElement;
  anchor: SubjectMaskAnchor;
  edgePrecision: number;
}

const PERSON_LABELS = new Set(['person']);
const ANIMAL_LABELS = new Set([
  'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe',
]);
const MASK_MAX_AGE_MS = 1800;
const MIN_REQUEST_INTERVAL_MS = 700;
const FAILED_RETRY_DELAY_MS = 60_000;
const MODEL_ID = 'Xenova/detr-resnet-50-panoptic';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isExpectedLabel(category: SubjectMaskCategory, label: string | null) {
  const normalized = label?.trim().toLowerCase() || '';
  return category === 'person' ? PERSON_LABELS.has(normalized) : ANIMAL_LABELS.has(normalized);
}

/**
 * Select one semantic/instance mask that belongs to the detector target. The
 * returned alpha is made only from model-owned pixels: it never invents a box,
 * oval, flood-fill, blur, or other geometric substitute.
 */
export function selectSubjectMask(
  candidates: SegmentationCandidate[],
  category: SubjectMaskCategory,
  anchor: SubjectMaskAnchor,
): Omit<SubjectMask, 'category' | 'edgePrecision' | 'updatedAt'> | null {
  let selected: { alpha: Uint8Array; width: number; height: number; score: number } | null = null;

  for (const candidate of candidates) {
    if (!isExpectedLabel(category, candidate.label)) continue;
    if (!Number.isFinite(candidate.score) || (candidate.score as number) < 0.58) continue;

    const { width, height, channels, data } = candidate.mask;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || channels < 1) continue;
    if (data.length < width * height * channels) continue;

    const alpha = new Uint8Array(width * height);
    let subjectPixels = 0;
    let pixelsInAnchor = 0;
    const anchorLeft = Math.floor(clamp(anchor.x, 0, 1) * width);
    const anchorTop = Math.floor(clamp(anchor.y, 0, 1) * height);
    const anchorRight = Math.ceil(clamp(anchor.x + anchor.width, 0, 1) * width);
    const anchorBottom = Math.ceil(clamp(anchor.y + anchor.height, 0, 1) * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        // Panoptic masks are binary. Use a strict threshold in case a model
        // provides a grayscale confidence mask instead.
        if (data[index * channels] < 192) continue;
        alpha[index] = 255;
        subjectPixels++;
        if (x >= anchorLeft && x < anchorRight && y >= anchorTop && y < anchorBottom) {
          pixelsInAnchor++;
        }
      }
    }

    const maskRatio = subjectPixels / (width * height);
    // A nearly complete crop is usually a panoptic "background" error or an
    // ambiguous close-up. Refusing it is safer than tinting the surroundings.
    if (maskRatio < 0.003 || maskRatio > 0.84) continue;

    const anchorArea = Math.max(1, (anchorRight - anchorLeft) * (anchorBottom - anchorTop));
    const anchorCoverage = pixelsInAnchor / anchorArea;
    const maskOverlap = pixelsInAnchor / subjectPixels;

    // People are keyed from a face-sized anchor, while animal detections have
    // a body-sized anchor. Both must meaningfully intersect the actual model
    // segment before we draw anything.
    const minimumAnchorCoverage = category === 'person' ? 0.025 : 0.12;
    const minimumMaskOverlap = category === 'person' ? 0.006 : 0.12;
    if (anchorCoverage < minimumAnchorCoverage || maskOverlap < minimumMaskOverlap) continue;

    const confidence = candidate.score as number;
    const matchScore = confidence * 0.55 + Math.min(1, anchorCoverage * 2) * 0.3 + Math.min(1, maskOverlap * 2) * 0.15;
    if (!selected || matchScore > selected.score) selected = { alpha, width, height, score: matchScore };
  }

  if (!selected) return null;
  return { width: selected.width, height: selected.height, alpha: selected.alpha };
}

/**
 * A lazy, on-device semantic segmentation queue. It intentionally has no
 * image-processing fallback: until the model identifies the target pixels, the
 * live frame remains untouched.
 */
export class SubjectSegmenter {
  private segmenterPromise: Promise<any> | null = null;
  private activeRequest = false;
  private masks = new Map<string, SubjectMask>();
  private lastRequestedAt = new Map<string, number>();
  private lastRequestedPrecision = new Map<string, number>();
  private failedAt = 0;

  getMask(id: string, edgePrecision: number): SubjectMask | null {
    const mask = this.masks.get(id);
    if (!mask) return null;
    if (mask.edgePrecision !== edgePrecision || Date.now() - mask.updatedAt > MASK_MAX_AGE_MS) return null;
    return mask;
  }

  canRequest(id: string, edgePrecision: number): boolean {
    const now = Date.now();
    const lastRequest = this.lastRequestedAt.get(id) || 0;
    const lastPrecision = this.lastRequestedPrecision.get(id);
    if (this.activeRequest || now - this.failedAt < FAILED_RETRY_DELAY_MS) return false;
    return lastPrecision !== edgePrecision || now - lastRequest >= MIN_REQUEST_INTERVAL_MS;
  }

  /** Returns true only when this request was accepted into the single inference slot. */
  request(request: SubjectMaskRequest): boolean {
    if (!this.canRequest(request.id, request.edgePrecision)) return false;
    const now = Date.now();

    this.activeRequest = true;
    this.lastRequestedAt.set(request.id, now);
    this.lastRequestedPrecision.set(request.id, request.edgePrecision);

    void this.segment(request)
      .catch((error) => {
        // A blocked model download, unavailable WebAssembly backend, or a
        // tainted camera frame must never result in a geometric overlay.
        console.warn('Subject segmentation is unavailable; leaving the live frame unchanged.', error);
        this.failedAt = Date.now();
      })
      .finally(() => {
        this.activeRequest = false;
      });
    return true;
  }

  prune(activeIds: Set<string>) {
    const now = Date.now();
    for (const [id, mask] of this.masks) {
      if (!activeIds.has(id) || now - mask.updatedAt > MASK_MAX_AGE_MS * 3) this.masks.delete(id);
    }
    for (const [id, requestedAt] of this.lastRequestedAt) {
      if (!activeIds.has(id) || now - requestedAt > MASK_MAX_AGE_MS * 3) {
        this.lastRequestedAt.delete(id);
        this.lastRequestedPrecision.delete(id);
      }
    }
  }

  private async getSegmenter(): Promise<any> {
    if (!this.segmenterPromise) {
      this.segmenterPromise = import('@huggingface/transformers')
        .then(({ pipeline }) => pipeline('image-segmentation', MODEL_ID, {
          // Quantized WASM keeps the live camera renderer usable on systems
          // without WebGPU. The model is downloaded and browser-cached only
          // after the silhouette setting is enabled.
          device: 'wasm',
          dtype: 'q8',
        }))
        .catch((error) => {
          this.segmenterPromise = null;
          throw error;
        });
    }
    return this.segmenterPromise;
  }

  private async segment(request: SubjectMaskRequest) {
    const segmenter = await this.getSegmenter();
    const precision = clamp(Math.round(request.edgePrecision), 1, 5);
    const candidates = await segmenter(request.crop, {
      // The model decides subject pixels. Precision adjusts its internal mask
      // cutoff only; it never grows a mask outside the model segment.
      threshold: 0.58,
      mask_threshold: 0.38 + precision * 0.05,
      overlap_mask_area_threshold: 0.85,
      subtask: 'panoptic',
    }) as SegmentationCandidate[];
    const result = selectSubjectMask(candidates, request.category, request.anchor);
    if (!result) {
      this.masks.delete(request.id);
      return;
    }
    this.masks.set(request.id, {
      ...result,
      category: request.category,
      edgePrecision: request.edgePrecision,
      updatedAt: Date.now(),
    });
  }
}
