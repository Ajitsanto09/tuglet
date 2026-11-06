import { describe, expect, it } from 'vitest';
import { complete, create, dueQueue, edit, nextWakeAt, remove, snooze, sweep, undo, updateSettings, attentionKey, markPresented } from '../../src/domain/engine';
import { emptyState, MAX_ACTIVE_REMINDERS, type State } from '../../src/shared/types';

const T0 = Date.UTC(2026, 10, 6, 15, 0);
const MIN = 60_000;

function ok(r: ReturnType<typeof create>): State {
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  return r.state;
}
const withReminder = (title = 'Review the checkout mockup', at = T0 + 10 * MIN, id = 'r1', s = emptyState(), now = T0) => ok(create(s, { title, dueAt: at }, now, id));
const get = (s: State, id = 'r1') => s.reminders.find((r) => r.id === id)!;
const makeDue = (s: State, now = T0 + 10 * MIN) => sweep(s, now).state;

describe('create validation', () => {
  it('trims titles and stores scheduled reminder', () => {
    const s = withReminder('  Check the release smoke test  ');
    expect(get(s)).toMatchObject({ title: 'Check the release smoke test', status: 'scheduled', revision: 1, effectiveDueAt: T0 + 10 * MIN });
  });
  it.each([['', 'title'], ['   ', 'title'], ['x'.repeat(121), 'title'], [42, 'title']])('rejects title %j', (title, error) => {
    expect(create(emptyState(), { title, dueAt: T0 + MIN }, T0, 'a')).toMatchObject({ ok: false, error });
  });
  it('accepts exactly 120 characters', () => {
    expect(create(emptyState(), { title: 'x'.repeat(120), dueAt: T0 + MIN }, T0, 'a').ok).toBe(true);
  });
  it.each([[T0, 'past/now'], [T0 - 1, 'past'], [NaN, 'NaN'], [T0 + 0.5, 'fraction'], ['soon', 'string']])('rejects due time %s (%s)', (dueAt: unknown, _label: string) => {
    expect(create(emptyState(), { title: 'a', dueAt }, T0, 'a')).toMatchObject({ ok: false, error: 'time' });
  });
  it('enforces capacity on open reminders only', () => {
    let s = emptyState();
    s = { ...s, reminders: Array.from({ length: MAX_ACTIVE_REMINDERS }, (_, i) => ({ ...get(withReminder()), id: `x${i}` })) };
    expect(create(s, { title: 'one more', dueAt: T0 + MIN }, T0, 'y')).toMatchObject({ ok: false, error: 'capacity' });
    s = { ...s, reminders: s.reminders.map((r, i) => (i === 0 ? { ...r, status: 'completed' as const } : r)) };
    expect(create(s, { title: 'one more', dueAt: T0 + MIN }, T0, 'y').ok).toBe(true);
  });
});

describe('lifecycle', () => {
  it('scheduled → due → snoozed → due → completed → undo', () => {
    let s = withReminder();
    expect(sweep(s, T0 + 10 * MIN - 1).becameDue).toHaveLength(0);
    const swept = sweep(s, T0 + 10 * MIN);
    expect(swept.becameDue.map((r) => r.id)).toEqual(['r1']);
    s = swept.state;
    expect(get(s).status).toBe('due');

    const now = T0 + 30 * MIN; // snooze is measured from the worker's current time
    s = ok(snooze(s, { id: 'r1', revision: get(s).revision, opId: 'op1' }, now));
    expect(get(s)).toMatchObject({ status: 'snoozed', effectiveDueAt: now + 5 * MIN, originalDueAt: T0 + 10 * MIN });
    expect(nextWakeAt(s)).toBe(now + 5 * MIN);

    s = makeDue(s, now + 5 * MIN);
    expect(get(s).status).toBe('due');
    const rev = get(s).revision;
    s = ok(complete(s, { id: 'r1', revision: rev, opId: 'op2' }, now + 6 * MIN));
    expect(get(s)).toMatchObject({ status: 'completed', completedAt: now + 6 * MIN });
    expect(nextWakeAt(s)).toBeUndefined();
    expect(dueQueue(s)).toHaveLength(0);

    s = ok(undo(s, { id: 'r1', revision: rev + 1 }, now + 6 * MIN + 9_000));
    expect(get(s).status).toBe('due');
  });

  it('undo fails if the reminder changed or the window expired', () => {
    let s = makeDue(withReminder());
    const rev = get(s).revision;
    s = ok(complete(s, { id: 'r1', revision: rev, opId: 'c' }, T0 + 11 * MIN));
    expect(undo(s, { id: 'r1', revision: rev }, T0 + 11 * MIN)).toMatchObject({ ok: false, error: 'stale' });
    expect(undo(s, { id: 'r1', revision: rev + 1 }, T0 + 11 * MIN + 60_000)).toMatchObject({ ok: false, error: 'expired' });
    const deleted = ok(remove(s, 'r1'));
    expect(undo(deleted, { id: 'r1', revision: rev + 1 }, T0 + 11 * MIN)).toMatchObject({ ok: false });
  });

  it('uses the configured snooze length', () => {
    let s = makeDue(withReminder());
    s = ok(updateSettings(s, { snoozeMinutes: 15 }));
    s = ok(snooze(s, { id: 'r1', revision: get(s).revision, opId: 'o' }, T0 + 20 * MIN));
    expect(get(s).effectiveDueAt).toBe(T0 + 35 * MIN);
  });

  it('rejects unsupported settings', () => {
    expect(updateSettings(emptyState(), { snoozeMinutes: 7 }).ok).toBe(false);
    expect(updateSettings(emptyState(), { position: 'top' }).ok).toBe(false);
    expect(updateSettings(emptyState(), { evil: true }).ok).toBe(false);
  });

  it('edit of time reschedules with new occurrence and invalidates stale commands', () => {
    let s = makeDue(withReminder());
    const before = get(s);
    s = ok(edit(s, { id: 'r1', revision: before.revision, title: 'Prepare refinement notes', dueAt: T0 + 60 * MIN }, T0 + 11 * MIN, 'occ2'));
    expect(get(s)).toMatchObject({ status: 'scheduled', occurrenceId: 'occ2', title: 'Prepare refinement notes', effectiveDueAt: T0 + 60 * MIN });
    expect(complete(s, { id: 'r1', revision: before.revision, occurrenceId: before.occurrenceId, opId: 'x' }, T0 + 12 * MIN).ok).toBe(false);
  });

  it('title-only edit keeps the time and occurrence', () => {
    let s = withReminder();
    s = ok(edit(s, { id: 'r1', revision: 1, title: 'New title', dueAt: T0 + 10 * MIN }, T0 + MIN, 'occ2'));
    expect(get(s)).toMatchObject({ title: 'New title', occurrenceId: 'r1', revision: 2 });
    expect(edit(s, { id: 'r1', revision: 1, title: 'x', dueAt: T0 + 10 * MIN }, T0 + MIN, 'o')).toMatchObject({ ok: false, error: 'stale' });
  });

  it('delete removes and an old gesture cannot resurrect it', () => {
    let s = makeDue(withReminder());
    const rev = get(s).revision;
    s = ok(remove(s, 'r1'));
    expect(s.reminders).toHaveLength(0);
    expect(complete(s, { id: 'r1', revision: rev, opId: 'late' }, T0 + 12 * MIN)).toMatchObject({ ok: false, error: 'not_found' });
    expect(snooze(s, { id: 'r1', revision: rev, opId: 'late2' }, T0 + 12 * MIN)).toMatchObject({ ok: false, error: 'not_found' });
    expect(sweep(s, T0 + 99 * MIN).state.reminders).toHaveLength(0);
  });
});

describe('idempotence and staleness', () => {
  it('a duplicate operation ID does not snooze twice', () => {
    let s = makeDue(withReminder());
    const rev = get(s).revision;
    s = ok(snooze(s, { id: 'r1', revision: rev, opId: 'same' }, T0 + 20 * MIN));
    const after = get(s);
    const again = snooze(s, { id: 'r1', revision: rev, opId: 'same' }, T0 + 40 * MIN);
    expect(again).toMatchObject({ ok: true, duplicate: true });
    expect(get(ok(again))).toEqual(after);
  });

  it('a stale revision cannot complete a different or changed reminder', () => {
    let s = makeDue(withReminder('A', T0 + 10 * MIN, 'a', withReminder('B', T0 + 10 * MIN, 'b')));
    const a = get(s, 'a');
    s = ok(snooze(s, { id: 'a', revision: a.revision, opId: '1' }, T0 + 11 * MIN));
    const res = complete(s, { id: 'a', revision: a.revision, opId: '2' }, T0 + 11 * MIN);
    expect(res).toMatchObject({ ok: false });
    expect(get(s, 'b').status).toBe('due');
  });

  it('completing twice from two tabs acts once', () => {
    const s = makeDue(withReminder());
    const rev = get(s).revision;
    const first = ok(complete(s, { id: 'r1', revision: rev, opId: 'tab1' }, T0 + 11 * MIN));
    expect(complete(first, { id: 'r1', revision: rev, opId: 'tab2' }, T0 + 11 * MIN)).toMatchObject({ ok: false });
  });
});

describe('ordering and attention', () => {
  it('orders by effective due time, creation time, then ID', () => {
    let s = emptyState();
    s = ok(create(s, { title: 'c', dueAt: T0 + 5 * MIN }, T0, 'c'));
    s = ok(create(s, { title: 'b', dueAt: T0 + 5 * MIN }, T0, 'b'));
    s = ok(create(s, { title: 'a', dueAt: T0 + 5 * MIN }, T0 + 1, 'a'));
    s = ok(create(s, { title: 'z', dueAt: T0 + 4 * MIN }, T0 + 2, 'z'));
    s = makeDue(s, T0 + 6 * MIN);
    expect(dueQueue(s).map((r) => r.id)).toEqual(['z', 'b', 'c', 'a']);
  });

  it('marks a due event presented once; snoozing creates a new attention event', () => {
    let s = makeDue(withReminder());
    const key = attentionKey(get(s));
    s = markPresented(s, 'r1', key);
    expect(get(s).presentedKey).toBe(key);
    expect(markPresented(s, 'r1', 'other')).toBe(s);
    s = ok(snooze(s, { id: 'r1', revision: get(s).revision, opId: 'o' }, T0 + 20 * MIN));
    s = makeDue(s, T0 + 25 * MIN);
    expect(attentionKey(get(s))).not.toBe(key);
    expect(get(s).presentedKey).not.toBe(attentionKey(get(s)));
  });

  it('catch-up after downtime marks every overdue reminder due in one pass', () => {
    let s = emptyState();
    for (let i = 0; i < 5; i++) s = ok(create(s, { title: `t${i}`, dueAt: T0 + (i + 1) * MIN }, T0, `id${i}`));
    const { state, becameDue } = sweep(s, T0 + 24 * 60 * MIN);
    expect(becameDue).toHaveLength(5);
    expect(sweep(state, T0 + 25 * 60 * MIN).becameDue).toHaveLength(0);
  });

  it('keeps only the newest 100 completed reminders', () => {
    let s = emptyState();
    for (let i = 0; i < 102; i++) {
      s = ok(create(s, { title: `t${i}`, dueAt: T0 + MIN }, T0, `id${i}`));
      s = makeDue(s, T0 + MIN);
      s = ok(complete(s, { id: `id${i}`, revision: 2, opId: `op${i}` }, T0 + MIN + i));
    }
    expect(s.reminders).toHaveLength(100);
    expect(s.reminders.some((r) => r.id === 'id0' || r.id === 'id1')).toBe(false);
  });
});
