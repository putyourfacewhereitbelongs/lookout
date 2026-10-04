import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPalette, encodeGif, GifFrame } from '../src/services/gifEncoder';

/** Minimal GIF LZW decoder used to verify the encoder round-trips pixel data. */
function decodeLzw(data: Uint8Array, minimumCodeSize: number, pixelCount: number): number[] {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let dictionary: number[][] = [];
  const resetDictionary = () => {
    dictionary = [];
    for (let index = 0; index < clearCode; index++) dictionary.push([index]);
    dictionary.push([], []); // clear + end placeholders
    codeSize = minimumCodeSize + 1;
  };
  resetDictionary();

  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let previous: number[] | null = null;

  for (let position = 0; position < data.length; position++) {
    bitBuffer |= data[position] << bitCount;
    bitCount += 8;
    while (bitCount >= codeSize) {
      const code = bitBuffer & ((1 << codeSize) - 1);
      bitBuffer >>= codeSize;
      bitCount -= codeSize;

      if (code === clearCode) {
        resetDictionary();
        previous = null;
        continue;
      }
      if (code === endCode) return output;

      let entry: number[];
      if (code < dictionary.length && dictionary[code].length > 0) {
        entry = dictionary[code];
      } else if (previous) {
        entry = [...previous, previous[0]];
      } else {
        throw new Error('Corrupt LZW stream');
      }
      output.push(...entry);
      if (previous) {
        dictionary.push([...previous, entry[0]]);
        if (dictionary.length === 1 << codeSize && codeSize < 12) codeSize++;
      }
      previous = entry;
      if (output.length > pixelCount * 4) throw new Error('Decoder overran the expected frame size');
    }
  }
  return output;
}

/** Pull the colour table, frame count, and first frame indices out of a GIF. */
function parseGif(bytes: Uint8Array) {
  assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'GIF89a');
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const packed = bytes[10];
  const tableSize = 1 << ((packed & 0x07) + 1);
  let cursor = 13;
  const palette = bytes.subarray(cursor, cursor + tableSize * 3);
  cursor += tableSize * 3;

  const frames: number[][] = [];
  const delays: number[] = [];
  let loopCount: number | null = null;

  while (cursor < bytes.length) {
    const marker = bytes[cursor];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[cursor + 1];
      cursor += 2;
      if (label === 0xf9) {
        delays.push(bytes[cursor + 2] | (bytes[cursor + 3] << 8));
      }
      if (label === 0xff) {
        loopCount = bytes[cursor + 1 + 11 + 1 + 1] | (bytes[cursor + 1 + 11 + 1 + 2] << 8);
      }
      while (bytes[cursor] !== 0) cursor += bytes[cursor] + 1;
      cursor += 1;
      continue;
    }
    if (marker === 0x2c) {
      cursor += 10; // image descriptor
      const minimumCodeSize = bytes[cursor++];
      const chunks: number[] = [];
      while (bytes[cursor] !== 0) {
        const size = bytes[cursor++];
        for (let index = 0; index < size; index++) chunks.push(bytes[cursor + index]);
        cursor += size;
      }
      cursor += 1;
      frames.push(decodeLzw(Uint8Array.from(chunks), minimumCodeSize, width * height));
      continue;
    }
    throw new Error(`Unexpected GIF block 0x${marker.toString(16)}`);
  }

  return { width, height, palette, frames, delays, loopCount, tableSize };
}

function solidFrame(width: number, height: number, rgb: [number, number, number]): GifFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    data[pixel * 4] = rgb[0];
    data[pixel * 4 + 1] = rgb[1];
    data[pixel * 4 + 2] = rgb[2];
    data[pixel * 4 + 3] = 255;
  }
  return { data };
}

test('encodes a looping multi-frame GIF with the requested geometry and delay', () => {
  const frames = [
    solidFrame(8, 6, [255, 0, 0]),
    solidFrame(8, 6, [0, 255, 0]),
    solidFrame(8, 6, [0, 0, 255]),
  ];
  const parsed = parseGif(encodeGif({ width: 8, height: 6, frames, delayMs: 90, maxColors: 8 }));
  assert.equal(parsed.width, 8);
  assert.equal(parsed.height, 6);
  assert.equal(parsed.frames.length, 3);
  assert.equal(parsed.loopCount, 0);
  assert.deepEqual(parsed.delays, [9, 9, 9]);
});

test('every frame decodes back to exactly width * height palette indices', () => {
  const width = 24;
  const height = 16;
  const frames: GifFrame[] = [0, 1, 2, 3].map((step) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = (x * 10 + step * 30) % 256;
        data[offset + 1] = (y * 14) % 256;
        data[offset + 2] = (x * y + step * 17) % 256;
        data[offset + 3] = 255;
      }
    }
    return { data };
  });

  const parsed = parseGif(encodeGif({ width, height, frames, delayMs: 100, maxColors: 64 }));
  assert.equal(parsed.frames.length, 4);
  for (const frame of parsed.frames) {
    assert.equal(frame.length, width * height);
    assert.ok(frame.every((index) => index < parsed.tableSize));
  }
});

test('decoded colours stay visually close to the source pixels', () => {
  const width = 16;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const half = pixel < (width * height) / 2;
    data[pixel * 4] = half ? 220 : 20;
    data[pixel * 4 + 1] = half ? 180 : 40;
    data[pixel * 4 + 2] = half ? 150 : 60;
    data[pixel * 4 + 3] = 255;
  }
  const parsed = parseGif(encodeGif({ width, height, frames: [{ data }], maxColors: 16 }));
  const indices = parsed.frames[0];
  const colorAt = (pixel: number) => {
    const index = indices[pixel];
    return [parsed.palette[index * 3], parsed.palette[index * 3 + 1], parsed.palette[index * 3 + 2]];
  };
  const [r1, g1, b1] = colorAt(0);
  const [r2, g2, b2] = colorAt(width * height - 1);
  assert.ok(Math.abs(r1 - 220) <= 6 && Math.abs(g1 - 180) <= 6 && Math.abs(b1 - 150) <= 6);
  assert.ok(Math.abs(r2 - 20) <= 6 && Math.abs(g2 - 40) <= 6 && Math.abs(b2 - 60) <= 6);
});

test('palette generation keeps distinct source colours apart', () => {
  const frame = solidFrame(4, 4, [10, 20, 30]);
  const second = solidFrame(4, 4, [200, 210, 220]);
  const palette = buildPalette([frame, second], 16, 4);
  const entries = [0, 1, 2, 3].map((index) => [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]].join(','));
  assert.ok(entries.includes('10,20,30'));
  assert.ok(entries.includes('200,210,220'));
});

test('rejects frames that do not match the declared dimensions', () => {
  assert.throws(() => encodeGif({ width: 10, height: 10, frames: [solidFrame(4, 4, [0, 0, 0])] }), /smaller than width/);
  assert.throws(() => encodeGif({ width: 10, height: 10, frames: [] }), /At least one frame/);
});
