// Smoke-tests a built extension in installed Google Chrome (branded builds ignore --load-extension,
// so this loads it through the DevTools Protocol). Disposable profile; synthetic data only.
// Usage: node scripts/chrome-smoke.mjs [extensionDir]   (opens a visible Chrome window briefly)
import { chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const extDir = path.resolve(process.argv[2] ?? 'dist');
const profile = await mkdtemp(path.join(os.tmpdir(), 'tuglet-chrome-'));
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  // Same as turning on Developer mode at chrome://extensions, required for unpacked extensions.
  await page.goto('chrome://extensions/');
  await page.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  const s = await ctx.browser().newBrowserCDPSession();
  const { id } = await s.send('Extensions.loadUnpacked', { path: extDir });
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${id}/options.html`);
  const version = await opts.evaluate(() => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1]);
  const create = await opts.evaluate(() => chrome.runtime.sendMessage({ type: 'create', title: 'Chrome smoke', dueAt: Date.now() + 1500 }));
  await page.waitForTimeout(2000);
  const state = await opts.evaluate(() => chrome.runtime.sendMessage({ type: 'state' }));
  const badge = await opts.evaluate(() => chrome.action.getBadgeText({}));
  const restricted = await opts.evaluate(() => chrome.storage.local.get('tuglet').then((r) => !!r.tuglet));
  console.log(JSON.stringify({ chrome: version, extensionId: id, created: create.ok, status: state.state?.reminders?.[0]?.status, badge, optionsPageReadsStorage: restricted }, null, 2));
  if (!create.ok || state.state?.reminders?.[0]?.status !== 'due' || badge !== '1') process.exitCode = 1;
} finally {
  await ctx.close();
  await rm(profile, { recursive: true, force: true });
}
