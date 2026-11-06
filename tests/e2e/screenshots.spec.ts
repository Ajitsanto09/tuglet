import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { launch, SITE, widget } from './harness';

// Synthetic screenshots of real extension states. SCREENSHOTS=1 writes them to docs/screenshots/.
test('idle, due and pulling states in light and dark', async () => {
  const dir = process.env.SCREENSHOTS ? 'docs/screenshots' : test.info().outputPath('screens');
  await mkdir(dir, { recursive: true });
  const h = await launch({ grantLocalhost: true });
  try {
    const page = await h.ctx.newPage();
    await page.setViewportSize({ width: 900, height: 520 });
    await page.goto(`${SITE}/`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const popup = await h.openPopup(page);
    await popup.getByLabel('Reminder', { exact: true }).fill('Prepare refinement notes');
    await popup.getByRole('button', { name: 'In 30 min' }).click();
    await popup.getByRole('button', { name: 'Add reminder' }).click();
    await expect(popup.getByText('Upcoming (1)')).toBeVisible();
    await popup.screenshot({ path: `${dir}/popup.png`, fullPage: true });
    await popup.getByRole('button', { name: /Always allow on/ }).click();
    await expect(popup.getByText('Pip will appear on')).toBeVisible();
    await popup.close();
    const w = widget(page);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(w.wrap).toBeVisible();
      await page.screenshot({ path: `${dir}/idle-${scheme}.png` });
    }
    await h.createDue('Review the checkout mockup');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await expect(w.wrap).toHaveAttribute('data-state', 'due');
      await page.screenshot({ path: `${dir}/due-${scheme}.png` });
      const box = (await w.pip.boundingBox())!;
      await page.mouse.move(box.x + 32, box.y + 32);
      await page.mouse.down();
      await page.mouse.move(box.x + 32, box.y + 32 + 70, { steps: 4 });
      await page.screenshot({ path: `${dir}/pull-snooze-${scheme}.png` });
      await page.mouse.move(box.x + 32, box.y + 32 + 150, { steps: 4 });
      await page.screenshot({ path: `${dir}/pull-complete-${scheme}.png` });
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }
  } finally {
    await h.close();
  }
});
