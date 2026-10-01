import assert from 'node:assert/strict';
import test from 'node:test';
import { StorageService } from '../src/services/db';
import type { HistoryEvent } from '../src/types';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function useMemoryStorage() {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
}

function event(id: string, timestamp: number): HistoryEvent {
  return { id, timestamp, cameraId: 'cam-1', cameraName: 'Porch', type: 'bike_fell', title: 'Bike may have fallen over', details: 'Bike changed shape.', severity: 'warning' };
}

test('event history persists newest first and keeps the full event details', () => {
  useMemoryStorage();
  StorageService.addHistoryEvent(event('one', 100));
  StorageService.addHistoryEvent(event('two', 200));
  assert.deepEqual(StorageService.getHistoryEvents().map(({ id }) => id), ['two', 'one']);
  assert.equal(StorageService.getHistoryEvents()[0].details, 'Bike changed shape.');
});

test('event history is bounded to the latest 1,000 events', () => {
  useMemoryStorage();
  StorageService.saveHistoryEvents(Array.from({ length: 1005 }, (_, index) => event(String(1004 - index), 1004 - index)));
  const saved = StorageService.getHistoryEvents();
  assert.equal(saved.length, 1000);
  assert.equal(saved[0].id, '1004');
  assert.equal(saved.at(-1)?.id, '5');
});

test('database export and import preserve event history', () => {
  useMemoryStorage();
  StorageService.addHistoryEvent(event('bike-1', 1234));
  const backup = StorageService.exportFullDatabase();
  StorageService.clearHistoryEvents();
  assert.deepEqual(StorageService.getHistoryEvents(), []);
  assert.equal(StorageService.importFullDatabase(backup), true);
  assert.deepEqual(StorageService.getHistoryEvents(), [event('bike-1', 1234)]);
});
