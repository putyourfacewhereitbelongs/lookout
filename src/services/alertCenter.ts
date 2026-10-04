/**
 * Central alert store for Lookout.
 *
 * Alerts are small, non-blocking toasts instead of a full-screen takeover, so
 * the live camera view is never hidden by a notification. Each alert can carry
 * the cropped face that triggered it plus a short looping GIF of the feed, and
 * can be spoken aloud ("Brian has been identified on Front Door").
 */

import { AlertNotificationSettings, AlertToneType } from '../types';
import { DEFAULT_ALERT_SETTINGS } from './db';
import { audioEngine } from './audioEngine';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface LookoutAlert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  /** Short headline, e.g. "Brian identified". */
  title: string;
  /** Supporting sentence shown under the headline. */
  message: string;
  /** Recognized subject, when the alert is about an identified face. */
  subjectName?: string;
  cameraName?: string;
  confidence?: number;
  /** Cropped still of the detected face. */
  faceImage?: string;
  /** Looping GIF of the live feed around the moment of the alert. */
  gifUrl?: string;
  /** True while the GIF is still being captured and encoded. */
  gifPending: boolean;
  /** Auto-dismiss delay in milliseconds; 0 keeps the toast until dismissed. */
  durationMs: number;
}

export interface PushAlertInput {
  title: string;
  message: string;
  severity?: AlertSeverity;
  subjectName?: string;
  cameraName?: string;
  confidence?: number;
  faceImage?: string;
  tone?: AlertToneType;
  /** Spoken sentence. Defaults to a sentence built from the subject name. */
  speech?: string;
  /** Suppress repeats of the same key inside the configured cooldown. */
  dedupeKey?: string;
  /** Override the dedupe window for this alert. */
  cooldownMs?: number;
  durationMs?: number;
  /** Set false for purely informational toasts that should stay silent. */
  playTone?: boolean;
  /** Set false to show the toast without a spoken announcement. */
  speak?: boolean;
}

type Listener = (alerts: LookoutAlert[]) => void;

const MAX_ALERTS = 4;

/** Parse "HH:MM" into minutes past midnight; returns null when malformed. */
export function parseClockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() || '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Quiet hours may wrap past midnight (22:00 -> 07:00). */
export function isWithinQuietHours(settings: AlertNotificationSettings, date = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = parseClockMinutes(settings.quietHoursStart);
  const end = parseClockMinutes(settings.quietHoursEnd);
  if (start === null || end === null || start === end) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** Build the sentence spoken aloud for an alert. */
export function buildSpeechText(input: PushAlertInput, announceNames = true): string {
  if (input.speech) return input.speech;
  const camera = input.cameraName ? ` on ${input.cameraName}` : '';
  if (input.subjectName && !announceNames) {
    return `A known person has been identified${camera}.`;
  }
  if (input.subjectName) {
    const confidence = typeof input.confidence === 'number'
      ? `, ${Math.round(Math.max(0, Math.min(1, input.confidence)) * 100)} percent match`
      : '';
    return input.severity === 'critical'
      ? `Alert. ${input.subjectName} has been identified${camera}${confidence}.`
      : `${input.subjectName} has been identified${camera}${confidence}.`;
  }
  return `${input.title}${camera}.`;
}

class AlertCenter {
  private alerts: LookoutAlert[] = [];
  private listeners = new Set<Listener>();
  private cooldowns = new Map<string, number>();
  private settings: AlertNotificationSettings = DEFAULT_ALERT_SETTINGS;
  private muted = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.alerts);
    return () => { this.listeners.delete(listener); };
  }

  getAlerts(): LookoutAlert[] { return this.alerts; }

  setSettings(settings: AlertNotificationSettings): void { this.settings = settings; }

  getSettings(): AlertNotificationSettings { return this.settings; }

  isMuted(): boolean { return this.muted; }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.emit();
  }

  /**
   * Queue an alert. Returns the alert id, or null when it was suppressed by the
   * dedupe cooldown or by the "visual banners off" preference.
   */
  push(input: PushAlertInput): string | null {
    const now = Date.now();
    const cooldownMs = input.cooldownMs ?? Math.max(0, (this.settings.cooldownSeconds || 0) * 1000);
    if (input.dedupeKey && cooldownMs > 0) {
      const last = this.cooldowns.get(input.dedupeKey) || 0;
      if (now - last < cooldownMs) return null;
      this.cooldowns.set(input.dedupeKey, now);
    }

    const severity = input.severity || 'info';
    const quiet = isWithinQuietHours(this.settings);
    const silent = this.muted || quiet;

    if (!silent && input.playTone !== false) {
      const tone = input.tone
        || (severity === 'critical' && this.settings.criticalThreatSiren ? 'intruder_siren' : this.settings.customTone);
      if (this.settings.audibleChime) audioEngine.playAlertTone(tone, this.settings.alertToneVolume);
    }

    if (!silent && input.speak !== false && this.settings.ttsVoiceEnabled) {
      audioEngine.speak(
        buildSpeechText({ ...input, severity }, this.settings.announceIdentityNames !== false),
        this.settings.ttsVoiceRate,
        this.settings.ttsVoicePitch
      );
    }

    if (this.settings.browserPush && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(input.title, {
          body: input.message,
          icon: input.faceImage || '/icon.svg',
          tag: input.dedupeKey || input.title,
          silent,
        });
      } catch { /* Browser push is best effort. */ }
    }

    if (!this.settings.visualBanners) return null;

    const alert: LookoutAlert = {
      id: `alert-${now}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now,
      severity,
      title: input.title,
      message: input.message,
      subjectName: input.subjectName,
      cameraName: input.cameraName,
      confidence: input.confidence,
      faceImage: input.faceImage,
      gifPending: false,
      durationMs: input.durationMs ?? Math.max(0, (this.settings.bannerDurationSeconds ?? 8) * 1000) * (severity === 'critical' ? 1.75 : 1),
    };
    this.alerts = [alert, ...this.alerts].slice(0, MAX_ALERTS);
    this.emit();
    return alert.id;
  }

  /** Mark that a GIF capture has started for an alert. */
  markGifPending(id: string): void {
    this.update(id, { gifPending: true });
  }

  /** Attach the finished looping GIF preview to an alert. */
  attachGif(id: string, gifUrl: string): void {
    this.update(id, { gifUrl, gifPending: false });
  }

  failGif(id: string): void {
    this.update(id, { gifPending: false });
  }

  dismiss(id: string): void {
    const next = this.alerts.filter((alert) => alert.id !== id);
    if (next.length !== this.alerts.length) {
      this.alerts = next;
      this.emit();
    }
  }

  clear(): void {
    if (this.alerts.length === 0) return;
    this.alerts = [];
    this.emit();
  }

  private update(id: string, patch: Partial<LookoutAlert>): void {
    let changed = false;
    this.alerts = this.alerts.map((alert) => {
      if (alert.id !== id) return alert;
      changed = true;
      return { ...alert, ...patch };
    });
    if (changed) this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.alerts);
  }
}

export const alertCenter = new AlertCenter();
