import {
  type Fail, type Reminder, type Settings, type State,
  MAX_ACTIVE_REMINDERS, MAX_COMPLETED_HISTORY, SNOOZE_CHOICES, TITLE_MAX, UNDO_WINDOW_MS,
} from '../shared/types';

export type Result = { ok: true; state: State; duplicate?: boolean } | Fail;

const fail = (error: string, message: string): Fail => ({ ok: false, error, message });
const MAX_FUTURE_MS = 10 * 366 * 24 * 3600_000;
const RECENT_OPS = 200;

export const attentionKey = (r: Reminder) => `${r.occurrenceId}@${r.effectiveDueAt}`;
const isActive = (r: Reminder) => r.status !== 'completed';

export function validateTitle(raw: unknown): string | Fail {
  if (typeof raw !== 'string') return fail('title', 'Enter a title.');
  const title = raw.trim();
  if (!title) return fail('title', 'Enter a title.');
  if (title.length > TITLE_MAX) return fail('title', `Keep the title to ${TITLE_MAX} characters or fewer.`);
  return title;
}

export function validateDueAt(dueAt: unknown, now: number): number | Fail {
  if (typeof dueAt !== 'number' || !Number.isInteger(dueAt)) return fail('time', 'Choose a valid date and time.');
  if (dueAt <= now) return fail('time', 'Choose a time in the future.');
  if (dueAt > now + MAX_FUTURE_MS) return fail('time', 'Choose a time within the next 10 years.');
  return dueAt;
}

const replace = (s: State, r: Reminder): State => ({ ...s, reminders: s.reminders.map((x) => (x.id === r.id ? r : x)) });

/** Due reminders in display order: effective due time, creation time, then ID. */
export function dueQueue(s: State): Reminder[] {
  return s.reminders.filter((r) => r.status === 'due').sort(byDue);
}
export function byDue(a: Reminder, b: Reminder) {
  return a.effectiveDueAt - b.effectiveDueAt || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function upcoming(s: State): Reminder[] {
  return s.reminders.filter((r) => r.status === 'scheduled' || r.status === 'snoozed').sort(byDue);
}
export function nextWakeAt(s: State): number | undefined {
  return upcoming(s)[0]?.effectiveDueAt;
}

export function create(s: State, input: { title: unknown; dueAt: unknown }, now: number, id: string): Result {
  const title = validateTitle(input.title);
  if (typeof title !== 'string') return title;
  const dueAt = validateDueAt(input.dueAt, now);
  if (typeof dueAt !== 'number') return dueAt;
  if (s.reminders.filter(isActive).length >= MAX_ACTIVE_REMINDERS)
    return fail('capacity', `You have ${MAX_ACTIVE_REMINDERS} open reminders, the maximum. Complete or delete some first.`);
  const r: Reminder = {
    id, occurrenceId: id, title, originalDueAt: dueAt, effectiveDueAt: dueAt,
    createdAt: now, updatedAt: now, status: 'scheduled', revision: 1,
  };
  return { ok: true, state: { ...s, reminders: [...s.reminders, r] } };
}

export function edit(s: State, input: { id: string; revision: number; title: unknown; dueAt: unknown }, now: number, newOccurrence: string): Result {
  const r = s.reminders.find((x) => x.id === input.id);
  if (!r || r.status === 'completed') return fail('not_found', 'That reminder no longer exists.');
  if (r.revision !== input.revision) return fail('stale', 'That reminder changed elsewhere. Review it and try again.');
  const title = validateTitle(input.title);
  if (typeof title !== 'string') return title;
  if (input.dueAt === r.originalDueAt) return { ok: true, state: replace(s, { ...r, title, revision: r.revision + 1, updatedAt: now }) };
  const dueAt = validateDueAt(input.dueAt, now);
  if (typeof dueAt !== 'number') return dueAt;
  return {
    ok: true,
    state: replace(s, {
      ...r, title, originalDueAt: dueAt, effectiveDueAt: dueAt, occurrenceId: newOccurrence,
      status: 'scheduled', revision: r.revision + 1, updatedAt: now, presentedKey: undefined, notifiedKey: undefined,
    }),
  };
}

export function remove(s: State, id: string): Result {
  if (!s.reminders.some((r) => r.id === id)) return fail('not_found', 'That reminder no longer exists.');
  const lastCompletion = s.lastCompletion?.id === id ? undefined : s.lastCompletion;
  return { ok: true, state: { ...s, reminders: s.reminders.filter((r) => r.id !== id), lastCompletion } };
}

export interface ActInput { id: string; revision: number; opId: string; occurrenceId?: string }

/** Wraps an acknowledgement so a repeated operation ID is a harmless no-op. */
function once(s: State, opId: string, apply: () => Result): Result {
  if (s.recentOps.includes(opId)) return { ok: true, state: s, duplicate: true };
  const res = apply();
  if (!res.ok) return res;
  return { ...res, state: { ...res.state, recentOps: [...res.state.recentOps, opId].slice(-RECENT_OPS) } };
}

function findDue(s: State, a: ActInput): Reminder | Fail {
  const r = s.reminders.find((x) => x.id === a.id);
  if (!r) return fail('not_found', 'That reminder no longer exists.');
  if (a.occurrenceId !== undefined && r.occurrenceId !== a.occurrenceId) return fail('stale', 'That reminder was rescheduled.');
  if (r.revision !== a.revision) return fail('stale', 'That reminder changed elsewhere.');
  if (r.status !== 'due') return fail('not_due', 'That reminder is not due.');
  return r;
}

export function snooze(s: State, a: ActInput, now: number): Result {
  return once(s, a.opId, () => {
    const r = findDue(s, a);
    if ('ok' in r) return r;
    const at = now + s.settings.snoozeMinutes * 60_000;
    return { ok: true, state: replace(s, { ...r, status: 'snoozed', effectiveDueAt: at, revision: r.revision + 1, updatedAt: now }) };
  });
}

export function complete(s: State, a: ActInput, now: number): Result {
  return once(s, a.opId, () => {
    const r = findDue(s, a);
    if ('ok' in r) return r;
    const done: Reminder = { ...r, status: 'completed', completedAt: now, revision: r.revision + 1, updatedAt: now };
    const all = replace(s, done).reminders;
    // Completed history keeps the newest MAX_COMPLETED_HISTORY entries (disclosed in PRIVACY.md).
    const keep = new Set(all.filter((x) => x.status === 'completed')
      .sort((x, y) => (y.completedAt ?? 0) - (x.completedAt ?? 0)).slice(0, MAX_COMPLETED_HISTORY).map((x) => x.id));
    return {
      ok: true,
      state: {
        ...s,
        reminders: all.filter((x) => x.status !== 'completed' || keep.has(x.id)),
        lastCompletion: { id: r.id, revision: done.revision, at: now },
      },
    };
  });
}

/** Restores the last completion to Due if nothing changed it since. */
export function undo(s: State, a: { id: string; revision: number }, now: number): Result {
  const lc = s.lastCompletion;
  const r = s.reminders.find((x) => x.id === a.id);
  if (!lc || !r || lc.id !== a.id || lc.revision !== a.revision || r.revision !== a.revision || r.status !== 'completed')
    return fail('stale', 'This completion can no longer be undone.');
  if (now - lc.at > UNDO_WINDOW_MS + 5_000) return fail('expired', 'The undo window has passed.');
  return {
    ok: true,
    state: { ...replace(s, { ...r, status: 'due', completedAt: undefined, revision: r.revision + 1, updatedAt: now }), lastCompletion: undefined },
  };
}

/** Marks every overdue scheduled/snoozed reminder Due. Idempotent. */
export function sweep(s: State, now: number): { state: State; becameDue: Reminder[] } {
  const becameDue: Reminder[] = [];
  const reminders = s.reminders.map((r) => {
    if ((r.status === 'scheduled' || r.status === 'snoozed') && r.effectiveDueAt <= now) {
      const d = { ...r, status: 'due' as const, revision: r.revision + 1, updatedAt: now };
      becameDue.push(d);
      return d;
    }
    return r;
  });
  return { state: becameDue.length ? { ...s, reminders } : s, becameDue };
}

export function markPresented(s: State, id: string, key: string): State {
  const r = s.reminders.find((x) => x.id === id);
  if (!r || r.status !== 'due' || attentionKey(r) !== key || r.presentedKey === key) return s;
  return replace(s, { ...r, presentedKey: key }); // presentation is not a user change: revision stays
}

export function updateSettings(s: State, patch: Record<string, unknown>): Result {
  const next: Settings = { ...s.settings };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'snoozeMinutes' && SNOOZE_CHOICES.includes(v as never)) next.snoozeMinutes = v as Settings['snoozeMinutes'];
    else if (k === 'position' && (v === 'left' || v === 'right')) next.position = v;
    else if ((k === 'pauseAnimation' || k === 'notifications' || k === 'notificationTitles') && typeof v === 'boolean') next[k] = v;
    else return fail('invalid', `Unsupported setting: ${k}`);
  }
  return { ok: true, state: { ...s, settings: next } };
}
