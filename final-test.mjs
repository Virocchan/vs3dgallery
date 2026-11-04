import { chromium } from 'playwright';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));

await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#enter-btn:not([disabled])', { timeout: 20000 });
console.log('default:', await page.textContent('#start-title-main'), '/', await page.textContent('#start-title-accent'), '|', await page.textContent('#start-works'));

await page.click('#start-edit');
await page.waitForSelector('#editor.is-open');
await page.locator('.editor-work').first().click();
console.log('default ex values:', await page.inputValue('#ex-title'), '/', await page.inputValue('#ex-hall'));

await page.fill('#ex-title', 'New Horizons');
await page.fill('#ex-artist', 'Gallery Collective');
await page.fill('#ex-hall', 'Hall 07');
await page.fill('#ex-year', '2027');
await page.fill('#ex-intro', 'A newly curated exhibition, edited entirely in the browser.');
await page.locator('.editor-work').nth(1).click();
await page.fill('#f-title', 'Harbour Light');
await page.fill('#f-artist', 'Test Artist');
await page.fill('#f-year', '2024');
await page.fill('#f-medium', 'Oil on linen');
await page.fill('#f-dimensions', '120 × 150 cm');
await page.setInputFiles('#editor-file', '/tmp/gallery-start.png');
await page.waitForFunction(() => document.querySelector('#editor-status')?.textContent?.includes('Image added'), null, { timeout: 15000 });
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/final-editor.png' });

await page.click('#editor-apply');
await page.waitForFunction(() => !document.querySelector('#editor')?.classList.contains('is-open'));
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/final-start.png' });
console.log('custom start:', await page.textContent('#start-title-main'), '/', await page.textContent('#start-title-accent'), '|', await page.textContent('#start-meta'), '|', await page.textContent('#start-works'));

await page.click('#enter-btn');
await page.waitForSelector('#hud:not(.hidden)');
await page.waitForTimeout(1600);
await page.screenshot({ path: '/tmp/final-gallery.png' });

const candidates = [[584, 433], [117, 431], [1250, 431], [760, 431], [963, 431]];
for (const [x, y] of candidates) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(350);
  const open = await page.evaluate(() => document.querySelector('#panel')?.classList.contains('is-open'));
  if (open) {
    const title = await page.textContent('#panel-title');
    const artist = await page.textContent('#panel-artist');
    const image = await page.getAttribute('#panel-image', 'src');
    console.log(`panel at ${x},${y}:`, title, '|', artist, '|', await page.textContent('#panel-year'), '|', await page.textContent('#panel-medium'), '|', image?.slice(0, 23));
    await page.screenshot({ path: '/tmp/final-panel.png' });
    if (title === 'Harbour Light') break;
    await page.click('#panel-close');
    await page.waitForTimeout(500);
  }
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await page.keyboard.press('e');
await page.waitForSelector('#editor.is-open');
const before = await page.locator('.editor-work').count();
await page.click('#editor-add');
await page.waitForTimeout(200);
const after = await page.locator('.editor-work').count();
console.log('add artwork count:', before, '->', after, '| title:', await page.inputValue('#f-title'), '| selected:', await page.textContent('.editor-work.is-selected strong'));
page.once('dialog', (dialog) => dialog.accept());
await page.click('#editor-delete');
await page.waitForTimeout(250);
console.log('after delete count:', await page.locator('.editor-work').count());

await page.locator('.editor-work').first().click();
await page.fill('#ex-title', 'Solstice');
await page.click('#editor-apply');
await page.waitForTimeout(800);
console.log('single word title:', await page.textContent('#start-title-main'), '| accent hidden:', await page.evaluate(() => document.querySelector('#start-title-accent')?.hidden), '| break hidden:', await page.evaluate(() => document.querySelector('#start-title-break')?.hidden));
await page.screenshot({ path: '/tmp/final-start-singleword.png' });

console.log('doc overflow:', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
await browser.close();
