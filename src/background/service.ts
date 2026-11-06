import {
  type ActInput, type Result, attentionKey, complete, create, dueQueue, edit, markPresented, nextWakeAt,
  remove, snooze, sweep, undo, updateSettings,
} from '../domain/engine';
import { type Loaded, migrate, parseImport } from '../domain/schema';
import { patternMatches, sitePatternFor } from '../domain/sites';
import type { AdminMessage, PageMessage, ToPage } from '../shared/messages';
import { type Fail, type PageView, type State } from '../shared/types';

/** Everything the worker needs from Chrome, behind a narrow, fakeable surface. */
export interface Platform {
  now(): number;
  newId(): string;
  load(): Promise<unknown>;
  save(s: State): Promise<void>;
  clearStore(): Promise<void>;
  setNextAlarm(when: number | undefined): Promise<void>;
  ensureReconcileAlarm(): Promise<void>;
  setBadge(count: number): Promise<void>;
  notificationsAllowed(): Promise<boolean>;
  notify(id: string, message: string): Promise<void>;
  clearNotification(id: string): Promise<void>;
  isGranted(pattern: string): Promise<boolean>;
  registerSites(patterns: string[]): Promise<void>;
  inject(tabId: number): Promise<void>;
  tabUrl(tabId: number): Promise<string | undefined>;
  activeTabId(): Promise<number | undefined>;
  sendToActiveTabs(m: ToPage): Promise<void>;
  sendToAllTabs(m: ToPage): Promise<void>;
  getTempGrants(): Promise<TempGrant[]>;
  setTempGrants(g: TempGrant[]): Promise<void>;
}

export interface TempGrant { tabId: number; origin: string }
export interface SenderInfo { tabId?: number; frameId?: number; url?: string; lifecycle?: string }

export type AdminResponse = ({ ok: true; duplicate?: boolean; warning?: string } | Fail) & { state?: State; now?: number };
export type PageResponse = { ok: true; view?: PageView } | Fail;

const notificationId = (id: string) => `tuglet:${id}`;
const fail = (error: string, message: string): Fail => ({ ok: false, error, message });
const STORAGE_FAIL = fail('storage', 'Tuglet could not save that change. Nothing was acknowledged; please try again.');

export function createService(p: Platform) {
  let chain: Promise<unknown> = Promise.resolve();
  /** Serializes all reads-modify-writes within this worker instance. */
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = chain.then(fn);
    chain = r.catch(() => undefined);
    return r;
  };

  async function read(): Promise<Loaded | Fail> {
    try { return migrate(await p.load()); } catch { return fail('storage', 'Tuglet could not read saved reminders.'); }
  }

  const quietly = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* effects are repaired by reconciliation */ } };

  /**
   * Load → sweep overdue → apply → persist → side effects. Success is only
   * reported after the write resolves.
   */
  function mutate(apply: (s: State, now: number) => Result): Promise<{ ok: true; state: State; duplicate?: boolean } | Fail> {
    return serial(async () => {
      const loaded = await read();
      if (!loaded.ok) return loaded as Fail;
      const now = p.now();
      const swept = sweep(loaded.state, now).state;
      const res = apply(swept, now);
      let next = res.ok ? res.state : swept;
      const toNotify: State['reminders'] = [];
      if (next.settings.notifications && next.reminders.some((r) => r.status === 'due' && r.notifiedKey !== attentionKey(r)) && (await p.notificationsAllowed().catch(() => false))) {
        next = {
          ...next,
          reminders: next.reminders.map((r) => {
            if (r.status !== 'due' || r.notifiedKey === attentionKey(r)) return r;
            toNotify.push(r);
            return { ...r, notifiedKey: attentionKey(r) };
          }),
        };
      }
      if (next !== loaded.state) {
        try { await p.save(next); } catch { return STORAGE_FAIL; }
      }
      await effects(loaded.state, next, toNotify);
      return res.ok ? { ok: true as const, state: next, duplicate: res.duplicate } : res;
    });
  }

  async function effects(prev: State, next: State, toNotify: State['reminders']) {
    await quietly(() => p.setNextAlarm(nextWakeAt(next)));
    await quietly(() => p.ensureReconcileAlarm());
    await quietly(() => p.setBadge(dueQueue(next).length));
    for (const r of toNotify) {
      const text = next.settings.notificationTitles ? r.title : 'A Tuglet reminder is due.';
      await quietly(() => p.notify(notificationId(r.id), text));
    }
    const stillDue = new Set(dueQueue(next).map((r) => r.id));
    for (const r of prev.reminders) if (r.status === 'due' && !stillDue.has(r.id)) await quietly(() => p.clearNotification(notificationId(r.id)));
    if (prev !== next) await quietly(() => p.sendToActiveTabs({ type: 'tuglet:refresh' }));
  }

  const identity = (s: State): Result => ({ ok: true, state: s });

  async function reconcileSites(): Promise<void> {
    const loaded = await read();
    if (!loaded.ok) return;
    const granted: string[] = [];
    for (const s of loaded.state.sites) if (await p.isGranted(s.pattern).catch(() => false)) granted.push(s.pattern);
    await p.registerSites(granted);
  }

  /** Startup/alarm/permission recovery: sweep, re-arm alarms, badge, registrations. */
  async function reconcile() {
    await mutate(identity);
    await quietly(reconcileSites);
  }

  async function admin(m: AdminMessage): Promise<AdminResponse> {
    const withState = async (r: { ok: true; state: State; duplicate?: boolean } | Fail, warning?: string): Promise<AdminResponse> => {
      if (r.ok) return { ok: true, duplicate: r.duplicate, warning, state: r.state, now: p.now() };
      const cur = await read();
      return { ...r, state: cur.ok ? cur.state : undefined, now: p.now() };
    };
    switch (m.type) {
      case 'state': return withState(await mutate(identity));
      case 'create': return withState(await mutate((s, now) => create(s, m, now, p.newId())));
      case 'edit': return withState(await mutate((s, now) => edit(s, m, now, p.newId())));
      case 'delete': return withState(await mutate((s) => remove(s, m.id)));
      case 'snooze': return withState(await mutate((s, now) => snooze(s, m, now)));
      case 'complete': return withState(await mutate((s, now) => complete(s, m, now)));
      case 'undo': return withState(await mutate((s, now) => undo(s, m, now)));
      case 'settings': return withState(await mutate((s) => updateSettings(s, m.patch)));
      case 'siteTitles': return withState(await mutate((s) => ({ ok: true, state: { ...s, sites: s.sites.map((x) => (x.pattern === m.pattern ? { ...x, showTitles: m.showTitles } : x)) } })));
      case 'enableSite': {
        if (!(await p.isGranted(m.pattern).catch(() => false))) return withState(fail('not_granted', 'Chrome has not granted access to this site.'));
        const r = await mutate((s) => ({ ok: true, state: s.sites.some((x) => x.pattern === m.pattern) ? s : { ...s, sites: [...s.sites, { pattern: m.pattern, showTitles: false }] } }));
        if (!r.ok) return withState(r);
        await quietly(reconcileSites);
        let warning: string | undefined;
        if (m.tabId !== undefined) {
          const url = await p.tabUrl(m.tabId).catch(() => undefined);
          if (sitePatternFor(url) === m.pattern) await p.inject(m.tabId).catch(() => { warning = 'Enabled, but Tuglet could not appear on this page. Reload it or use the toolbar list.'; });
        }
        return withState(r, warning);
      }
      case 'disableSite': {
        const r = await mutate((s) => ({ ok: true, state: { ...s, sites: s.sites.filter((x) => x.pattern !== m.pattern) } }));
        await quietly(reconcileSites);
        await quietly(() => p.sendToAllTabs({ type: 'tuglet:refresh' }));
        return withState(r);
      }
      case 'showOnPage': {
        const url = await p.tabUrl(m.tabId).catch(() => undefined);
        if (!sitePatternFor(url)) return withState(fail('ineligible', 'Tuglet cannot appear on this page. Your reminders stay in this list and on the badge.'));
        const origin = new URL(url as string).origin;
        const grants = (await p.getTempGrants()).filter((g) => g.tabId !== m.tabId).slice(-49);
        await p.setTempGrants([...grants, { tabId: m.tabId, origin }]);
        try { await p.inject(m.tabId); } catch {
          await p.setTempGrants(grants);
          return withState(fail('inject_failed', 'Tuglet could not appear on this page. Use this list and the badge instead.'));
        }
        return withState(await mutate(identity));
      }
      case 'import': {
        const parsed = parseImport(m.text);
        if (!parsed.ok) return withState(parsed);
        return withState(await mutate((s) => ({ ok: true, state: { ...s, reminders: parsed.reminders, settings: parsed.settings, recentOps: [], lastCompletion: undefined } })));
      }
      case 'reset': return serial(async () => {
        const loaded = await read();
        try { await p.clearStore(); } catch { return STORAGE_FAIL; }
        if (loaded.ok) for (const r of loaded.state.reminders) await quietly(() => p.clearNotification(notificationId(r.id)));
        await quietly(() => p.setNextAlarm(undefined));
        await quietly(() => p.setBadge(0));
        await quietly(() => p.registerSites([]));
        await quietly(() => p.setTempGrants([]));
        await quietly(() => p.sendToAllTabs({ type: 'tuglet:remove' }));
        const fresh = await read();
        return { ok: true as const, state: fresh.ok ? fresh.state : undefined, now: p.now() };
      });
    }
  }

  async function authorizePage(sender: SenderInfo, state: State): Promise<{ showTitles: boolean } | null> {
    const { tabId, url } = sender;
    if (tabId === undefined || sender.frameId !== 0 || !sitePatternFor(url)) return null;
    if (sender.lifecycle && sender.lifecycle !== 'active') return null;
    const site = state.sites.find((x) => patternMatches(x.pattern, url));
    if (site && (await p.isGranted(site.pattern).catch(() => false))) return { showTitles: site.showTitles };
    const origin = new URL(url as string).origin;
    if ((await p.getTempGrants().catch(() => [])).some((g) => g.tabId === tabId && g.origin === origin)) return { showTitles: false };
    return null; // fail closed
  }

  async function page(m: PageMessage, sender: SenderInfo): Promise<PageResponse> {
    const cur = await mutate(identity);
    if (!cur.ok) return cur;
    const access = await authorizePage(sender, cur.state);
    if (!access) return m.type === 'view' ? { ok: true, view: { remove: true } as PageView } : fail('forbidden', 'Tuglet is not enabled on this page.');
    switch (m.type) {
      case 'view': {
        const s = cur.state;
        const queue = dueQueue(s);
        const top = queue[0];
        const active = sender.tabId === (await p.activeTabId().catch(() => undefined));
        return {
          ok: true,
          view: {
            visible: queue.length > 0 || s.reminders.some((r) => r.status === 'scheduled' || r.status === 'snoozed'),
            active,
            due: top ? {
              id: top.id, occurrenceId: top.occurrenceId, revision: top.revision, key: attentionKey(top),
              label: access.showTitles ? top.title : 'A reminder is due', swing: top.presentedKey !== attentionKey(top),
            } : null,
            dueCount: queue.length,
            position: s.settings.position,
            motion: !s.settings.pauseAnimation,
            snoozeMinutes: s.settings.snoozeMinutes,
          },
        };
      }
      case 'act': {
        const input: ActInput = { id: m.id, occurrenceId: m.occurrenceId, revision: m.revision, opId: m.opId };
        const r = await mutate((s, now) => {
          if (!s.recentOps.includes(m.opId) && dueQueue(s)[0]?.id !== m.id) return fail('stale', 'A different reminder is showing now.');
          return m.action === 'snooze' ? snooze(s, input, now) : complete(s, input, now);
        });
        return r.ok ? { ok: true } : r;
      }
      case 'pageUndo': {
        const r = await mutate((s, now) => undo(s, m, now));
        return r.ok ? { ok: true } : r;
      }
      case 'presented': {
        const r = await mutate((s) => ({ ok: true, state: markPresented(s, m.id, m.key) }));
        return r.ok ? { ok: true } : r;
      }
    }
  }

  async function dropTab(tabId: number) {
    await quietly(async () => p.setTempGrants((await p.getTempGrants()).filter((g) => g.tabId !== tabId)));
  }

  async function permissionsRemoved() {
    await quietly(reconcileSites);
    await quietly(() => p.sendToAllTabs({ type: 'tuglet:refresh' }));
  }

  return { admin, page, reconcile, reconcileSites, permissionsRemoved, dropTab };
}
