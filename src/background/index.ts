import { createService, type SenderInfo } from './service';
import { chromePlatform } from '../platform/chrome';
import { parseAdmin, parsePage } from '../shared/messages';

// Keep stored reminders out of content scripts; only the worker and our pages read storage.
const restricted = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);

const svc = createService(chromePlatform);
const extensionOrigin = chrome.runtime.getURL('');

// Listeners are registered synchronously at load so Chrome can wake the worker for them.
chrome.runtime.onMessage.addListener((raw: unknown, sender, reply) => {
  const handle = async () => {
    await restricted;
    if (sender.id !== chrome.runtime.id) return { ok: false, error: 'forbidden', message: 'Unknown sender.' };
    const trusted = !!sender.url?.startsWith(extensionOrigin);
    if (trusted) {
      const m = parseAdmin(raw);
      return m ? svc.admin(m) : { ok: false, error: 'invalid', message: 'Unsupported request.' };
    }
    const m = parsePage(raw);
    if (!m || !sender.tab) return { ok: false, error: 'invalid', message: 'Unsupported request.' };
    const info: SenderInfo = { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url, lifecycle: sender.documentLifecycle };
    return svc.page(m, info);
  };
  handle().then(reply, () => reply({ ok: false, error: 'internal', message: 'Tuglet hit an unexpected error. Please try again.' }));
  return true;
});

chrome.alarms.onAlarm.addListener(() => void svc.reconcile());
chrome.runtime.onStartup.addListener(() => void svc.reconcile());
chrome.runtime.onInstalled.addListener(() => void svc.reconcile());
chrome.permissions.onRemoved.addListener(() => void svc.permissionsRemoved());
chrome.permissions.onAdded.addListener(() => void svc.reconcileSites());
chrome.tabs.onRemoved.addListener((tabId) => void svc.dropTab(tabId));
// Refresh the newly selected tab and the one it replaced (whose widget must go quiet).
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const key = `active:${windowId}`;
  void chrome.storage.session.get(key).then((prev) => {
    for (const id of new Set([tabId, prev[key] as number | undefined])) if (id !== undefined) chrome.tabs.sendMessage(id, { type: 'tuglet:refresh' }).catch(() => undefined);
    return chrome.storage.session.set({ [key]: tabId });
  });
});
chrome.windows.onFocusChanged.addListener(() => {
  chrome.tabs.query({ active: true }).then((tabs) => tabs.forEach((t) => t.id !== undefined && chrome.tabs.sendMessage(t.id, { type: 'tuglet:refresh' }).catch(() => undefined)));
});

// A fresh worker instance (after suspension, crash or update) always re-derives schedule from storage.
void svc.reconcile();
