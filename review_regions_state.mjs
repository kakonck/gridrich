// Regions, state resets, setting coercion, exports, charts, dark mode, phone width.
import { open, file, loadBoundary, loadRecords, run, results, section, check, squareGeo, fc, feat, csv, ROOT } from './review_lib.mjs';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require(ROOT + '/lib/xlsx.full.min.js');

const { browser, page, errors } = await open();
const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

section('1. Regions: duplicate names, nulls, numeric field, shared borders');
{
  // 4 regions in a 2x2 block; shared borders at lon 90.4 and lat 23.8
  const regs = fc([
    feat(rect(89.9, 23.3, 90.4, 23.8), { name: 'West', code: 1, mixed: 'a' }),
    feat(rect(90.4, 23.3, 90.9, 23.8), { name: 'West', code: 2, mixed: null }),
    feat(rect(89.9, 23.8, 90.4, 24.3), { name: null, code: 3, mixed: 7 }),
    feat(rect(90.4, 23.8, 90.9, 24.3), { name: '  East  ', code: 3, mixed: '<b>x</b>' })
  ]);
  console.log(await loadBoundary(page, [file('regs.geojson', JSON.stringify(regs))]));
  console.log('region field options:', await page.evaluate(() => Array.from($('regionField').options).map(o => o.value)), 'picked:', await page.$eval('#regionField', e => e.value));
  const rows = [['A', 90.4, 23.5], ['A', 90.4, 24.0], ['B', 90.1, 23.8], ['B', 90.7, 23.8], ['C', 90.4, 23.8], ['D', 90.1, 23.5], ['D', 90.7, 24.0], ['E', 89.9, 23.3], ['Out', 91.5, 23.5]];
  await loadRecords(page, file('regpts.csv', csv(rows), 'text/csv')); await page.selectOption('#recCrsType', 'lonlat');
  for (const field of ['name', 'code', 'mixed']) {
    const r = await run(page, { sizes: '25', minOverlap: 0, regions: true, regionField: field, rarefy: null, speciesList: true });
    const reg = await page.evaluate(() => ({ field: S.regions.field, nOut: S.regions.nOut, items: S.regions.items.map(x => [x.name, x.n_occ, x.richness]), sum: S.regions.items.reduce((s, x) => s + x.n_occ, 0), outside: S.dataSummary.outsideBoundary, inGrid: S.results[0].recordsAssigned.length }));
    console.log(field, '->', JSON.stringify(reg));
    check(`${field}: border records counted once (sum n_occ + nOut + outside == 9; corner record inside)`, reg.sum + reg.nOut + reg.outside === 9 && reg.outside === 1 && reg.nOut === 0, `${reg.sum}+${reg.nOut}+${reg.outside}`);
  }
  const names = await page.evaluate(() => S.regions.items.map(x => x.name));
  check('duplicate/null/whitespace names disambiguated', names.length === new Set(names).size, JSON.stringify(names));
  // regions tab text / tooltip escaping for '<b>x</b>'
  await page.click('.tabs button[data-tab=regions]');
  const html = await page.$eval('#regionsTable tbody', e => e.innerHTML);
  console.log('table renders <b>x</b> as text?', html.includes('&lt;b&gt;x&lt;/b&gt;'));
  await page.click('.tabs button[data-tab=charts]');
  const chartHtml = await page.$eval('#charts', e => e.innerHTML);
  console.log('chart labels contain a live <b> element from region name?', /<text[^>]*><b>x<\/b>/.test(chartHtml) || (await page.$$eval('#charts b', els => els.length)) > 0);
  console.log('reading contains raw <b> from region name?', (await page.$eval('#reading', e => e.innerHTML)).includes('<b>x</b>'));
  // hover tooltip on regions layer
  await page.selectOption('#mapGrid', 'regions'); await page.waitForTimeout(200);
  const tipHtml = await page.evaluate(() => { const p = Array.from(document.querySelectorAll('#map path')).find(p => p._cell && p._cell.name && p._cell.name.includes('<b>')); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return $('tip').innerHTML; });
  console.log('tooltip HTML for region named <b>x</b>:', tipHtml.slice(0, 80));
  check('tooltip escapes region name', !tipHtml.includes('<b>x</b>'));
}

section('2. Regions checkbox off -> S.regions null, Regions tab hidden, map option gone');
{
  const r = await run(page, { regions: false });
  const st = await page.evaluate(() => ({ regions: S.regions, tabHidden: $('tabRegions').hidden, mapOpts: Array.from($('mapGrid').options).map(o => o.value), geoOpts: Array.from($('geojsonGrid').options).map(o => o.value), mapGrid: S.mapGrid }));
  console.log(JSON.stringify(st));
  check('regions cleared', st.regions === null && st.tabHidden && !st.mapOpts.includes('regions') && !st.geoOpts.includes('regions'));
  console.log('active tab pane after Regions tab hidden:', await page.$$eval('.tabpane:not([hidden])', els => els.map(e => e.id)), 'tab button .on:', await page.$eval('.tabs button.on', e => e.dataset.tab));
}

section('2b. Regions tab active, then re-run with regions off');
{
  await run(page, { regions: true });
  await page.click('.tabs button[data-tab=regions]');
  await run(page, { regions: false });
  const st = await page.evaluate(() => ({ visiblePanes: Array.from(document.querySelectorAll('.tabpane:not([hidden])')).map(e => e.id), onTab: document.querySelector('.tabs button.on') && document.querySelector('.tabs button.on').dataset.tab, onTabHidden: document.querySelector('.tabs button.on') && document.querySelector('.tabs button.on').hidden, regionsTableRows: $('regionsTable').querySelectorAll('tbody tr').length, regionsInfo: $('regionsInfo').textContent }));
  console.log(JSON.stringify(st));
  check('no orphaned Regions pane after regions switched off', !(st.visiblePanes.includes('tab-regions') && st.onTabHidden), JSON.stringify(st));
  await page.click('.tabs button[data-tab=summary]');
}

section('3. 120 regions performance (union path, < 40000 vertices)');
{
  const feats = []; for (let i = 0; i < 12; i++) for (let j = 0; j < 10; j++) feats.push(feat(rect(89 + i * 0.2, 23 + j * 0.2, 89 + (i + 1) * 0.2, 23 + (j + 1) * 0.2), { id: i * 10 + j, name: `R${i}_${j}` }));
  const t0 = Date.now(); console.log(await loadBoundary(page, [file('many.geojson', JSON.stringify(fc(feats)))])); console.log('load ms', Date.now() - t0);
  const rows = []; for (let k = 0; k < 3000; k++) rows.push([`Sp${k % 40}`, (89 + 2.4 * ((k * 0.37) % 1)).toFixed(5), (23 + 2.0 * ((k * 0.61) % 1)).toFixed(5)]);
  await loadRecords(page, file('many.csv', csv(rows), 'text/csv'));
  const r = await run(page, { sizes: '10, 25', regions: true, regionField: 'name', rarefy: 5 }); console.log('run ms', r.ms, r.log.split('\n').slice(-3).join(' / '));
  const parts = await page.evaluate(() => ({ parts: polysOf(S.boundary.feature.geometry).length, notUnioned: S.boundary.notUnioned, area: S.boundary.areaKm2 }));
  console.log(JSON.stringify(parts));
  check('120 adjacent rectangles union into 1 polygon', parts.parts === 1, JSON.stringify(parts));
  await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(200);
  const h = await page.$$eval('#charts .chart', els => els.map(e => [e.querySelector('h2').textContent, e.querySelector('svg').getAttribute('viewBox')]));
  console.log('chart heights with 120 regions:', JSON.stringify(h));
}

const rows = []; for (let k = 0; k < 60; k++) rows.push([`Sp${k % 9}`, (90.4 - 0.45 + 0.9 * ((k * 0.37) % 1)).toFixed(5), (23.8 - 0.45 + 0.9 * ((k * 0.61) % 1)).toFixed(5)]);
const PART = process.argv[2] || 'all';
if (PART === 'all') {
section('4. Settings coercion: minOverlap, rarefy');
{
  await loadBoundary(page, [file('sq.geojson', JSON.stringify(feat(squareGeo(90.4, 23.8, 0.5))))]);
  await loadRecords(page, file('sq.csv', csv(rows), 'text/csv'));
  for (const mo of ['1', '0', '', '-0.5', '1.5', 'abc', '0.999999']) {
    await page.evaluate(v => { const e = document.getElementById('minOverlap'); e.value = v; }, mo);
    const r = await run(page, { sizes: '25', rarefy: null });
    const R = await results(page);
    console.log(`minOverlap ${JSON.stringify(mo)} ->`, r.log.split('\n').filter(l => /cells|Error/.test(l)).join(' / '), '| stored minOverlap:', await page.evaluate(() => S.results && S.results[0].minOverlap), '| minProp', R && R[0].minPropIn.toFixed(3));
  }
  await page.fill('#minOverlap', '0');
  for (const rf of ['2.5', '0', '', '-3', 'abc', '1']) {
    await page.evaluate(v => { document.getElementById('rarefyN').value = v; }, rf);
    await page.setChecked('#rarefyOn', true);
    const r = await run(page, { sizes: '25' });
    const info = await page.evaluate(() => ({ rarefy: S.results[0].rarefy, vals: Array.from(new Set(S.results[0].cells.filter(c => c.occupied).map(c => c.richness_rarefied))).slice(0, 6) }));
    console.log(`rarefyN ${JSON.stringify(rf)} ->`, JSON.stringify(info), r.log.includes('Error') ? r.log : '');
  }
  await page.setChecked('#rarefyOn', false);
}

}
if (PART === 'b') { await loadBoundary(page, [file('sq.geojson', JSON.stringify(feat(squareGeo(90.4, 23.8, 0.5))))]); await loadRecords(page, file('sq.csv', csv(rows), 'text/csv')); await page.selectOption('#recCrsType', 'lonlat'); }
if (PART !== 'c') {
section('5. State after re-run with different sizes / new boundary / failed run');
{
  await run(page, { sizes: '10, 25, 50', rarefy: 5, speciesList: true });
  await page.evaluate(() => { for (const [id, v] of [['mapGrid', '2'], ['cellsGrid', '2'], ['chartsGrid', '2'], ['mapVar', 'richness_rarefied']]) { const e = $(id); e.value = v; e.dispatchEvent(new Event('change')); } });
  const r2 = await run(page, { sizes: '30', rarefy: null });
  const st = await page.evaluate(() => ({ n: S.results.length, mapGrid: S.mapGrid, mapSel: $('mapGrid').value, cellsSel: $('cellsGrid').value, chartsSel: $('chartsGrid').value, mapVar: S.mapVar, note: $('mapNote').hidden ? '' : $('mapNote').textContent, legend: $('legend').textContent, tiles: $('tiles').textContent.replace(/\s+/g, ' ').slice(0, 200)}));
  console.log(JSON.stringify(st));
  check('selects point at existing option after re-run', st.mapSel === '0' && st.cellsSel === '0' && st.chartsSel === '0', `${st.mapSel} ${st.cellsSel} ${st.chartsSel}`);
  console.log('map still coloured by rarefied richness after rarefy switched off? note:', st.note);
  // failed run keeps stale results
  const r3 = await run(page, { sizes: 'abc' });
  const stale = await page.evaluate(() => ({ results: S.results && S.results.map(r => r.name), log: $('log').textContent.split('\n').slice(-1)[0], stepDone: $('step-run').classList.contains('done') }));
  console.log('after failed run:', JSON.stringify(stale));
  check('failed run clears or flags stale results', !stale.results, JSON.stringify(stale));
  // load a new boundary after a run -> results cleared?
  await page.fill('#cellSizes', '25');
  await loadBoundary(page, [file('sq2.geojson', JSON.stringify(feat(squareGeo(90.4, 23.8, 0.3))))]);
  const st2 = await page.evaluate(() => ({ results: S.results, regions: S.regions, tiles: $('tiles').textContent.replace(/\s+/g, ' ').slice(0, 80), paths: document.querySelectorAll('#map path').length, note: $('mapNote').textContent, runDone: $('step-run').classList.contains('done'), gridDone: $('step-grid').classList.contains('done') }));
  console.log('after new boundary:', JSON.stringify(st2));
  check('results cleared after new boundary', st2.results === null && st2.paths === 1);
  console.log('step 3/4 still marked done after results cleared?', st2.runDone, st2.gridDone);
  // load new records after a run with regions -> S.regions stale?
  await loadBoundary(page, [ROOT + '/test/demo_regions.geojson']); await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
  await run(page, { sizes: '25', regions: true, minOverlap: 0.5 });
  await page.selectOption('#mapGrid', 'regions'); await page.waitForTimeout(100);
  await loadRecords(page, file('sq.csv', csv(rows), 'text/csv'));
  const st3 = await page.evaluate(() => ({ results: S.results, regions: !!S.regions, tabRegionsHidden: $('tabRegions').hidden, mapOpts: Array.from($('mapGrid').options).map(o => o.value), mapGrid: S.mapGrid, paths: document.querySelectorAll('#map path').length, regionsRows: $('regionsTable').querySelectorAll('tbody tr').length, note: $('mapNote').hidden ? '' : $('mapNote').textContent }));
  console.log('after new records (regions were on):', JSON.stringify(st3));
  check('S.regions cleared and Regions tab hidden after new records', !st3.regions && st3.tabRegionsHidden && !st3.mapOpts.includes('regions'), JSON.stringify(st3));
  // export with stale regions selected and no results
  await page.click('.tabs button[data-tab=export]');
  const errBefore = errors.length; await page.click('#dlSvg'); await page.waitForTimeout(300);
  console.log('SVG export with no results, mapGrid=regions ->', errors.slice(errBefore));
  // failed boundary load after a run: results remain, boundary null -> exports crash?
  await run(page, { sizes: '25', regions: true, minOverlap: 0.5 });
  const okRun = await page.evaluate(() => !!S.results);
  await loadBoundary(page, [file('bad.geojson', '{not json', 'application/json')]);
  const st4 = await page.evaluate(() => ({ boundary: S.boundary, results: !!S.results, status: $('boundaryStatus').textContent, info: $('boundaryInfo').textContent, runDisabled: $('runBtn').disabled, paths: document.querySelectorAll('#map path').length }));
  console.log('after failed boundary load:', JSON.stringify(st4));
  const eb = errors.length;
  await page.click('.tabs button[data-tab=export]'); await page.click('#dlGeojson'); await page.waitForTimeout(300);
  await page.selectOption('#mapVar', 'n_occ'); await page.waitForTimeout(200);
  console.log('exports/map after failed boundary load ->', errors.slice(eb).map(e => e.split('\n')[0]));
  check('no crash when boundary load fails after a run', errors.length === eb);
}

section('6. Exports round trip (demo data, 10/25 km, regions, rarefy, species list)');
{
  await loadBoundary(page, [ROOT + '/test/demo_regions.geojson']); await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
  // inject a non-ASCII species into the data for the round trip
  await page.evaluate(() => { S.records.rows[0].species = 'Salix ধান Ærø, "quoted"; semi'; });
  const r = await run(page, { sizes: '10, 25', regions: true, regionField: 'division', minOverlap: 0.5, rarefy: 5, speciesList: true });
  console.log(r.log.split('\n').slice(-4).join(' / '));
  const exp = await page.evaluate(() => ({ results: S.results.map(R => ({ name: R.name, n: R.cells.length, sumNocc: R.cells.reduce((s, c) => s + c.n_occ, 0), sumRich: R.cells.reduce((s, c) => s + c.richness, 0), species: R.species.length, cellsRows: R.cells.map(c => cellRow(c, R)) })), regions: S.regions.items.map(regionRow), regionSpecies: S.regions.speciesRows.length, summary: S.results.map(R => R.summary) }));
  await page.click('.tabs button[data-tab=export]');
  const dl = async (btn, sel) => { if (sel) await page.selectOption('#geojsonGrid', sel); const p = page.waitForEvent('download', { timeout: 20000 }); await page.click(btn); const d = await p; const path = await d.path(); return { path, name: d.suggestedFilename(), size: fs.statSync(path).size }; };
  const x = await dl('#dlXlsx'); console.log('xlsx', x.name, x.size);
  const wb = XLSX.read(fs.readFileSync(x.path), { type: 'buffer' });
  console.log('sheets:', wb.SheetNames);
  const sheet = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null });
  for (const R of exp.results) {
    const rows = sheet('grid_' + R.name);
    const sumN = rows.reduce((s, r) => s + r.n_occ, 0), sumR = rows.reduce((s, r) => s + r.richness, 0);
    check(`xlsx grid_${R.name}: ${R.n} rows, n_occ sum ${R.sumNocc}, richness sum ${R.sumRich}`, rows.length === R.n && sumN === R.sumNocc && sumR === R.sumRich, `${rows.length} ${sumN} ${sumR}`);
    // exact cell match
    const diff = rows.filter((r, i) => JSON.stringify(Object.values(r).map(v => typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v)) !== JSON.stringify(Object.values(R.cellsRows[i]).map(v => v == null ? null : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v))).length;
    console.log('  rows differing from S.results (after boolean normalisation):', diff, 'first row keys:', Object.keys(rows[0]).join(','), '| sample richness_rarefied:', rows.filter(r => r.richness_rarefied != null).slice(0, 2).map(r => r.richness_rarefied));
    const occRows = rows.filter(r => r.occupied === true || r.occupied === 'TRUE'); console.log('  occupied column type:', typeof rows[0].occupied, 'occupied rows', occRows.length);
  }
  const sp = sheet('species'); check('species sheet rows == sum of species per scale', sp.length === exp.results.reduce((s, R) => s + R.species, 0), sp.length);
  const odd = sp.find(s => /ধান/.test(s.species)); check('non-ASCII species intact in xlsx', !!odd && odd.species === 'Salix ধান Ærø, "quoted"; semi', odd && odd.species);
  const rg = sheet('regions'); check('regions sheet has 4 rows with the same n_occ', rg.length === 4 && rg.every((r, i) => r.n_occ === exp.regions[i].n_occ), JSON.stringify(rg.map(r => [r.region, r.n_occ])));
  const rs = sheet('region_species'); check('region_species rows', rs.length === exp.regionSpecies, rs.length);
  const sm = sheet('summary'); check('summary sheet == S.results summaries', JSON.stringify(sm) === JSON.stringify(exp.summary), JSON.stringify(sm[0]));
  const dict = sheet('columns'); console.log('columns sheet:', dict.map(d => d.column).join(','));
  console.log('  n_cells described as:', JSON.stringify(dict.find(d => d.column === 'n_cells')), '| species sheet n_cells means cells occupied by the species');
  // GeoJSON
  for (const [sel, R] of [['0', exp.results[0]], ['1', exp.results[1]]]) {
    const g = await dl('#dlGeojson', sel); const gj = JSON.parse(fs.readFileSync(g.path, 'utf8'));
    let bad = 0; const walk = c => typeof c[0] === 'number' ? (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90 ? bad++ : 0) : c.forEach(walk); gj.features.forEach(f => walk(f.geometry.coordinates));
    const ring = gj.features[0].geometry.coordinates[0]; const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    // ring orientation (RFC 7946 wants counter-clockwise exterior)
    let a = 0; for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    check(`geojson ${g.name}: ${R.n} features, coords in lon/lat range, rings closed`, gj.features.length === R.n && bad === 0 && closed, `${gj.features.length} bad=${bad} closed=${closed} ccw=${a > 0} sumNocc=${gj.features.reduce((s, f) => s + f.properties.n_occ, 0)} props=${Object.keys(gj.features[0].properties).join(',')}`);
  }
  const gr = await dl('#dlGeojson', 'regions'); const gjr = JSON.parse(fs.readFileSync(gr.path, 'utf8')); check('regions geojson 4 features', gjr.features.length === 4, gr.name + ' ' + Object.keys(gjr.features[0].properties).join(','));
  // CSV
  const c = await dl('#dlCsv'); const txt = fs.readFileSync(c.path, 'utf8'); const lines = txt.trim().split('\n');
  const wbc = XLSX.read(fs.readFileSync(c.path), { type: 'buffer' }); const csvRows = XLSX.utils.sheet_to_json(wbc.Sheets[wbc.SheetNames[0]]);
  check('csv: rows == total cells', csvRows.length === exp.results.reduce((s, R) => s + R.n, 0), `${csvRows.length} parsed rows, ${lines.length - 1} lines`);
  console.log('csv header:', lines[0]); console.log('csv row with the odd species:', lines.find(l => l.includes('ধান')));
  // PNG / SVG
  const p = await dl('#dlPng'); check('png produced', p.size > 1000 && fs.readFileSync(p.path).slice(1, 4).toString() === 'PNG', `${p.name} ${p.size}`);
  const s = await dl('#dlSvg'); const svgTxt = fs.readFileSync(s.path, 'utf8'); check('svg produced, no unresolved var()', s.size > 1000 && !svgTxt.includes('var(--'), `${s.name} ${s.size} var()=${(svgTxt.match(/var\(--/g) || []).length}`);
  console.log('svg width/height attrs:', svgTxt.match(/<svg[^>]*>/)[0].slice(0, 200));
  // legend in SVG when grey unchecked
  await page.setChecked('#showEmptyGrey', false); const s2 = await dl('#dlSvg'); console.log('svg legend still says "no records" with grey off?', fs.readFileSync(s2.path, 'utf8').includes('no records')); await page.setChecked('#showEmptyGrey', true);
}

}
if (PART === 'c') { await loadBoundary(page, [file('sq.geojson', JSON.stringify(feat(squareGeo(90.4, 23.8, 0.5))))]); }
section('7. Charts edge cases');
{
  // 1 cell size, 1 species, zero occupied cells
  await loadBoundary(page, [file('sq.geojson', JSON.stringify(feat(squareGeo(90.4, 23.8, 0.5))))]);
  await loadRecords(page, file('one.csv', csv([['Only', 90.4, 23.8], ['Only', 90.41, 23.81]]), 'text/csv')); await page.selectOption('#recCrsType', 'lonlat');
  await run(page, { sizes: '25', regions: false, rarefy: null }); await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(200);
  console.log('1 species / 1 size:', await page.$$eval('#charts .chart h2', els => els.map(e => e.textContent)), '|', (await page.$eval('#reading', e => e.innerText)).replace(/\n/g, ' ').slice(0, 400));
  await loadRecords(page, file('none.csv', csv([['Far', 100, 10], ['Far', 101, 11]]), 'text/csv')); await page.selectOption('#recCrsType', 'lonlat');
  const r = await run(page, { sizes: '25, 50' }); console.log(r.log.split('\n').slice(-3).join(' / '));
  await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(200);
  const reading = (await page.$eval('#reading', e => e.innerText)).replace(/\n/g, ' ');
  console.log('zero occupied:', await page.$$eval('#charts .chart h2', els => els.map(e => e.textContent)), '|', reading.slice(0, 500));
  check('no Infinity/null/NaN in reading with zero occupied cells', !/Infinity|null|NaN|undefined/.test(reading), reading.match(/Infinity|null|NaN|undefined/g)?.join(','));
  const sumHtml = await page.$eval('#summaryTable', e => e.innerText); console.log('summary row (zero occupied):', sumHtml.replace(/\n/g, ' | ').slice(0, 300));
  console.log('legend (zero occupied):', await page.$eval('#legend', e => e.textContent));
  await page.click('.tabs button[data-tab=summary]');
}

section('8. Dark mode and phone width screenshots');
{
  await loadBoundary(page, [ROOT + '/test/demo_regions.geojson']); await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
  await run(page, { sizes: '10, 25', regions: true, minOverlap: 0.5, rarefy: 5 });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
  await page.screenshot({ path: ROOT + '/test/review_shot_dark.png', fullPage: true });
  await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(200); await page.screenshot({ path: ROOT + '/test/review_shot_dark_charts.png', fullPage: true });
  // computed colours of key elements in dark mode
  const dark = await page.evaluate(() => { const cs = e => getComputedStyle(e); return { body: cs(document.body).backgroundColor, text: cs(document.body).color, tip: cs($('tip')).backgroundColor, cellStroke: document.querySelector('#map path').getAttribute('stroke'), tabHidden: cs(document.querySelector('.tabs button:not(.on)')).color, hint: cs(document.querySelector('.hint')).color }; });
  console.log('dark computed:', JSON.stringify(dark));
  await page.click('.tabs button[data-tab=summary]');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 400, height: 800 }); await page.waitForTimeout(400);
  const layout = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, overflow: Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(e).display !== 'none').slice(0, 12).map(e => e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ' right=' + Math.round(e.getBoundingClientRect().right)) }));
  console.log('phone layout:', JSON.stringify(layout));
  check('no horizontal page scroll at 400 px', layout.scrollW <= layout.clientW, `${layout.scrollW} > ${layout.clientW}`);
  await page.screenshot({ path: ROOT + '/test/review_shot_phone.png', fullPage: true });
  await page.click('.tabs button[data-tab=export]'); await page.waitForTimeout(200); await page.screenshot({ path: ROOT + '/test/review_shot_phone_export.png', fullPage: true });
  await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(200); await page.screenshot({ path: ROOT + '/test/review_shot_phone_charts.png', fullPage: true });
}

console.log('\nerrors:', errors.map(e => e.split('\n')[0]));
await browser.close();
