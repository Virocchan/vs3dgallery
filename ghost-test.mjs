import { chromium } from 'playwright';

async function shot(name, options) {
  const browser = await chromium.launch(options);
  const context = await browser.newContext({ viewport: { width: 1200, height: 760 } });
  const page = await context.newPage();
  await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#enter-btn:not([disabled])', { timeout: 20000 });
  await page.click('#enter-btn');
  await page.waitForSelector('#hud:not(.hidden)');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `/tmp/ghost-${name}.png` });
  console.log(name, 'saved', await page.evaluate(() => ({ display: getComputedStyle(document.querySelector('#start')).display, opacity: getComputedStyle(document.querySelector('#start')).opacity })));
  await browser.close();
}

await shot('headful', { channel: 'chrome', headless: false });
await shot('metal', { channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
await shot('default', { channel: 'chrome', headless: true });
