import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto('file://' + process.cwd() + '/Gridrich.html'); await page.waitForTimeout(400);
let t = Date.now(); await page.click('#exampleBtn'); await page.waitForFunction(() => /Example loaded/.test(document.getElementById('log').textContent), null, { timeout: 120000 }); console.log('example load s', (Date.now() - t) / 1000);
t = Date.now(); await page.click('#runBtn'); await page.waitForFunction(() => /Done|Error/.test(document.getElementById('log').textContent), null, { timeout: 600000 }); console.log('run s', (Date.now() - t) / 1000);
const r = await page.evaluate(() => ({ ds: S.dataSummary, sum: S.results.map(r => r.summary), reg: S.regions.items.map(r => [r.name, r.n_occ, r.richness, r.richness_rarefied, Math.round(r.area_km2), r.occ_per_1000km2, r.species_per_1000km2]).sort((a, b) => b[2] - a[2]), nOut: S.regions.nOut,
  rho: S.results.map(R => { const occ = R.cells.filter(c => c.occupied); return typeof spearman === 'function' ? spearman(occ.map(c => c.n_occ), occ.map(c => c.richness)) : null; }),
  top: (() => { const R = S.results[0]; const m = new Map(); for (const c of R.cells) if (c.species_list) for (const s of c.species_list.split('; ')) m.set(s, (m.get(s) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5); })(),
  maxCell: S.results.map(R => { const c = R.cells.slice().sort((a, b) => b.richness - a.richness)[0]; return [R.name, c.richness, c.n_occ, c.lon, c.lat]; }) }));
console.log(JSON.stringify(r, null, 1));
await page.click('.tabs button[data-tab=similarity]'); await page.waitForTimeout(500);
console.log('sim:', await page.$eval('#simTiles', e => e.innerText.replace(/\n/g, ' | ')));
console.log(await page.$eval('#simTable', e => e.innerText.replace(/\n/g, ' | ')));
await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(500);
console.log(await page.$eval('#tab-charts', e => e.innerText.slice(0, 2500)));
await browser.close();
