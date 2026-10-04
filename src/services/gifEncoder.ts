/**
 * Dependency-free animated GIF89a encoder used to turn a short burst of live
 * camera frames into a smooth, looping alert preview.
 *
 * The encoder keeps a single global colour table built from every captured
 * frame, so the animation does not flicker or shift hue between frames the way
 * per-frame palettes do. Everything here is pure data in / data out so it can be
 * unit tested in Node without a DOM.
 */

export interface GifFrame {
  /** RGBA pixel data, width * height * 4 bytes. */
  data: Uint8ClampedArray | Uint8Array;
  /** Frame delay in milliseconds. Rounded to the GIF 10ms time base. */
  delayMs?: number;
}

export interface EncodeGifOptions {
  width: number;
  height: number;
  frames: GifFrame[];
  /** Default delay used for frames that do not carry their own. */
  delayMs?: number;
  /** 2 - 256 palette entries. Fewer colours encode faster and smaller. */
  maxColors?: number;
  /** 0 loops forever. */
  loopCount?: number;
}

interface ColorBox {
  pixels: number[]; // indices into the flat sample array
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
}

const clampColorCount = (value: number) => Math.max(2, Math.min(256, Math.floor(value)));

/** Collect a representative sample of pixels across every frame. */
function sampleColors(frames: GifFrame[], pixelCount: number, step: number): Uint8Array {
  const perFrame = Math.ceil(pixelCount / step);
  const samples = new Uint8Array(perFrame * frames.length * 3);
  let cursor = 0;
  for (const frame of frames) {
    for (let pixel = 0; pixel < pixelCount; pixel += step) {
      const offset = pixel * 4;
      samples[cursor++] = frame.data[offset];
      samples[cursor++] = frame.data[offset + 1];
      samples[cursor++] = frame.data[offset + 2];
    }
  }
  return samples.subarray(0, cursor);
}

function boxFromIndices(samples: Uint8Array, indices: number[]): ColorBox {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const index of indices) {
    const r = samples[index * 3];
    const g = samples[index * 3 + 1];
    const b = samples[index * 3 + 2];
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }
  return { pixels: indices, rMin, rMax, gMin, gMax, bMin, bMax };
}

/**
 * Median-cut palette generation. It keeps detail in the busy parts of a camera
 * frame (faces, clothing) instead of the flat background a uniform cube would
 * favour.
 */
export function buildPalette(frames: GifFrame[], pixelCount: number, maxColors: number): Uint8Array {
  const colors = clampColorCount(maxColors);
  const step = Math.max(1, Math.floor(pixelCount / 6000));
  const samples = sampleColors(frames, pixelCount, step);
  const total = Math.floor(samples.length / 3);
  if (total === 0) return new Uint8Array(colors * 3);

  let boxes: ColorBox[] = [boxFromIndices(samples, Array.from({ length: total }, (_, index) => index))];

  while (boxes.length < colors) {
    // Split the box that spans the widest colour range; stop when none can split.
    let targetIndex = -1;
    let widestRange = 0;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      if (box.pixels.length < 2) continue;
      const range = Math.max(box.rMax - box.rMin, box.gMax - box.gMin, box.bMax - box.bMin);
      if (range > widestRange) {
        widestRange = range;
        targetIndex = index;
      }
    }
    if (targetIndex < 0 || widestRange === 0) break;

    const box = boxes[targetIndex];
    const rSpan = box.rMax - box.rMin;
    const gSpan = box.gMax - box.gMin;
    const bSpan = box.bMax - box.bMin;
    const channel = rSpan >= gSpan && rSpan >= bSpan ? 0 : gSpan >= bSpan ? 1 : 2;
    const sorted = box.pixels.slice().sort((a, b) => samples[a * 3 + channel] - samples[b * 3 + channel]);
    const middle = Math.floor(sorted.length / 2);
    const lower = sorted.slice(0, middle);
    const upper = sorted.slice(middle);
    if (lower.length === 0 || upper.length === 0) break;
    boxes = [
      ...boxes.slice(0, targetIndex),
      boxFromIndices(samples, lower),
      boxFromIndices(samples, upper),
      ...boxes.slice(targetIndex + 1),
    ];
  }

  const palette = new Uint8Array(colors * 3);
  boxes.forEach((box, index) => {
    let r = 0, g = 0, b = 0;
    for (const pixel of box.pixels) {
      r += samples[pixel * 3];
      g += samples[pixel * 3 + 1];
      b += samples[pixel * 3 + 2];
    }
    const count = Math.max(1, box.pixels.length);
    palette[index * 3] = Math.round(r / count);
    palette[index * 3 + 1] = Math.round(g / count);
    palette[index * 3 + 2] = Math.round(b / count);
  });
  return palette;
}

/** Nearest-palette-entry lookup with a 15-bit colour cache. */
function createMapper(palette: Uint8Array, usedColors: number) {
  const cache = new Int16Array(32768).fill(-1);
  return (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cached = cache[key];
    if (cached >= 0) return cached;
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < usedColors; index++) {
      const dr = r - palette[index * 3];
      const dg = g - palette[index * 3 + 1];
      const db = b - palette[index * 3 + 2];
      // Weighted to human luminance sensitivity for more natural skin tones.
      const distance = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    cache[key] = best;
    return best;
  };
}

class ByteWriter {
  private bytes: number[] = [];
  byte(value: number) { this.bytes.push(value & 0xff); }
  short(value: number) { this.byte(value); this.byte(value >> 8); }
  string(value: string) { for (let i = 0; i < value.length; i++) this.byte(value.charCodeAt(i)); }
  bytes_(values: ArrayLike<number>) { for (let i = 0; i < values.length; i++) this.byte(values[i]); }
  toUint8Array() { return Uint8Array.from(this.bytes); }
}

/** GIF variable-length LZW compression, emitted as sub-blocks. */
function writeLzw(writer: ByteWriter, indices: Uint8Array, minimumCodeSize: number): void {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  // Keys pack (prefixCode << 8) | nextIndex, which keeps the hot loop numeric.
  let dictionary = new Map<number, number>();

  const block: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const flushBlock = () => {
    while (block.length > 0) {
      const chunk = block.splice(0, 255);
      writer.byte(chunk.length);
      writer.bytes_(chunk);
    }
  };

  const emit = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
      if (block.length >= 255) {
        writer.byte(255);
        writer.bytes_(block.splice(0, 255));
      }
    }
  };

  writer.byte(minimumCodeSize);
  emit(clearCode);

  let currentCode = indices[0];
  for (let index = 1; index < indices.length; index++) {
    const next = indices[index];
    const key = (currentCode << 8) | next;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      currentCode = existing;
      continue;
    }
    emit(currentCode);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
      // Decoders build their table one code behind the encoder, so the width
      // grows only once the next code no longer fits the current width.
      if (nextCode > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      // The table is full: restart it so the decoder stays in sync.
      emit(clearCode);
      dictionary = new Map<number, number>();
      nextCode = endCode + 1;
      codeSize = minimumCodeSize + 1;
    }
    currentCode = next;
  }
  if (indices.length > 0) emit(currentCode);
  emit(endCode);
  if (bitCount > 0) block.push(bitBuffer & 0xff);
  flushBlock();
  writer.byte(0); // Block terminator
}

/** Encode RGBA frames into a looping animated GIF byte stream. */
export function encodeGif(options: EncodeGifOptions): Uint8Array {
  const { width, height, frames } = options;
  if (width <= 0 || height <= 0) throw new Error('GIF dimensions must be positive.');
  if (frames.length === 0) throw new Error('At least one frame is required to encode a GIF.');

  const pixelCount = width * height;
  for (const frame of frames) {
    if (frame.data.length < pixelCount * 4) throw new Error('Frame data is smaller than width * height * 4.');
  }

  const maxColors = clampColorCount(options.maxColors ?? 128);
  const palette = buildPalette(frames, pixelCount, maxColors);
  const paletteBits = Math.max(1, Math.ceil(Math.log2(maxColors)));
  const tableSize = 1 << paletteBits;
  const globalTable = new Uint8Array(tableSize * 3);
  globalTable.set(palette.subarray(0, Math.min(palette.length, globalTable.length)));
  const map = createMapper(palette, maxColors);

  const writer = new ByteWriter();
  writer.string('GIF89a');
  writer.short(width);
  writer.short(height);
  writer.byte(0x80 | 0x70 | (paletteBits - 1)); // Global table, 8-bit colour resolution
  writer.byte(0); // Background colour index
  writer.byte(0); // Default pixel aspect ratio
  writer.bytes_(globalTable);

  // Netscape 2.0 looping extension.
  writer.byte(0x21);
  writer.byte(0xff);
  writer.byte(11);
  writer.string('NETSCAPE2.0');
  writer.byte(3);
  writer.byte(1);
  writer.short(Math.max(0, options.loopCount ?? 0));
  writer.byte(0);

  const defaultDelay = Math.max(2, Math.round((options.delayMs ?? 100) / 10));
  const indices = new Uint8Array(pixelCount);

  for (const frame of frames) {
    const delay = frame.delayMs ? Math.max(2, Math.round(frame.delayMs / 10)) : defaultDelay;

    writer.byte(0x21); // Graphic control extension
    writer.byte(0xf9);
    writer.byte(4);
    writer.byte(0x04); // Disposal: leave in place, no transparency
    writer.short(delay);
    writer.byte(0);
    writer.byte(0);

    writer.byte(0x2c); // Image descriptor
    writer.short(0);
    writer.short(0);
    writer.short(width);
    writer.short(height);
    writer.byte(0); // No local colour table, not interlaced

    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const offset = pixel * 4;
      indices[pixel] = map(frame.data[offset], frame.data[offset + 1], frame.data[offset + 2]);
    }
    writeLzw(writer, indices, Math.max(2, paletteBits));
  }

  writer.byte(0x3b); // Trailer
  return writer.toUint8Array();
}

export interface CaptureGifOptions {
  /** Number of frames to sample. More frames = smoother, larger GIF. */
  frameCount?: number;
  /** Milliseconds between captured frames. */
  intervalMs?: number;
  /** Longest edge of the output GIF in pixels. */
  maxWidth?: number;
  maxColors?: number;
  /** Capture a short pre-roll from frames already buffered, if provided. */
  priorFrames?: GifFrame[];
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

export const gifBytesToDataUrl = (bytes: Uint8Array): string => `data:image/gif;base64,${toBase64(bytes)}`;

/**
 * Sample a live canvas over a short window and return a smooth looping GIF data
 * URL of what the camera just saw. Browser-only helper.
 */
export async function captureCanvasGif(
  canvas: HTMLCanvasElement,
  options: CaptureGifOptions = {}
): Promise<string> {
  const frameCount = Math.max(2, options.frameCount ?? 14);
  const intervalMs = Math.max(40, options.intervalMs ?? 90);
  const maxWidth = Math.max(80, options.maxWidth ?? 320);

  const sourceWidth = canvas.width || 640;
  const sourceHeight = canvas.height || 360;
  const width = Math.min(maxWidth, sourceWidth);
  const height = Math.max(2, Math.round((width * sourceHeight) / Math.max(1, sourceWidth)));

  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('A 2D context is required to capture a GIF.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const frames: GifFrame[] = [];
  for (let index = 0; index < frameCount; index++) {
    context.drawImage(canvas, 0, 0, width, height);
    frames.push({ data: context.getImageData(0, 0, width, height).data });
    if (index < frameCount - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const bytes = encodeGif({
    width,
    height,
    frames,
    delayMs: intervalMs,
    maxColors: options.maxColors ?? 128,
    loopCount: 0,
  });
  return gifBytesToDataUrl(bytes);
}
