import { chromium } from 'playwright';
import fs from 'fs';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
await page.goto('file://' + process.cwd() + '/Gridrich.html');
await page.waitForTimeout(500);
const mode = process.argv[2] || 'example';
if (mode === 'example') {
  await page.click('#exampleBtn');
} else {
  await page.setInputFiles('#boundaryInput', mode === 'zip' ? ['test/demo_boundary_shp.zip'] : mode === 'utm' ? ['test/shp/demo_utm.shp','test/shp/demo_utm.dbf','test/shp/demo_utm.prj'] : mode === 'noprj' ? ['test/shp/demo_utm.shp','test/shp/demo_utm.dbf'] : mode === 'nc' ? ['test/nc_counties.geojson'] : mode === 'bgd' ? ['/home/claude/bgd/clean/BGD_divisions.geojson'] : ['test/demo_boundary.geojson']);
  await page.waitForTimeout(800);
  if (mode === 'noprj') { await page.fill('#bUtmZone', '13'); await page.click('#bApplyCrs'); await page.waitForTimeout(300); }
  await page.setInputFiles('#recordsInput', [mode === 'nc' ? 'test/nc_records.csv' : mode === 'bgd' ? '/home/claude/bgd/clean/BGD_Oryza_occurrences_clean.csv' : 'test/demo_occurrences.csv']);
  await page.fill('#minOverlap', '0.5'); await page.check('#rarefyOn'); await page.fill('#rarefyN', mode === 'bgd' ? '10' : '5');
}
await page.waitForTimeout(800);
await page.fill('#cellSizes', process.argv[3] || '25, 50, 100');
if (process.argv[4] === 'hex') await page.click('#cellType button[data-v=hexagon]');
await page.click('#runBtn');
await page.waitForFunction(() => document.getElementById('log').textContent.includes('Done.') || document.getElementById('log').textContent.includes('Error'), null, { timeout: 600000 });
console.log(await page.$eval('#log', e => e.textContent));
console.log(await page.$eval('#boundaryInfo', e => e.textContent));
const summary = await page.evaluate(() => S.results.map(r => r.summary));
console.table(summary);
const checks = await page.evaluate(() => S.results.map(r => ({ name: r.name, sumAreaIn: r.cells.reduce((s,c)=>s+c.area_in_km2,0).toFixed(2), cellArea: r.cells[0].cell_area_km2.toFixed(3), nRecords: r.recordsAssigned.length, sumNocc: r.cells.reduce((s,c)=>s+c.n_occ,0), propMin: Math.min(...r.cells.map(c=>c.prop_in)).toFixed(3), rarefNA: r.cells.filter(c=>c.richness_rarefied==null && c.occupied).length, richEqList: r.cells.every(c=>!c.species_list || c.species_list.split('; ').length===c.richness || (c.richness===0 && c.species_list==='')) })));
console.table(checks);
console.log('regions:', await page.evaluate(() => S.regions ? { field: S.regions.field, n: S.regions.items.length, nOut: S.regions.nOut, sumOcc: S.regions.items.reduce((a,r)=>a+r.n_occ,0), top: S.regions.items.slice().sort((a,b)=>b.richness-a.richness).slice(0,3).map(r=>[r.name,r.n_occ,r.richness,r.area_km2.toFixed(0)]) } : null));
await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(300); console.log('charts:', await page.$$eval('#charts .chart h2', els => els.map(e => e.textContent))); console.log(await page.$eval('#reading', e => e.innerText.slice(0, 600)));
await page.screenshot({ path: 'test/shot_charts_' + mode + '.png', fullPage: true });
await page.selectOption('#mapGrid', 'regions'); await page.waitForTimeout(200); await page.$eval('#mapwrap', e => e.scrollIntoView()); await page.screenshot({ path: 'test/shot_regions_' + mode + '.png', clip: { x: 400, y: 0, width: 1000, height: 560 } }).catch(()=>{});
console.log('boundary area', await page.evaluate(() => S.boundary.areaKm2.toFixed(2)));
await page.screenshot({ path: 'test/shot_' + mode + (process.argv[4]||'') + '.png', fullPage: true });
if (mode === 'bgd') { const outdir = '/home/claude/bgd/results/'; for (const v of ['richness','n_occ']) { await page.selectOption('#mapVar', v); await page.waitForTimeout(200); await page.selectOption('#mapGrid', '0'); await page.waitForTimeout(200); await page.$eval('#mapwrap', e => e.scrollIntoView()); await page.screenshot({ path: outdir + 'map_' + v + '_25km.png', clip: { x: 410, y: 40, width: 980, height: 560 } }); } await page.selectOption('#mapVar', 'richness'); await page.selectOption('#mapGrid', 'regions'); await page.waitForTimeout(200); await page.$eval('#mapwrap', e => e.scrollIntoView()); await page.screenshot({ path: outdir + 'map_richness_divisions.png', clip: { x: 410, y: 40, width: 980, height: 560 } }); }
// exercise exports
await page.click('.tabs button[data-tab=export]');
const dl = page.waitForEvent('download', { timeout: 10000 });
await page.click('#dlXlsx'); const d = await dl; await d.saveAs(mode === 'bgd' ? '/home/claude/bgd/results/BGD_Oryza_gridrich_results.xlsx' : 'test/out.xlsx');
const dl2 = page.waitForEvent('download'); await page.click('#dlGeojson'); await (await dl2).saveAs(mode === 'bgd' ? '/home/claude/bgd/results/BGD_Oryza_grid_25km.geojson' : 'test/out.geojson');
const dl3 = page.waitForEvent('download'); await page.click('#dlCsv'); await (await dl3).saveAs(mode === 'bgd' ? '/home/claude/bgd/results/BGD_Oryza_cells.csv' : 'test/out.csv');
const dl4 = page.waitForEvent('download'); await page.click('#dlPng'); await (await dl4).saveAs(mode === 'bgd' ? '/home/claude/bgd/results/BGD_Oryza_map_divisions.png' : 'test/out.png');
const dl5 = page.waitForEvent('download'); await page.click('#dlSvg'); await (await dl5).saveAs(mode === 'bgd' ? '/home/claude/bgd/results/BGD_Oryza_map_divisions.svg' : 'test/out.svg');
if (mode === 'bgd') { await page.selectOption('#geojsonGrid', 'regions'); const dl6 = page.waitForEvent('download'); await page.click('#dlGeojson'); await (await dl6).saveAs('/home/claude/bgd/results/BGD_Oryza_divisions.geojson'); }
console.log('errors:', errors);
await browser.close();
