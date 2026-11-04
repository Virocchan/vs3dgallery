import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });
await page.click('#start-edit');
await page.waitForSelector('#editor.is-open');
await page.waitForTimeout(600);
const info = await page.evaluate(() => {
  const sel = {
    editor: '#editor',
    artworkForm: '#editor-artwork-form',
    exhibitionForm: '#editor-exhibition-form',
    panel: '.editor-panel',
    works: '#editor-works',
    title: '#f-title',
    exp: '#editor-export',
    apply: '#editor-apply',
    head: '.editor-head',
    actions: '.editor-actions',
    body: '.editor-body',
  };
  const out = {};
  for (const [key, s] of Object.entries(sel)) {
    const el = document.querySelector(s);
    const r = el?.getBoundingClientRect();
    const cs = el ? getComputedStyle(el) : null;
    out[key] = { rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, display: cs?.display, visibility: cs?.visibility, opacity: cs?.opacity, hidden: el?.hidden, overflow: cs?.overflow, scrollTop: el?.scrollTop };
  }
  return { info: out, selection: document.querySelector('.editor-work.is-selected strong')?.textContent, inner: [innerWidth, innerHeight], doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
