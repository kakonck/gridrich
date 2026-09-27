import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await page.goto('file://' + process.cwd() + '/Gridrich.html'); await page.waitForTimeout(400);
await page.click('#exampleBtn'); await page.waitForFunction(() => /Example loaded/.test(document.getElementById('log').textContent), null, { timeout: 120000 }); await page.click('#runBtn');
await page.waitForFunction(() => /Done|Error/.test(document.getElementById('log').textContent), null, { timeout: 600000 });
await page.selectOption('#mapGrid', '1'); await page.waitForTimeout(300);
// Fig: whole interface (Bangladesh, richness 25 km, quantile classes)
await page.selectOption('#mapClass', 'jenks'); await page.selectOption('#mapPalette', 'ylgn'); await page.waitForTimeout(300);
await page.screenshot({ path: '/home/claude/paper/fig/fig1_interface.png', clip: { x: 0, y: 0, width: 1400, height: 780 } });
// Fig: charts tab
await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(300);
const box = await page.$eval('#tab-charts', e => { const r = e.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }; });
await page.screenshot({ path: '/home/claude/paper/fig/fig4_charts.png', fullPage: true, clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 1250) } });
// Fig: divisions map
await page.selectOption('#mapGrid', 'regions'); await page.selectOption('#mapVar', 'richness'); await page.selectOption('#mapClass', 'continuous'); await page.selectOption('#mapPalette', 'viridis'); await page.waitForTimeout(300);
await page.$eval('#mapwrap', e => e.scrollIntoView()); const m = await page.$eval('#mapwrap', e => { const r = e.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }; });
await page.screenshot({ path: '/home/claude/paper/fig/fig3b_divisions.png', fullPage: true, clip: { x: m.x, y: m.y, width: m.w, height: m.h } });
await browser.close();
