import { expect, test } from '@playwright/test';
import { launch, OTHER_SITE, SITE, widget, type Harness } from './harness';

// Uses the exact shipped manifest (no test grants).
let h: Harness;
test.beforeEach(async () => { h = await launch(); });
test.afterEach(async () => { await h.close(); });

test('fresh install requests no site or notification access', async () => {
  const perms = await (await h.extPage()).evaluate(() => chrome.permissions.getAll());
  expect(perms.origins).toEqual([]);
  expect(perms.permissions?.sort()).toEqual(['activeTab', 'alarms', 'scripting', 'storage']);
  const mf = await (await h.extPage()).evaluate(() => chrome.runtime.getManifest());
  expect(mf.host_permissions ?? []).toEqual([]);
  expect(mf.content_scripts ?? []).toEqual([]);
  expect(await (await h.extPage()).evaluate(() => chrome.scripting.getRegisteredContentScripts())).toEqual([]);
});

test('without a grant nothing is injected, enableSite is refused, popup/badge still work', async () => {
  const page = await h.ctx.newPage();
  await page.goto(`${SITE}/`);
  expect(await h.admin({ type: 'enableSite', pattern: 'http://localhost/*' })).toMatchObject({ ok: false, error: 'not_granted' });
  await h.createDue('Prepare refinement notes');
  await page.reload();
  await page.waitForTimeout(500);
  expect(await widget(page).hosts()).toBe(0);
  expect(await h.badge()).toBe('1');
  const popup = await h.openPopup(page);
  await expect(popup.getByText('Due now (1)')).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Show on this page' })).toBeVisible();
  await popup.getByRole('button', { name: /^Complete Prepare/ }).click();
  await expect(popup.getByText(/Completed “Prepare refinement notes”/)).toBeVisible();
  expect(await h.badge()).toBe('');
});

test('temporary access shows Pip on this document only; other sites get no grant', async () => {
  const page = await h.ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${SITE}/`);
  await h.createDue('Review the checkout mockup');
  const popup = await h.openPopup(page);
  await popup.getByRole('button', { name: 'Show on this page' }).click();
  await popup.close();
  await expect(widget(page).wrap).toHaveAttribute('data-state', 'due');
  expect(await widget(page).msg.textContent()).toBe('A reminder is due'); // generic by default
  expect((await (await h.extPage()).evaluate(() => chrome.permissions.getAll())).origins).toEqual([]);

  // Re-injecting keeps exactly one widget.
  const again = await h.openPopup(page);
  await again.getByRole('button', { name: 'Show on this page' }).click();
  await again.close();
  await page.waitForTimeout(300);
  expect(await widget(page).hosts()).toBe(1);

  // Reload ends the temporary grant.
  await page.reload();
  await page.waitForTimeout(500);
  expect(await widget(page).hosts()).toBe(0);

  const other = await h.ctx.newPage();
  await other.goto(`${OTHER_SITE}/`);
  await other.waitForTimeout(500);
  expect(await widget(other).hosts()).toBe(0);
  expect(errors).toEqual([]);
});

test('content scripts cannot read reminder storage or send admin commands', async () => {
  const page = await h.ctx.newPage();
  await page.goto(`${SITE}/`);
  await h.admin({ type: 'create', title: 'Secret synthetic title', dueAt: Date.now() + 3_600_000 });
  const popup = await h.openPopup(page);
  await popup.getByRole('button', { name: 'Show on this page' }).click();
  await popup.close();
  await expect(widget(page).wrap).toBeVisible();

  // Run code in the extension's isolated content-script world of that tab (activeTab grant).
  const results = await (await h.extPage()).evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url: `${url}/*` });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab!.id! },
      func: async () => {
        const out: Record<string, unknown> = {};
        try { out.storage = JSON.stringify(await chrome.storage.local.get(null)); } catch (e) { out.storage = `blocked: ${(e as Error).message}`; }
        out.create = await chrome.runtime.sendMessage({ type: 'create', title: 'from page', dueAt: Date.now() + 99999 });
        out.reset = await chrome.runtime.sendMessage({ type: 'reset' });
        out.oversized = await chrome.runtime.sendMessage({ type: 'view', pad: 'x'.repeat(5000) });
        out.unknown = await chrome.runtime.sendMessage({ type: 'act', action: 'delete', id: 'a', occurrenceId: 'a', revision: 1, opId: 'o' });
        out.view = await chrome.runtime.sendMessage({ type: 'view' });
        return out;
      },
    });
    return r!.result as Record<string, { ok?: boolean; view?: unknown } | string>;
  }, SITE);
  expect(String(results.storage)).toMatch(/^blocked/);
  for (const k of ['create', 'reset', 'oversized', 'unknown']) expect(results[k]).toMatchObject({ ok: false });
  expect(JSON.stringify(results.view)).not.toContain('Secret synthetic title');
  const s = await h.stored();
  expect(s!.reminders.map((r) => r.title)).toEqual(['Secret synthetic title']);
});

test('extension makes no network requests of its own', async () => {
  const requests: string[] = [];
  h.ctx.on('request', (r) => requests.push(r.url()));
  const page = await h.ctx.newPage();
  await page.goto(`${SITE}/`);
  const popup = await h.openPopup(page);
  await popup.getByRole('button', { name: 'Show on this page' }).click();
  await popup.close();
  await h.createDue('Network check');
  await expect(widget(page).wrap).toHaveAttribute('data-state', 'due');
  const foreign = requests.filter((u) => !u.startsWith(SITE) && !u.startsWith('chrome-extension://') && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(foreign).toEqual([]);
});
