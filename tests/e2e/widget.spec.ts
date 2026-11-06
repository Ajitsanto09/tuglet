import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { enableSiteViaPopup, launch, pull, SITE, widget, type Harness } from './harness';

// Test-only build adds a required http://localhost/* grant (Chrome's prompt cannot be automated).
let h: Harness;
let page: Page;
test.beforeEach(async () => {
  h = await launch({ grantLocalhost: true });
  page = await h.ctx.newPage();
  await page.goto(`${SITE}/`);
  await enableSiteViaPopup(h, page);
});
test.afterEach(async () => { await h.close(); });

const statusOf = async (title: string) => (await h.stored())!.reminders.find((r) => r.title === title)?.status;

test('enable site registers only that match and survives reload; one widget per document', async () => {
  const scripts = await (await h.extPage()).evaluate(() => chrome.scripting.getRegisteredContentScripts());
  expect(scripts.map((s) => s.matches)).toEqual([['http://localhost/*']]);
  await h.admin({ type: 'create', title: 'Idle reminder', dueAt: Date.now() + 3_600_000 });
  await expect(widget(page).wrap).toHaveAttribute('data-state', 'idle');
  await page.reload();
  await expect(widget(page).wrap).toHaveAttribute('data-state', 'idle');
  const popup = await h.openPopup(page);
  await expect(popup.getByText('Pip is on for')).toBeVisible();
  await popup.close();
  expect(await widget(page).hosts()).toBe(1);
});

test('due swings once, is not replayed on reload, and respects reduced motion', async () => {
  await h.createDue('Swing check');
  const w = widget(page);
  await expect(w.wrap).toHaveAttribute('data-state', 'due');
  await expect(w.hang).toHaveClass(/swing/);
  await expect(w.hang).not.toHaveClass(/swing/, { timeout: 6000 }); // stops within 5 s
  await page.reload();
  await expect(w.wrap).toHaveAttribute('data-state', 'due');
  await page.waitForTimeout(300);
  await expect(w.hang).not.toHaveClass(/swing/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await h.createDue('Second due');
  await expect(w.count).toHaveText('1 of 2 due');
  expect(await w.hang.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
});

test('pull boundaries: 23 px cancels, 24 px snoozes, 119 snoozes, 120 completes; final position wins', async () => {
  const w = widget(page);
  await h.createDue('Boundary A');
  await pull(page, 23);
  await page.waitForTimeout(300);
  expect(await statusOf('Boundary A')).toBe('due');
  await pull(page, 24);
  await expect.poll(() => statusOf('Boundary A')).toBe('snoozed');

  await h.createDue('Boundary B');
  await pull(page, 119);
  await expect.poll(() => statusOf('Boundary B')).toBe('snoozed');

  await h.createDue('Boundary C');
  await pull(page, 120);
  await expect.poll(() => statusOf('Boundary C')).toBe('completed');
  await expect(w.status).toHaveText('Completed.');
  await w.undo.click();
  await expect.poll(() => statusOf('Boundary C')).toBe('due');

  // Cross the full threshold, retreat to the short range, release: snooze.
  const box = (await w.pip.boundingBox())!;
  await page.mouse.move(box.x + 32, box.y + 32);
  await page.mouse.down();
  await page.mouse.move(box.x + 32, box.y + 32 + 170, { steps: 5 });
  await expect(page.locator('tuglet-overlay .armed')).toHaveText('Release to complete');
  await page.mouse.move(box.x + 32, box.y + 32 + 60, { steps: 5 });
  await expect(page.locator('tuglet-overlay .armed')).toHaveText(/Release to snooze/);
  await page.mouse.up();
  await expect.poll(() => statusOf('Boundary C')).toBe('snoozed');
});

test('cancelled gestures leave the reminder unchanged', async () => {
  await h.createDue('Cancel me');
  const w = widget(page);
  await expect(w.wrap).toHaveAttribute('data-state', 'due');

  await pull(page, 150, { beforeRelease: async () => { await page.keyboard.press('Escape'); } });
  await pull(page, 150, { beforeRelease: async () => {
    await w.pip.evaluate((el) => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  } });
  await pull(page, 150, { beforeRelease: async () => {
    await w.pip.evaluate((el) => el.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true })));
  } });
  await pull(page, 150, { beforeRelease: async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  } });
  await page.waitForTimeout(400);
  expect(await statusOf('Cancel me')).toBe('due');
  await expect(w.wrap).not.toHaveClass(/dragging/);
  // The page's own Escape handling is untouched when not dragging.
  await page.keyboard.press('Escape');
});

test('buttons and keyboard alternatives work without dragging', async () => {
  await h.createDue('Keyboard snooze');
  const w = widget(page);
  await w.snooze.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => statusOf('Keyboard snooze')).toBe('snoozed');
  await h.createDue('Keyboard complete');
  await w.complete.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => statusOf('Keyboard complete')).toBe('completed');
  await expect(page.locator('tuglet-overlay .sr')).toHaveText(/completed/i);
});

test('multiple due reminders show in stable order with a count', async () => {
  await h.admin({ type: 'siteTitles', pattern: 'http://localhost/*', showTitles: true });
  const at = Date.now() + 1200;
  for (const t of ['Second', 'First']) await h.admin({ type: 'create', title: t, dueAt: t === 'First' ? at - 100 : at });
  await h.admin({ type: 'create', title: 'Third', dueAt: at + 100 });
  await page.waitForTimeout(1500);
  await h.admin({ type: 'state' });
  const w = widget(page);
  await expect(w.msg).toHaveText('First');
  await expect(w.count).toHaveText('1 of 3 due');
  await w.complete.click();
  await expect(w.msg).toHaveText('Second');
  await expect(w.count).toHaveText('1 of 2 due');
  expect(await h.badge()).toBe('2');
});

test('HTML-like titles render as plain text', async () => {
  await h.admin({ type: 'siteTitles', pattern: 'http://localhost/*', showTitles: true });
  const title = '<img src=x onerror="window.__pwned=1"><b>bold</b>';
  await h.createDue(title);
  const w = widget(page);
  await expect(w.msg).toHaveText(title);
  expect(await page.locator('tuglet-overlay img, tuglet-overlay b').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('two tabs: only the selected tab presents; a stale acknowledgement cannot act twice', async () => {
  await h.createDue('Shared reminder');
  const tabA = page;
  const tabB = await h.ctx.newPage();
  await tabB.goto(`${SITE}/?b`);
  await expect(widget(tabB).wrap).toHaveAttribute('data-state', 'due');
  await expect(widget(tabA).wrap).toBeHidden();

  const r = (await h.stored())!.reminders[0]!;
  await widget(tabB).complete.click();
  await expect.poll(() => statusOf('Shared reminder')).toBe('completed');
  // Tab A replays its stale view of the same reminder.
  const stale = await (await h.extPage()).evaluate(async ({ id, occurrenceId, revision }) => {
    const [tab] = await chrome.tabs.query({ url: 'http://localhost/*' });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: (m) => chrome.runtime.sendMessage(m),
      args: [{ type: 'act', action: 'complete', id, occurrenceId, revision, opId: crypto.randomUUID() }],
    });
    return res!.result;
  }, r);
  expect(stale).toMatchObject({ ok: false });
  expect((await h.stored())!.reminders[0]!.revision).toBe(r.revision + 1);
});

test('turning the site off removes the widget even though Chrome still grants access', async () => {
  await h.createDue('Revoke me');
  const w = widget(page);
  await expect(w.wrap).toBeVisible();
  const box = (await w.pip.boundingBox())!;
  await page.mouse.move(box.x + 32, box.y + 32);
  await page.mouse.down();
  await page.mouse.move(box.x + 32, box.y + 150, { steps: 4 });
  const opts = await h.extPage();
  await opts.reload();
  await opts.getByRole('button', { name: 'Turn off', exact: true }).click();
  await page.bringToFront();
  await expect.poll(() => w.hosts()).toBe(0);
  await page.mouse.up();
  expect(await statusOf('Revoke me')).toBe('due');
  expect(await opts.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
  await page.reload();
  await page.waitForTimeout(500);
  expect(await w.hosts()).toBe(0);
});

test('revoking access in Chrome settings removes the widget and stops injection', async () => {
  await h.createDue('Chrome revoke');
  const w = widget(page);
  await expect(w.wrap).toBeVisible();
  const settings = await h.ctx.newPage();
  await settings.goto('chrome://extensions/');
  await settings.evaluate((id) => (chrome as unknown as { developerPrivate: { removeHostPermission(i: string, h: string): Promise<void> } }).developerPrivate.removeHostPermission(id, 'http://localhost/*'), h.id);
  await settings.close();
  await page.bringToFront();
  await expect.poll(() => w.hosts()).toBe(0);
  await page.reload();
  await page.waitForTimeout(500);
  expect(await w.hosts()).toBe(0);
  expect(await h.badge()).toBe('1');
});

test('strict CSP and hostile page CSS: widget works and the page is untouched', async () => {
  const csp: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await page.goto(`${SITE}/fixtures/strict.html`);
  const before = await page.locator('#title').evaluate((e) => getComputedStyle(e).cssText || `${getComputedStyle(e).color}|${getComputedStyle(e).fontFamily}`);
  await h.createDue('Strict page reminder');
  const w = widget(page);
  await expect(w.wrap).toHaveAttribute('data-state', 'due');
  // The page's `transform: scale(3)`, `all: unset` and `display: none` rules do not leak in.
  expect(await w.pip.evaluate((e) => [getComputedStyle(e).width, getComputedStyle(e).transform])).toEqual(['64px', 'none']);
  await expect(w.snooze).toBeVisible();
  const after = await page.locator('#title').evaluate((e) => getComputedStyle(e).cssText || `${getComputedStyle(e).color}|${getComputedStyle(e).fontFamily}`);
  expect(after).toBe(before);
  // Page controls outside the widget still work.
  await page.locator('#pagebtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-clicked', 'yes');
  await w.complete.click();
  await expect.poll(() => statusOf('Strict page reminder')).toBe('completed');
  expect(csp).toEqual([]);
});

test('SPA navigation keeps a single widget', async () => {
  await page.goto(`${SITE}/fixtures/spa.html`);
  await h.createDue('SPA reminder');
  await expect(widget(page).wrap).toHaveAttribute('data-state', 'due');
  await page.locator('#one').click();
  await page.locator('#two').click();
  await expect(page).toHaveURL(/spa\/two/);
  expect(await widget(page).hosts()).toBe(1);
  await expect(widget(page).wrap).toHaveAttribute('data-state', 'due');
});

test('failed storage write shows an error and does not complete', async () => {
  await h.createDue('Quota test');
  const opts = await h.extPage();
  // Fill chrome.storage.local to its 10 MB quota so the next write fails.
  const fillKeys = await opts.evaluate(async () => {
    const keys: string[] = [];
    for (const size of [1 << 20, 1 << 16, 1 << 12, 1 << 8, 16]) {
      for (;;) {
        const key = `fill${keys.length}`;
        try { await chrome.storage.local.set({ [key]: 'x'.repeat(size) }); keys.push(key); } catch { break; }
      }
    }
    return keys;
  });
  const w = widget(page);
  await w.complete.click();
  await expect(w.status).toContainText('could not save');
  expect(await statusOf('Quota test')).toBe('due');
  await opts.evaluate((keys) => chrome.storage.local.remove(keys), fillKeys);
  await w.complete.click();
  await expect.poll(() => statusOf('Quota test')).toBe('completed');
});

test('export, reset and import round-trip; corrupt import is rejected', async () => {
  await h.admin({ type: 'create', title: 'Round trip', dueAt: Date.now() + 3_600_000 });
  const opts = await h.extPage();
  await opts.reload();
  // Capture the Blob the Export button downloads (the CDP attachments used for the popup
  // override Playwright's download handling, so read the Blob itself).
  await opts.evaluate(() => {
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob) => { void (b as Blob).text().then((t) => { (window as unknown as { __export: string }).__export = t; }); return orig(b); };
  });
  await opts.getByRole('button', { name: 'Export reminders' }).click();
  await expect.poll(() => opts.evaluate(() => (window as unknown as { __export?: string }).__export)).toContain('tuglet-export');
  const file = test.info().outputPath('export.json');
  await writeFile(file, await opts.evaluate(() => (window as unknown as { __export: string }).__export));

  await opts.getByRole('button', { name: 'Reset all Tuglet data…' }).click();
  await opts.getByRole('button', { name: 'Delete everything' }).click();
  await expect(opts.getByText('All Tuglet data was removed.')).toBeVisible();
  await expect.poll(() => widget(page).hosts()).toBe(0);
  expect(await h.stored()).toBeUndefined();
  expect(await opts.evaluate(() => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
  expect(await opts.evaluate(() => chrome.alarms.get('tuglet-next'))).toBeFalsy();

  opts.once('dialog', (d) => d.accept());
  await opts.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"tuglet-export","schemaVersion":1,"reminders":[{"id":"x"}],"settings":{}}') });
  await expect(opts.getByText('invalid reminders or settings')).toBeVisible();
  opts.once('dialog', (d) => d.accept());
  await opts.locator('input[type=file]').setInputFiles(file);
  await expect(opts.getByText('Imported.')).toBeVisible();
  expect((await h.stored())!.reminders.map((r) => r.title)).toEqual(['Round trip']);
  expect(await opts.evaluate(() => chrome.alarms.get('tuglet-next'))).toBeTruthy();
});
