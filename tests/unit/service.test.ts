import { describe, expect, it } from 'vitest';
import { createService, type Platform, type SenderInfo, type TempGrant } from '../../src/background/service';
import { exportJson, migrate, parseImport } from '../../src/domain/schema';
import { parseAdmin, parsePage } from '../../src/shared/messages';
import { emptyState, type State } from '../../src/shared/types';
import type { ToPage } from '../../src/shared/messages';

const T0 = Date.UTC(2026, 10, 6, 15, 0);
const MIN = 60_000;

function fakePlatform() {
  let n = 0;
  const f = {
    clock: T0,
    failSave: false,
    alarm: undefined as number | undefined,
    badge: -1,
    granted: new Set<string>(),
    registered: [] as string[],
    injected: [] as number[],
    sent: [] as ToPage[],
    notified: [] as string[],
    notifyAllowed: false,
    notifyThrows: false,
    activeTab: 1 as number | undefined,
    temp: [] as TempGrant[],
    stored: undefined as State | undefined,
  };
  const p: Platform = {
    now: () => f.clock,
    newId: () => `id${++n}`,
    load: async () => structuredClone(f.stored),
    save: async (s) => { await Promise.resolve(); if (f.failSave) throw new Error('quota'); f.stored = structuredClone(s); },
    clearStore: async () => { f.stored = undefined; },
    setNextAlarm: async (w) => { f.alarm = w; },
    ensureReconcileAlarm: async () => undefined,
    setBadge: async (c) => { f.badge = c; },
    notificationsAllowed: async () => f.notifyAllowed,
    notify: async (id) => { if (f.notifyThrows) throw new Error('denied'); f.notified.push(id); },
    clearNotification: async () => undefined,
    isGranted: async (pattern) => f.granted.has(pattern),
    registerSites: async (patterns) => { f.registered = patterns; },
    inject: async (tabId) => { f.injected.push(tabId); },
    tabUrl: async (tabId) => (tabId === 1 ? 'http://localhost:4000/page' : tabId === 9 ? 'chrome://settings' : 'https://example.com/'),
    activeTabId: async () => f.activeTab,
    sendToActiveTabs: async (m) => { f.sent.push(m); },
    sendToAllTabs: async (m) => { f.sent.push(m); },
    getTempGrants: async () => f.temp,
    setTempGrants: async (g) => { f.temp = g; },
  };
  return { f, svc: createService(p) };
}

const page: SenderInfo = { tabId: 1, frameId: 0, url: 'http://localhost:4000/page', lifecycle: 'active' };
const SITE = 'http://localhost/*';

async function setup(dueIn = 10 * MIN) {
  const t = fakePlatform();
  const r = await t.svc.admin({ type: 'create', title: 'Take a screen break', dueAt: T0 + dueIn });
  expect(r.ok).toBe(true);
  return t;
}

describe('worker service', () => {
  it('persists before confirming and arms the next alarm', async () => {
    const { f } = await setup();
    expect(f.stored?.reminders[0]?.status).toBe('scheduled');
    expect(f.alarm).toBe(T0 + 10 * MIN);
    expect(f.badge).toBe(0);
  });

  it('a fresh worker reconciles overdue reminders, badge and alarms from storage', async () => {
    const { f } = await setup();
    // Worker was asleep or Chrome was closed; a new instance starts with only storage.
    const t2 = fakePlatform();
    t2.f.stored = f.stored;
    t2.f.clock = T0 + 60 * MIN;
    await t2.svc.reconcile();
    expect(t2.f.stored?.reminders[0]?.status).toBe('due');
    expect(t2.f.badge).toBe(1);
    expect(t2.f.alarm).toBeUndefined();
  });

  it('a stale alarm is harmless for completed/deleted reminders', async () => {
    const { f, svc } = await setup();
    f.clock = T0 + 10 * MIN;
    await svc.reconcile();
    const r = f.stored!.reminders[0]!;
    await svc.admin({ type: 'complete', id: r.id, revision: r.revision, opId: 'x' });
    await svc.reconcile();
    await svc.reconcile();
    expect(f.stored!.reminders[0]!.status).toBe('completed');
    await svc.admin({ type: 'delete', id: r.id });
    await svc.reconcile();
    expect(f.stored!.reminders).toHaveLength(0);
  });

  it('serializes concurrent acknowledgements from two contexts into one transition', async () => {
    const { f, svc } = await setup();
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE });
    f.clock = T0 + 10 * MIN;
    await svc.reconcile();
    const r = f.stored!.reminders[0]!;
    const act = (opId: string) => ({ type: 'act' as const, action: 'complete' as const, id: r.id, occurrenceId: r.occurrenceId, revision: r.revision, opId });
    const [a, b] = await Promise.all([svc.page(act('tab-a'), page), svc.page(act('tab-b'), { ...page, tabId: 2 })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(f.stored!.reminders[0]!.revision).toBe(r.revision + 1);
  });

  it('a failed write reports an error instead of success', async () => {
    const { f, svc } = await setup();
    f.clock = T0 + 10 * MIN;
    await svc.reconcile();
    const r = f.stored!.reminders[0]!;
    f.failSave = true;
    const res = await svc.admin({ type: 'complete', id: r.id, revision: r.revision, opId: 'x' });
    expect(res).toMatchObject({ ok: false, error: 'storage' });
    f.failSave = false;
    expect(f.stored!.reminders[0]!.status).toBe('due');
  });

  it('notification failure does not roll back the due transition, and is not repeated', async () => {
    const { f, svc } = await setup();
    await svc.admin({ type: 'settings', patch: { notifications: true } });
    f.notifyAllowed = true;
    f.clock = T0 + 10 * MIN;
    await svc.reconcile();
    expect(f.notified).toHaveLength(1);
    await svc.reconcile();
    expect(f.notified).toHaveLength(1);

    const t = await setup();
    await t.svc.admin({ type: 'settings', patch: { notifications: true } });
    t.f.notifyAllowed = true;
    t.f.notifyThrows = true;
    t.f.clock = T0 + 10 * MIN;
    await t.svc.reconcile();
    expect(t.f.stored!.reminders[0]!.status).toBe('due');
  });

  it('page access requires an enabled preference AND a Chrome grant; fails closed', async () => {
    const { f, svc } = await setup();
    expect((await svc.page({ type: 'view' }, page))).toMatchObject({ ok: true, view: { remove: true } });
    expect(await svc.admin({ type: 'enableSite', pattern: SITE })).toMatchObject({ ok: false, error: 'not_granted' });
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE, tabId: 1 });
    expect(f.registered).toEqual([SITE]);
    expect(f.injected).toEqual([1]);
    expect((await svc.page({ type: 'view' }, page))).toMatchObject({ ok: true, view: { visible: true, active: true, due: null } });

    // Revoked in Chrome: registration removed, page told to refresh, widget gets "remove".
    f.granted.clear();
    await svc.permissionsRemoved();
    expect(f.registered).toEqual([]);
    expect(f.sent).toContainEqual({ type: 'tuglet:refresh' });
    expect((await svc.page({ type: 'view' }, page))).toMatchObject({ view: { remove: true } });

    // Disabled in Tuglet while Chrome still grants it.
    f.granted.add(SITE);
    await svc.reconcileSites();
    await svc.admin({ type: 'disableSite', pattern: SITE });
    expect(f.registered).toEqual([]);
    expect((await svc.page({ type: 'view' }, page))).toMatchObject({ view: { remove: true } });
  });

  it('rejects subframes, inactive documents and other origins', async () => {
    const { f, svc } = await setup();
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE });
    for (const s of [{ ...page, frameId: 3 }, { ...page, lifecycle: 'prerender' }, { ...page, url: 'https://other.example/' }, { ...page, tabId: undefined }])
      expect((await svc.page({ type: 'view' }, s))).toMatchObject({ view: { remove: true } });
  });

  it('temporary page access is bound to the tab and origin', async () => {
    const { f, svc } = await setup();
    expect(await svc.admin({ type: 'showOnPage', tabId: 9 })).toMatchObject({ ok: false, error: 'ineligible' });
    await svc.admin({ type: 'showOnPage', tabId: 1 });
    expect(f.injected).toEqual([1]);
    expect((await svc.page({ type: 'view' }, page))).toMatchObject({ view: { visible: true } });
    expect((await svc.page({ type: 'view' }, { ...page, tabId: 2 }))).toMatchObject({ view: { remove: true } });
    expect((await svc.page({ type: 'view' }, { ...page, url: 'http://127.0.0.1:4000/' }))).toMatchObject({ view: { remove: true } });
    await svc.dropTab(1);
    expect((await svc.page({ type: 'view' }, page))).toMatchObject({ view: { remove: true } });
  });

  it('page view is generic by default; titles only after the per-site opt-in', async () => {
    const { f, svc } = await setup();
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE });
    f.clock = T0 + 10 * MIN;
    const v1 = await svc.page({ type: 'view' }, page);
    expect(JSON.stringify(v1)).not.toContain('screen break');
    expect(v1).toMatchObject({ view: { due: { label: 'A reminder is due', swing: true }, dueCount: 1 } });
    await svc.admin({ type: 'siteTitles', pattern: SITE, showTitles: true });
    expect(await svc.page({ type: 'view' }, page)).toMatchObject({ view: { due: { label: 'Take a screen break' } } });
  });

  it('presented attention is not replayed on reload or tab switch', async () => {
    const { f, svc } = await setup();
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE });
    f.clock = T0 + 10 * MIN;
    const v = await svc.page({ type: 'view' }, page);
    if (!v.ok || !v.view?.due) throw new Error('no due');
    await svc.page({ type: 'presented', id: v.view.due.id, key: v.view.due.key }, page);
    expect(await svc.page({ type: 'view' }, page)).toMatchObject({ view: { due: { swing: false } } });
  });

  it('only the active tab presents', async () => {
    const { f, svc } = await setup();
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE });
    f.activeTab = 2;
    expect(await svc.page({ type: 'view' }, page)).toMatchObject({ view: { active: false } });
  });

  it('reset clears scheduling, registrations and pages', async () => {
    const { f, svc } = await setup();
    f.granted.add(SITE);
    await svc.admin({ type: 'enableSite', pattern: SITE });
    await svc.admin({ type: 'reset' });
    expect(f.stored).toBeUndefined();
    expect(f.alarm).toBeUndefined();
    expect(f.registered).toEqual([]);
    expect(f.sent).toContainEqual({ type: 'tuglet:remove' });
  });

  it('an unsupported newer schema is never overwritten', async () => {
    const { f, svc } = fakePlatform();
    const future = { schemaVersion: 99, reminders: [{ anything: true }] };
    f.stored = future as unknown as State;
    const r = await svc.admin({ type: 'create', title: 'x', dueAt: T0 + MIN });
    expect(r).toMatchObject({ ok: false, error: 'unsupported_schema' });
    expect(f.stored).toEqual(future);
  });
});

describe('import/export and schema', () => {
  it('round-trips an export', async () => {
    const { f } = await setup();
    const parsed = parseImport(exportJson(f.stored!, T0));
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) expect(parsed.reminders).toEqual(f.stored!.reminders);
  });
  it('keeps HTML-like titles as plain data', async () => {
    const t = fakePlatform();
    await t.svc.admin({ type: 'create', title: '<img src=x onerror=alert(1)>', dueAt: T0 + MIN });
    const parsed = parseImport(exportJson(t.f.stored!, T0));
    expect(parsed.ok && parsed.reminders[0]!.title).toBe('<img src=x onerror=alert(1)>');
  });
  it.each([
    ['not json', '{'],
    ['wrong format', JSON.stringify({ format: 'x' })],
    ['prototype key', '{"format":"tuglet-export","schemaVersion":1,"reminders":[],"settings":{},"__proto__":{"x":1}}'],
    ['bad date', JSON.stringify({ format: 'tuglet-export', schemaVersion: 1, settings: {}, reminders: [{ id: 'a', occurrenceId: 'a', title: 't', originalDueAt: 'tomorrow', effectiveDueAt: 1, createdAt: 1, updatedAt: 1, status: 'due', revision: 1 }] })],
    ['future version', JSON.stringify({ format: 'tuglet-export', schemaVersion: 2, reminders: [], settings: {} })],
    ['oversized', 'x'.repeat(300 * 1024)],
  ])('rejects %s and preserves existing data', async (_, text) => {
    const { f, svc } = await setup();
    const before = structuredClone(f.stored);
    expect(await svc.admin({ type: 'import', text })).toMatchObject({ ok: false });
    expect(f.stored).toEqual(before);
  });
  it('migrates empty storage to a fresh state', () => {
    expect(migrate(undefined)).toEqual({ ok: true, state: emptyState() });
    expect(migrate('garbage')).toMatchObject({ ok: false, error: 'corrupt' });
  });
});

describe('message validation', () => {
  it.each([
    null, 'state', { type: 'nope' }, { type: 'create', title: 'x' }, { type: 'delete', id: '../../x' },
    { type: 'state', extra: 1 }, { type: 'complete', id: 'a', revision: -1, opId: 'o' },
    { type: 'enableSite', pattern: '<all_urls>' }, { type: 'create', title: 'x'.repeat(10_000), dueAt: 1 },
  ])('rejects admin %j', (m) => expect(parseAdmin(m)).toBeNull());
  it('page widgets cannot send admin commands', () => {
    for (const type of ['create', 'delete', 'reset', 'import', 'settings', 'enableSite', 'state']) expect(parsePage({ type })).toBeNull();
    expect(parsePage({ type: 'act', action: 'delete', id: 'a', occurrenceId: 'a', revision: 1, opId: 'o' })).toBeNull();
    expect(parsePage({ type: 'act', action: 'complete', id: 'a', occurrenceId: 'a', revision: 1, opId: 'o' })).not.toBeNull();
  });
});
