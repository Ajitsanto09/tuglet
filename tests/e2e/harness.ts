import { chromium, expect, type Browser, type Page, type Worker } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AdminMessage } from '../../src/shared/messages';
import type { State } from '../../src/shared/types';

export const SITE = 'http://localhost:4173';
export const OTHER_SITE = 'http://127.0.0.1:4173';
const EXT_SOURCE = path.resolve(process.env.TUGLET_EXT ?? 'dist');

/**
 * Launches Playwright's Chromium with a disposable profile and the built extension.
 * `grantLocalhost` copies the build and adds a test-only required host permission for
 * http://localhost/* so flows behind Chrome's (non-automatable) permission prompt can run.
 * The shipped manifest is never modified.
 */
export async function launch(opts: { grantLocalhost?: boolean; userDataDir?: string; extDir?: string } = {}) {
  // Without test grants, an extracted release (TUGLET_EXT) is loaded in place, as a teammate would.
  let extDir = opts.extDir ?? (!opts.grantLocalhost && process.env.TUGLET_EXT ? EXT_SOURCE : undefined);
  if (!extDir) {
    extDir = await mkdtemp(path.join(os.tmpdir(), 'tuglet-ext-'));
    await cp(EXT_SOURCE, extDir, { recursive: true });
    if (opts.grantLocalhost) {
      const mf = JSON.parse(await readFile(path.join(extDir, 'manifest.json'), 'utf8'));
      mf.host_permissions = ['http://localhost/*'];
      await writeFile(path.join(extDir, 'manifest.json'), JSON.stringify(mf));
    }
  }
  const userDataDir = opts.userDataDir ?? (await mkdtemp(path.join(os.tmpdir(), 'tuglet-profile-')));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--enable-unsafe-extension-debugging', '--remote-debugging-port=0'],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2]!;
  const port = (await readFile(path.join(userDataDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const cdp: Browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const browserSession = await cdp.newBrowserCDPSession();

  let adminPage: Page | null = null;
  const attached: Browser[] = [];
  const h = {
    ctx, id, userDataDir, extDir,
    url: (p: string) => `chrome-extension://${id}/${p}`,

    async worker(): Promise<Worker> {
      const w = ctx.serviceWorkers().find((x) => x.url().includes(id));
      if (w) return w;
      await h.extPage(); // waking via a message
      return ctx.serviceWorkers().find((x) => x.url().includes(id)) ?? ctx.waitForEvent('serviceworker');
    },

    /** A background extension tab used for admin calls; opened first so it never steals focus later. */
    async extPage(): Promise<Page> {
      if (!adminPage || adminPage.isClosed()) {
        adminPage = await ctx.newPage();
        await adminPage.goto(h.url('options.html'));
      }
      return adminPage;
    },

    /** Sends an administration command exactly as the popup/options pages do. */
    async admin(m: AdminMessage): Promise<{ ok: boolean; error?: string; message?: string; state?: State }> {
      const p = await h.extPage();
      return p.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
    },

    /** Reads storage directly from an extension page, without waking/sweeping in the worker. */
    async stored(): Promise<State | undefined> {
      const p = await h.extPage();
      return p.evaluate(async () => (await chrome.storage.local.get('tuglet')).tuglet as State | undefined);
    },

    async badge(): Promise<string> {
      const p = await h.extPage();
      return p.evaluate(() => chrome.action.getBadgeText({}));
    },

    /** Clicks the toolbar action for `page` (real activeTab grant) and returns the opened popup. */
    async openPopup(page: Page): Promise<Page> {
      await page.bringToFront();
      const { targetInfos } = await browserSession.send('Target.getTargets', { filter: [{ type: 'tab' }] }) as { targetInfos: { targetId: string; url: string }[] };
      const tab = targetInfos.find((t) => t.url === page.url());
      if (!tab) throw new Error(`no tab target for ${page.url()}`);
      await browserSession.send('Extensions.triggerAction' as never, { id, targetId: tab.targetId } as never);
      // Popups opened by the toolbar action are only discoverable by a fresh CDP attachment.
      let popup: Page | undefined;
      await expect.poll(async () => {
        const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        popup = b.contexts().flatMap((c) => c.pages()).find((p) => p.url().endsWith('popup.html'));
        if (popup) attached.push(b); else await b.close();
        return !!popup;
      }).toBe(true);
      popup = popup!;
      await popup.getByRole('heading', { name: 'New reminder' }).waitFor();
      return popup;
    },

    /** Stops the extension service worker (as Chrome does when idle) via DevTools Protocol. */
    async stopWorker() {
      const p = await h.extPage();
      const s = await ctx.newCDPSession(p);
      let versionId = '';
      let status = '';
      s.on('ServiceWorker.workerVersionUpdated', (e) => {
        for (const v of e.versions) if (v.scriptURL.includes(id)) { versionId = v.versionId; status = v.runningStatus; }
      });
      await s.send('ServiceWorker.enable');
      await expect.poll(() => versionId).not.toBe('');
      await s.send('ServiceWorker.stopWorker', { versionId });
      await expect.poll(() => status, { timeout: 10_000 }).toBe('stopped');
      await s.detach();
    },

    async createDue(title: string, inMs = 1500) {
      const r = await h.admin({ type: 'create', title, dueAt: Date.now() + inMs });
      expect(r.ok, r.message).toBe(true);
      await new Promise((res) => setTimeout(res, inMs + 50));
      await h.admin({ type: 'state' }); // same sweep the popup performs when opened
    },

    async close() {
      for (const b of [cdp, ...attached]) await b.close().catch(() => undefined);
      await ctx.close();
      if (!opts.userDataDir) await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
  await h.extPage();
  return h;
}

export type Harness = Awaited<ReturnType<typeof launch>>;

export const widget = (page: Page) => ({
  wrap: page.locator('tuglet-overlay .wrap'),
  pip: page.locator('tuglet-overlay .pip'),
  msg: page.locator('tuglet-overlay .msg'),
  count: page.locator('tuglet-overlay .count'),
  status: page.locator('tuglet-overlay .status'),
  hang: page.locator('tuglet-overlay .hang'),
  snooze: page.locator('tuglet-overlay').getByRole('button', { name: /Snooze this reminder/ }),
  complete: page.locator('tuglet-overlay').getByRole('button', { name: 'Complete this reminder' }),
  undo: page.locator('tuglet-overlay').getByRole('button', { name: 'Undo completion' }),
  hosts: () => page.locator('tuglet-overlay').count(),
});

/** Drags the character straight down by `dy` CSS px and releases. */
export async function pull(page: Page, dy: number, opts: { beforeRelease?: () => Promise<void> } = {}) {
  const box = await widget(page).pip.boundingBox();
  if (!box) throw new Error('character not visible');
  // Whole-pixel start so boundary pulls (e.g. exactly 120 px) are exact.
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y + (dy * i) / 6);
  await opts.beforeRelease?.();
  await page.mouse.up();
}

/** Enables the site through the real popup ("Always allow"); requires grantLocalhost. */
export async function enableSiteViaPopup(h: Harness, page: Page) {
  const popup = await h.openPopup(page);
  await popup.getByRole('button', { name: /Always allow on/ }).click();
  await expect(popup.getByText('Pip will appear on')).toBeVisible();
  await popup.close();
}
