import type { Platform, TempGrant } from '../background/service';
import type { ToPage } from '../shared/messages';
import type { State } from '../shared/types';

const KEY = 'tuglet';
const NEXT_ALARM = 'tuglet-next';
const RECONCILE_ALARM = 'tuglet-reconcile';
const SCRIPT_ID = 'tuglet-sites';

async function send(tabIds: (number | undefined)[], m: ToPage) {
  await Promise.all(tabIds.map((id) => (id === undefined ? undefined : chrome.tabs.sendMessage(id, m).catch(() => undefined))));
}

export const chromePlatform: Platform = {
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),

  async load() { return (await chrome.storage.local.get(KEY))[KEY]; },
  async save(s: State) { await chrome.storage.local.set({ [KEY]: s }); },
  async clearStore() { await chrome.storage.local.clear(); },

  async setNextAlarm(when) {
    if (when === undefined) await chrome.alarms.clear(NEXT_ALARM);
    else await chrome.alarms.create(NEXT_ALARM, { when });
  },
  async ensureReconcileAlarm() {
    if (!(await chrome.alarms.get(RECONCILE_ALARM))) await chrome.alarms.create(RECONCILE_ALARM, { periodInMinutes: 5 });
  },

  async setBadge(count) {
    await chrome.action.setBadgeText({ text: count === 0 ? '' : count > 99 ? '99+' : String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#C2410C' });
    await chrome.action.setTitle({ title: count ? `Tuglet: ${count} reminder${count === 1 ? '' : 's'} due` : 'Tuglet reminders' });
  },

  async notificationsAllowed() {
    return (await chrome.permissions.contains({ permissions: ['notifications'] })) && !!chrome.notifications;
  },
  async notify(id, message) {
    await chrome.notifications.create(id, {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/128.png'), title: 'Tuglet', message, silent: true, priority: 0,
    });
  },
  async clearNotification(id) { if (chrome.notifications) await chrome.notifications.clear(id); },

  isGranted: (pattern) => chrome.permissions.contains({ origins: [pattern] }),

  async registerSites(patterns) {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    if (!patterns.length) return;
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID, matches: patterns, js: ['content.js'], runAt: 'document_idle', allFrames: false, persistAcrossSessions: true,
    }]);
  },
  async inject(tabId) {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] });
  },
  async tabUrl(tabId) { return (await chrome.tabs.get(tabId)).url; },

  async activeTabId() {
    const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const [t] = await chrome.tabs.query({ active: true, windowId: w.id });
    return t?.id;
  },
  async sendToActiveTabs(m) { await send((await chrome.tabs.query({ active: true })).map((t) => t.id), m); },
  async sendToAllTabs(m) { await send((await chrome.tabs.query({})).map((t) => t.id), m); },

  async getTempGrants() {
    return ((await chrome.storage.session.get('tempGrants')).tempGrants as TempGrant[] | undefined) ?? [];
  },
  async setTempGrants(g) { await chrome.storage.session.set({ tempGrants: g }); },
};
