import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSubjectMask, type SegmentationCandidate } from '../src/services/subjectSegmenter';

function candidate(
  label: string,
  width: number,
  height: number,
  filled: Array<[number, number]>,
  score = 0.96,
): SegmentationCandidate {
  const data = new Uint8Array(width * height);
  for (const [x, y] of filled) data[y * width + x] = 255;
  return { label, score, mask: { width, height, channels: 1, data } };
}

test('selectSubjectMask keeps only pixels from the model person mask', () => {
  const personPixels: Array<[number, number]> = [];
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) personPixels.push([x, y]);
  const remotePixels: Array<[number, number]> = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) remotePixels.push([x, y]);

  const mask = selectSubjectMask([
    candidate('remote', 8, 8, remotePixels, 0.99),
    candidate('person', 8, 8, personPixels),
  ], 'person', { x: 0.3, y: 0.3, width: 0.4, height: 0.4 });

  assert.ok(mask);
  assert.equal(mask.width, 8);
  assert.equal(mask.height, 8);
  assert.equal(mask.alpha[0], 0, 'non-person/background pixels must remain transparent');
  assert.equal(mask.alpha[3 * 8 + 3], 255, 'model person pixels are retained');
  assert.equal(mask.alpha[7 * 8 + 7], 0, 'there is no rectangular fallback around the person');
});

test('selectSubjectMask refuses a target when no supported animal segment overlaps it', () => {
  const fullCrop: Array<[number, number]> = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) fullCrop.push([x, y]);
  const birdInCorner: Array<[number, number]> = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) birdInCorner.push([x, y]);

  const mask = selectSubjectMask([
    candidate('remote', 8, 8, fullCrop),
    candidate('bird', 8, 8, birdInCorner),
  ], 'animal', { x: 0.5, y: 0.5, width: 0.4, height: 0.4 });

  assert.equal(mask, null, 'unrelated or background segments must not be tinted for an animal target');
});

test('selectSubjectMask retains the best overlapping instance rather than an arbitrary same-label instance', () => {
  const unrelatedPerson: Array<[number, number]> = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) unrelatedPerson.push([x, y]);
  const anchoredPerson: Array<[number, number]> = [];
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) anchoredPerson.push([x, y]);

  const mask = selectSubjectMask([
    candidate('person', 8, 8, unrelatedPerson, 0.99),
    candidate('person', 8, 8, anchoredPerson, 0.82),
  ], 'person', { x: 0.4, y: 0.4, width: 0.4, height: 0.4 });

  assert.ok(mask);
  assert.equal(mask.alpha[1 * 8 + 1], 0, 'the other person is not overlaid');
  assert.equal(mask.alpha[4 * 8 + 4], 255, 'the instance covering the detector anchor is overlaid');
});
