import assert from 'node:assert/strict';
import test from 'node:test';
import { alertCenter, buildSpeechText, isWithinQuietHours, parseClockMinutes } from '../src/services/alertCenter';
import { DEFAULT_ALERT_SETTINGS } from '../src/services/db';
import type { AlertNotificationSettings } from '../src/types';

const settings = (overrides: Partial<AlertNotificationSettings> = {}): AlertNotificationSettings => ({
  ...DEFAULT_ALERT_SETTINGS,
  ...overrides,
});

function reset(overrides: Partial<AlertNotificationSettings> = {}) {
  alertCenter.clear();
  alertCenter.setMuted(false);
  alertCenter.setSettings(settings(overrides));
}

test('an identified face is announced by name with its match confidence', () => {
  assert.equal(
    buildSpeechText({ title: 'Brian identified', message: '', subjectName: 'Brian', cameraName: 'Front Door', confidence: 0.97 }),
    'Brian has been identified on Front Door, 97 percent match.'
  );
});

test('critical identifications are spoken with an alert prefix', () => {
  assert.equal(
    buildSpeechText({ title: 'Intruder', message: '', subjectName: 'Alex', cameraName: 'Driveway', severity: 'critical' }),
    'Alert. Alex has been identified on Driveway.'
  );
});

test('name announcements can be anonymized while still speaking the alert', () => {
  assert.equal(
    buildSpeechText({ title: 'Brian identified', message: '', subjectName: 'Brian', cameraName: 'Porch' }, false),
    'A known person has been identified on Porch.'
  );
});

test('explicit speech text always wins over the generated sentence', () => {
  assert.equal(buildSpeechText({ title: 'x', message: 'y', subjectName: 'Brian', speech: 'Custom line.' }), 'Custom line.');
});

test('quiet hours handle windows that wrap past midnight', () => {
  const quiet = settings({ quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' });
  assert.equal(isWithinQuietHours(quiet, new Date(2026, 0, 1, 23, 30)), true);
  assert.equal(isWithinQuietHours(quiet, new Date(2026, 0, 1, 3, 0)), true);
  assert.equal(isWithinQuietHours(quiet, new Date(2026, 0, 1, 12, 0)), false);
  assert.equal(isWithinQuietHours(settings(), new Date(2026, 0, 1, 23, 30)), false);
});

test('malformed quiet hour values never suppress alerts', () => {
  assert.equal(parseClockMinutes('7:05'), 425);
  assert.equal(parseClockMinutes('29:00'), null);
  assert.equal(isWithinQuietHours(settings({ quietHoursEnabled: true, quietHoursStart: 'oops', quietHoursEnd: '07:00' })), false);
});

test('alerts stack newest first and stay bounded', () => {
  reset({ cooldownSeconds: 0 });
  for (let index = 0; index < 6; index++) {
    alertCenter.push({ title: `Alert ${index}`, message: 'face detected' });
  }
  const alerts = alertCenter.getAlerts();
  assert.equal(alerts.length, 4);
  assert.equal(alerts[0].title, 'Alert 5');
});

test('the same subject is not re-announced inside the cooldown window', () => {
  reset({ cooldownSeconds: 60 });
  const first = alertCenter.push({ title: 'Brian identified', message: '', subjectName: 'Brian', dedupeKey: 'identity:brian' });
  const second = alertCenter.push({ title: 'Brian identified', message: '', subjectName: 'Brian', dedupeKey: 'identity:brian' });
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(alertCenter.getAlerts().length, 1);
});

test('a GIF preview can be attached to an alert after it is shown', () => {
  reset({ cooldownSeconds: 0 });
  const id = alertCenter.push({ title: 'Brian identified', message: '', subjectName: 'Brian' })!;
  alertCenter.markGifPending(id);
  assert.equal(alertCenter.getAlerts()[0].gifPending, true);
  alertCenter.attachGif(id, 'data:image/gif;base64,AAAA');
  assert.deepEqual(
    { gifPending: alertCenter.getAlerts()[0].gifPending, gifUrl: alertCenter.getAlerts()[0].gifUrl },
    { gifPending: false, gifUrl: 'data:image/gif;base64,AAAA' }
  );
});

test('subscribers receive the current stack and updates until they unsubscribe', () => {
  reset({ cooldownSeconds: 0 });
  const seen: number[] = [];
  const unsubscribe = alertCenter.subscribe((alerts) => seen.push(alerts.length));
  const id = alertCenter.push({ title: 'Face detected', message: '' })!;
  alertCenter.dismiss(id);
  unsubscribe();
  alertCenter.push({ title: 'Ignored after unsubscribe', message: '' });
  assert.deepEqual(seen, [0, 1, 0]);
});

test('turning visual banners off keeps the feed clear of notification cards', () => {
  reset({ visualBanners: false, cooldownSeconds: 0 });
  assert.equal(alertCenter.push({ title: 'Brian identified', message: '', subjectName: 'Brian' }), null);
  assert.equal(alertCenter.getAlerts().length, 0);
});

test('critical alerts remain on screen longer than routine recognitions', () => {
  reset({ cooldownSeconds: 0, bannerDurationSeconds: 8 });
  alertCenter.push({ title: 'Routine', message: '' });
  alertCenter.push({ title: 'Critical', message: '', severity: 'critical' });
  const [critical, routine] = alertCenter.getAlerts();
  assert.equal(routine.durationMs, 8000);
  assert.ok(critical.durationMs > routine.durationMs);
});
