import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForSelector('#enter-btn:not([disabled])');
await page.click('#enter-btn');
await page.waitForSelector('#hud:not(.hidden)');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/ghost-step0.png' });

await page.evaluate(() => document.querySelector('#start')?.remove());
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/ghost-step1-nostart.png' });

await page.evaluate(() => { document.querySelector('#editor')?.remove(); });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/ghost-step2-noeditor.png' });

await page.evaluate(() => { document.querySelector('#hud')?.remove(); document.querySelector('#hud-hint')?.remove(); document.querySelector('#minimap-wrap')?.remove(); document.querySelector('#toast')?.remove(); });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/ghost-step3-nooverlays.png' });

await page.evaluate(() => {
  const style = document.createElement('style');
  style.textContent = '#app::after{display:none!important}';
  document.head.append(style);
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/ghost-step4-nograin.png' });
console.log('done');
await browser.close();
