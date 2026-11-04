import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.waitForSelector('#enter-btn:not([disabled])');
await page.click('#enter-btn');
await page.waitForSelector('#hud:not(.hidden)');
await page.waitForTimeout(3000);
try { execSync('screencapture -x /tmp/mac-screen.png'); console.log('captured'); } catch (e) { console.log('screencapture failed', e.message); }
await page.waitForTimeout(500);
await browser.close();
