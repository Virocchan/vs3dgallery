import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.click('#start-edit');
await page.waitForSelector('#editor.is-open');
await page.waitForTimeout(500);
console.log(await page.evaluate(() => {
  const pick = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; };
  return {
    shell: pick('.editor-shell'), head: pick('.editor-head'), actions: pick('.editor-actions'), body: pick('.editor-body'), works: pick('#editor-works'), panel: pick('.editor-panel'), form: pick('#editor-artwork-form'),
    doc: [document.documentElement.scrollWidth, window.innerWidth],
  };
}));
await page.screenshot({ path: '/tmp/gallery-editor-mobile-fixed.png' });
await page.locator('.editor-work').nth(1).click();
await page.screenshot({ path: '/tmp/gallery-editor-mobile-art-fixed.png' });
await page.locator('.editor-work').first().click();
await page.screenshot({ path: '/tmp/gallery-editor-mobile-ex-fixed.png' });
await browser.close();
