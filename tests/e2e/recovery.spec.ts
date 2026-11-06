import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { enableSiteViaPopup, launch, SITE, widget } from './harness';

test('real chrome.alarms delivery wakes a stopped worker; popup closed', async () => {
  const h = await launch({ grantLocalhost: true });
  try {
    const page = await h.ctx.newPage();
    await page.goto(`${SITE}/`);
    await enableSiteViaPopup(h, page);
    const r = await h.admin({ type: 'create', title: 'Alarm smoke', dueAt: Date.now() + 20_000 });
    expect(r.ok).toBe(true);
    await h.stopWorker();
    // From here nothing messages the worker; only the alarm can wake it.
    await expect.poll(async () => (await h.stored())?.reminders[0]?.status, { timeout: 60_000, intervals: [1000] }).toBe('due');
    expect(await h.badge()).toBe('1');
    await expect(widget(page).wrap).toHaveAttribute('data-state', 'due', { timeout: 10_000 });
  } finally {
    await h.close();
  }
});

test('reminders, site registration and settings survive a browser restart', async () => {
  const first = await launch({ grantLocalhost: true });
  const { userDataDir, extDir } = first;
  const page = await first.ctx.newPage();
  await page.goto(`${SITE}/`);
  await enableSiteViaPopup(first, page);
  await first.admin({ type: 'create', title: 'Survives restart', dueAt: Date.now() + 2_500 });
  await first.admin({ type: 'settings', patch: { position: 'left', snoozeMinutes: 10 } });
  await first.ctx.close(); // Chrome closed before the reminder was due

  await new Promise((r) => setTimeout(r, 3000));
  const second = await launch({ userDataDir, extDir });
  try {
    const p2 = await second.ctx.newPage();
    await p2.goto(`${SITE}/`);
    // Catch-up on startup: becomes due without the popup, widget appears via the persisted registration.
    await expect(widget(p2).wrap).toHaveAttribute('data-state', 'due', { timeout: 15_000 });
    await expect(widget(p2).wrap).toHaveClass(/left/);
    await expect(widget(p2).snooze).toHaveText('Snooze 10 min');
    expect(await second.badge()).toBe('1');
  } finally {
    await second.close();
  }
});

test('in-place upgrade keeps data; stale pages recover after refresh', async () => {
  const h = await launch({ grantLocalhost: true });
  try {
    const page = await h.ctx.newPage();
    await page.goto(`${SITE}/`);
    await enableSiteViaPopup(h, page);
    await h.createDue('Upgrade me');
    await expect(widget(page).wrap).toHaveAttribute('data-state', 'due');

    const mfPath = path.join(h.extDir, 'manifest.json');
    const mf = JSON.parse(await readFile(mfPath, 'utf8'));
    await writeFile(mfPath, JSON.stringify({ ...mf, version: '0.1.1' }));
    // Exactly what a teammate does: Developer mode on, then Reload at chrome://extensions.
    const settings = await h.ctx.newPage();
    await settings.goto('chrome://extensions/');
    await settings.evaluate(async (id) => {
      const dp = (chrome as unknown as { developerPrivate: { updateProfileConfiguration(c: object): Promise<void>; reload(id: string, o: object): Promise<void> } }).developerPrivate;
      await dp.updateProfileConfiguration({ inDeveloperMode: true });
      await dp.reload(id, { failQuietly: false });
    }, h.id);
    await settings.close();
    await expect.poll(async () => {
      const p = await h.ctx.newPage();
      try {
        await p.goto(h.url('options.html'));
        return await p.evaluate(() => chrome.runtime.getManifest().version);
      } catch { return ''; } finally { await p.close(); }
    }, { timeout: 15_000 }).toBe('0.1.1');
    await page.bringToFront();

    // The old content script is orphaned; it tears itself down on its next contact.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => widget(page).hosts(), { timeout: 10_000 }).toBe(0);
    await page.reload();
    await expect(widget(page).wrap).toHaveAttribute('data-state', 'due', { timeout: 10_000 });
    const opts = await h.ctx.newPage();
    await opts.goto(h.url('options.html'));
    const s = await opts.evaluate(async () => (await chrome.storage.local.get('tuglet')).tuglet as { reminders: { title: string }[] });
    expect(s.reminders.map((r) => r.title)).toEqual(['Upgrade me']);
  } finally {
    await h.close();
  }
});
