// Leftover checks: HTML injection via species names, area-0 suggest sizes, projected boundary loaded after a run, numeric-looking species codes.
import { open, file, loadBoundary, loadRecords, run, results, section, check, squareGeo, fc, feat, csv, ROOT } from './review_lib.mjs';
const { browser, page, errors } = await open();
const sq = feat(squareGeo(90.4, 23.8, 0.5));
await loadBoundary(page, [file('sq.geojson', JSON.stringify(sq))]);
section('1. species names with HTML / numeric-looking codes');
{
  const rows = [['<i onmouseover=alert(1)>inj</i>', 90.4, 23.8], ['<i onmouseover=alert(1)>inj</i>', 90.41, 23.81], ['<i onmouseover=alert(1)>inj</i>', 90.1, 23.5], ['0012', 90.4, 23.8], ['1e3', 90.4, 23.8], ['2020-01-05', 90.4, 23.8], ['TRUE', 90.4, 23.8], ['Carex sp.', 90.2, 24.1]];
  await loadRecords(page, file('inj.csv', csv(rows), 'text/csv')); await page.selectOption('#recCrsType', 'lonlat');
  console.log('raw species values as parsed:', JSON.stringify(await page.evaluate(() => S.records.rows.map(r => [r.species, typeof r.species]))));
  await run(page, { sizes: '25', minOverlap: 0, rarefy: null, speciesList: true, regions: false });
  const R = (await results(page))[0]; console.log('species:', JSON.stringify(R.species));
  check('species codes "0012" and "1e3" kept as text', R.species.includes('0012') && R.species.includes('1e3'), JSON.stringify(R.species));
  await page.click('.tabs button[data-tab=charts]'); await page.waitForTimeout(200);
  const live = await page.$$eval('#charts i, #reading i', els => els.length);
  console.log('live <i> elements injected into charts/reading:', live);
  check('chart reading escapes species names', live === 0);
  const tipHtml = await page.evaluate(() => { const p = Array.from(document.querySelectorAll('#map path')).find(p => p._cell && p._cell.n_occ > 0); const r = p.getBoundingClientRect(); p.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); return { html: $('tip').innerHTML, live: $('tip').querselectorAll ? 0 : $('tip').querySelectorAll('i').length }; });
  console.log('tooltip:', tipHtml.html.slice(0, 160)); check('tooltip escapes species_list', tipHtml.live === 0);
  const th = await page.$eval('#speciesTable tbody', e => e.querySelectorAll('i').length); check('species table escapes', th === 0);
}
section('2. Suggest sizes on a zero-area (bow-tie) boundary and on a tiny one');
{
  await loadBoundary(page, [file('bow.geojson', JSON.stringify(fc([feat({ type: 'Polygon', coordinates: [[[90, 23.5], [91, 24.5], [91, 23.5], [90, 24.5], [90, 23.5]]] })])))]);
  await page.click('#suggestSizes'); console.log('bow-tie suggest ->', await page.$eval('#cellSizes', e => e.value), '|', await page.$eval('#suggestInfo', e => e.textContent));
  await loadBoundary(page, [file('tiny.geojson', JSON.stringify(feat(squareGeo(90.4, 23.8, 0.001))))]);
  await page.click('#suggestSizes'); console.log('tiny (0.05 km2) suggest ->', await page.$eval('#cellSizes', e => e.value), '|', await page.$eval('#suggestInfo', e => e.textContent));
  await loadBoundary(page, [ROOT + '/test/demo_boundary.geojson']); await page.click('#suggestSizes'); console.log('demo suggest ->', await page.$eval('#cellSizes', e => e.value));
}
section('3. projected shapefile loaded (not applied) after a run: stale results + exports');
{
  await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
  await run(page, { sizes: '25', minOverlap: 0.5 });
  await loadBoundary(page, ['demo_utm.shp', 'demo_utm.dbf'].map(n => ROOT + '/test/shp/' + n));
  const st = await page.evaluate(() => ({ hasPfeat: !!(S.boundary && S.boundary.pfeat), results: !!S.results, paths: document.querySelectorAll('#map path').length, tiles: $('tiles').textContent.replace(/\s+/g, ' ').slice(0, 60), runDisabled: $('runBtn').disabled }));
  console.log(JSON.stringify(st));
  const e0 = errors.length; await page.click('.tabs button[data-tab=export]'); await page.click('#dlGeojson'); await page.waitForTimeout(300); await page.click('#dlXlsx'); await page.waitForTimeout(500);
  await page.evaluate(() => { $('mapVar').value = 'n_occ'; $('mapVar').dispatchEvent(new Event('change')); }); await page.waitForTimeout(200);
  console.log('errors after exports/map change:', errors.slice(e0).map(e => e.split('\n')[0]));
  check('no crash with pending-CRS boundary after a run', errors.length === e0);
}
section('4. prop_in clamp for the whole-boundary cell');
{
  await loadBoundary(page, [file('sq.geojson', JSON.stringify(sq))]); await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
  await run(page, { sizes: '5000', minOverlap: 0 });
  console.log(JSON.stringify(await page.evaluate(() => S.results[0].cells.map(c => ({ prop_in: c.prop_in, area_in: c.area_in_km2, cell_area: c.cell_area_km2, lon: c.lon, lat: c.lat })))));
}
console.log('errors:', errors.map(e => e.split('\n')[0])); await browser.close();
