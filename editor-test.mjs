import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForSelector('#enter-btn:not([disabled])', { timeout: 20000 });
await page.screenshot({ path: '/tmp/gallery-start.png' });

await page.click('#start-edit');
await page.waitForSelector('#editor.is-open');
console.log('editor items:', await page.locator('.editor-work').count());
await page.screenshot({ path: '/tmp/gallery-editor.png' });

await page.locator('.editor-work').nth(1).click();
await page.fill('#f-title', 'Harbour Light');
await page.fill('#f-artist', 'Test Artist');
await page.fill('#f-year', '2024');
await page.fill('#f-medium', 'Oil on linen');
await page.fill('#f-dimensions', '120 × 150 cm');
await page.fill('#f-description', 'A test painting uploaded from the curator editor.');
await page.setInputFiles('#editor-file', '/tmp/gallery-start.png');
await page.waitForFunction(() => document.querySelector('#editor-status')?.textContent?.includes('Image added'), null, { timeout: 15000 });
console.log('image status:', await page.textContent('#editor-status'));
console.log('dims inputs:', await page.inputValue('#f-width'), await page.inputValue('#f-height'));

await page.locator('.editor-work').first().click();
await page.fill('#ex-title', 'New Horizons');
await page.fill('#ex-artist', 'Gallery Collective');
await page.fill('#ex-hall', 'Hall 07');
await page.fill('#ex-year', '2027');
await page.fill('#ex-intro', 'A newly curated exhibition, edited entirely in the browser.');
await page.screenshot({ path: '/tmp/gallery-editor-exhibition.png' });

const downloadPromise = page.waitForEvent('download');
await page.click('#editor-export');
const download = await downloadPromise;
await download.saveAs('/tmp/exhibition-export.json');
const exported = JSON.parse(readFileSync('/tmp/exhibition-export.json', 'utf8'));
console.log('exported:', exported.settings.title, exported.artworks.length, exported.artworks[0].title, exported.artworks[0].image?.slice(0, 23));

await page.click('#editor-apply');
await page.waitForFunction(() => !document.querySelector('#editor')?.classList.contains('is-open'));
await page.waitForTimeout(400);
console.log('start title:', await page.textContent('#start-title-main'), '/', await page.textContent('#start-title-accent'));
console.log('start meta:', await page.textContent('#start-meta'));
console.log('start count:', await page.textContent('#start-works'));
await page.screenshot({ path: '/tmp/gallery-start-custom.png' });

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lumen.exhibition.v1') ?? 'null'));
console.log('stored:', stored?.settings?.title, stored?.artworks?.length, stored?.artworks?.[0]?.artist, stored?.artworks?.[0]?.image?.slice(0, 23));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#enter-btn:not([disabled])', { timeout: 20000 });
console.log('persisted title:', await page.textContent('#start-title-main'), '/', await page.textContent('#start-title-accent'), 'count', await page.textContent('#start-works'));

await page.click('#enter-btn');
await page.waitForSelector('#hud:not(.hidden)');
await page.waitForTimeout(1600);
await page.screenshot({ path: '/tmp/gallery-3d-custom.png' });
console.log('hud:', await page.textContent('#hud-title'), '/', await page.textContent('#hud-meta'));

await page.keyboard.press('e');
await page.waitForSelector('#editor.is-open');
console.log('reopened artwork title:', await page.inputValue('#f-title'));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('#editor')?.classList.contains('is-open'));
console.log('editor closed via Escape');

const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await mobile.click('#start-edit');
await mobile.waitForSelector('#editor.is-open');
await mobile.screenshot({ path: '/tmp/gallery-editor-mobile.png' });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log('mobile horizontal overflow:', overflow);
await mobile.locator('.editor-work').nth(2).click();
await mobile.screenshot({ path: '/tmp/gallery-editor-mobile-art.png' });

await browser.close();
