// Regenerates public/icons/*.png from src/shared/pip-art.json using Playwright's Chromium.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const art = JSON.parse(await readFile('src/shared/pip-art.json', 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const body = art.elements.map((e) => `<${e.tag} ${Object.entries(e.attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}">${body}</svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: `public/icons/${size}.png`, omitBackground: true });
}
await browser.close();
console.log('Icons written to public/icons/.');
