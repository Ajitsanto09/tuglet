export const SCHEMA_VERSION = 1;
export const MAX_ACTIVE_REMINDERS = 500;
export const MAX_COMPLETED_HISTORY = 100;
export const TITLE_MAX = 120;
export const UNDO_WINDOW_MS = 10_000;
export const SNOOZE_CHOICES = [5, 10, 15, 30] as const;

export type ReminderStatus = 'scheduled' | 'due' | 'snoozed' | 'completed';

export interface Reminder {
  id: string;
  /** Stable for this one-shot reminder until its time is materially changed. */
  occurrenceId: string;
  title: string;
  originalDueAt: number;
  effectiveDueAt: number;
  createdAt: number;
  updatedAt: number;
  status: ReminderStatus;
  revision: number;
  completedAt?: number;
  /** Attention key last shown on a page (prevents replaying the swing). */
  presentedKey?: string;
  /** Attention key last sent as a system notification. */
  notifiedKey?: string;
}

export interface Settings {
  snoozeMinutes: (typeof SNOOZE_CHOICES)[number];
  position: 'left' | 'right';
  pauseAnimation: boolean;
  notifications: boolean;
  notificationTitles: boolean;
}

/** A site the user enabled. Chrome's actual grant is checked separately. */
export interface SiteEntry {
  pattern: string;
  showTitles: boolean;
}

export interface State {
  schemaVersion: typeof SCHEMA_VERSION;
  reminders: Reminder[];
  settings: Settings;
  sites: SiteEntry[];
  /** Bounded list of recently applied operation IDs (duplicate rejection). */
  recentOps: string[];
  lastCompletion?: { id: string; revision: number; at: number };
}

export const DEFAULT_SETTINGS: Settings = {
  snoozeMinutes: 5,
  position: 'right',
  pauseAnimation: false,
  notifications: false,
  notificationTitles: false,
};

export const emptyState = (): State => ({
  schemaVersion: SCHEMA_VERSION,
  reminders: [],
  settings: { ...DEFAULT_SETTINGS },
  sites: [],
  recentOps: [],
});

/** Minimal, sanitized data sent to a page. Never contains the store. */
export interface PageView {
  remove?: true;
  visible: boolean;
  active: boolean;
  due: null | { id: string; occurrenceId: string; revision: number; label: string; key: string; swing: boolean };
  dueCount: number;
  position: Settings['position'];
  motion: boolean;
  snoozeMinutes: number;
}

export type Fail = { ok: false; error: string; message: string };
