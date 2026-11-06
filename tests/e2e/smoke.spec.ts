import { expect, test } from '@playwright/test';
import { launch, pull, SITE, widget } from './harness';

// @smoke tests also run against the extracted release ZIP (npm run verify:package).
test('@smoke install, create, due, short pull, full pull, fallback', async () => {
  const h = await launch();
  try {
    const page = await h.ctx.newPage();
    await page.goto(`${SITE}/`);
    const popup = await h.openPopup(page);
    await popup.getByLabel('Reminder', { exact: true }).fill('Check the release smoke test');
    await popup.getByRole('button', { name: 'In 5 min' }).click();
    await popup.getByRole('button', { name: 'Add reminder' }).click();
    await expect(popup.getByText('Upcoming (1)')).toBeVisible();
    await popup.getByRole('button', { name: 'Show on this page' }).click();
    await expect(popup.getByText('until you leave or reload')).toBeVisible();
    await popup.close();
    const w = widget(page);
    await expect(w.wrap).toBeVisible();
    await expect(w.wrap).toHaveAttribute('data-state', 'idle');

    await h.createDue('Take a screen break');
    await expect(w.wrap).toHaveAttribute('data-state', 'due');
    expect(await h.badge()).toBe('1');

    await pull(page, 60);
    await expect(w.status).toHaveText('Snoozed for 5 minutes.');
    let s = await h.stored();
    expect(s!.reminders.find((r) => r.title === 'Take a screen break')!.status).toBe('snoozed');

    await h.createDue('Review a pull request');
    await expect(w.wrap).toHaveAttribute('data-state', 'due');
    await pull(page, 150);
    await expect(w.status).toHaveText('Completed.');
    s = await h.stored();
    expect(s!.reminders.find((r) => r.title === 'Review a pull request')!.status).toBe('completed');
    expect(await h.badge()).toBe('');

    // Fallback: a Chrome page cannot host the widget; the popup still works.
    const internal = await h.ctx.newPage();
    await internal.goto('chrome://version');
    const p2 = await h.openPopup(internal);
    await expect(p2.getByText('can’t appear on this page')).toBeVisible();
    await expect(p2.getByText('Upcoming (2)')).toBeVisible();
  } finally {
    await h.close();
  }
});
