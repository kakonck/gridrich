// Screening and safety checks added in 1.0.0: boundary filter, taxon rank, coordinate uncertainty,
// coordinate-system confirmation without .prj, antimeridian, large extent, reproducibility metadata.
import { open, file, loadBoundary, loadRecords, run, results, section, check, squareGeo, fc, feat, csv } from './review_lib.mjs';
import fs from 'fs';
const { browser, page, errors } = await open();
const sq = squareGeo(90.4, 23.8, 0.5); // 1 x 1 degree square
const hole = squareGeo(90.4, 23.8, 0.1);
const withHole = { type: 'Polygon', coordinates: [sq.coordinates[0], hole.coordinates[0]] };

section('A. Records outside the boundary and in holes are excluded from grids and regions');
await loadBoundary(page, [file('h.geojson', JSON.stringify(fc([feat(withHole, { name: 'A' })])))]);
const rows = [['Sp1', 90.1, 23.5, 'SPECIES', 100], ['Sp1', 90.7, 24.1, 'SPECIES', 500], ['Sp2', 90.4, 23.8, 'SPECIES', 100], /* in hole */ ['Sp2', 90.45, 23.75, 'SPECIES', 20000], /* in hole */
  ['Sp3', 91.5, 23.8, 'SPECIES', 100], /* outside */ ['Sp3', 90.85, 24.25, 'SPECIES', 100], ['Sp4', 90.2, 23.4, 'GENUS', 100], ['Sp5', 90.2, 24.2, 'SPECIES', 50000], ['Sp6', 90.6, 23.6, 'SPECIES', '']];
await loadRecords(page, file('r.csv', csv(rows, ['species', 'decimalLongitude', 'decimalLatitude', 'taxonRank', 'coordinateUncertaintyInMeters']), 'text/csv'));
await page.evaluate(() => { document.querySelector('details.opt').open = true; });
check('rank and uncertainty columns detected', await page.evaluate(() => $('colRank').value === 'taxonRank' && $('colUnc').value === 'coordinateUncertaintyInMeters'));
let r = await run(page, { sizes: '25, 50', minOverlap: 0, hex: false, rarefy: null, regions: false });
let d = await page.evaluate(() => S.dataSummary); let R = await results(page);
check('genus record dropped by rank filter', d.badRank === 1, JSON.stringify(d));
check('2 records in the hole + 1 outside excluded by the boundary test', d.outsideBoundary === 3, String(d.outsideBoundary));
check('5 records inside; assigned = 5 at both sizes', d.retained === 5 && R.every(g => g.nAssigned === 5 && g.sumNocc === 5), R.map(g => g.nAssigned).join(','));
check('uncertainty above cell size counted (50 km record at 25 km grid)', R[0].summary.records_uncertainty_above_cell === 1 && R[1].summary.records_uncertainty_above_cell === 0, R.map(g => g.summary.records_uncertainty_above_cell).join(','));
check('missing uncertainty kept and counted', d.uncMissing === 1, String(d.uncMissing));
await page.fill('#maxUnc', '10000'); r = await run(page, {}); d = await page.evaluate(() => S.dataSummary);
check('maximum uncertainty filter drops the 20 km and 50 km records (before the boundary test)', d.badUnc === 2 && d.retained === 4, JSON.stringify([d.badUnc, d.retained]));
await page.selectOption('#rankKeep', 'all'); r = await run(page, {}); d = await page.evaluate(() => S.dataSummary);
check('rank filter off keeps the genus record (retained 5)', d.badRank == null && d.retained === 5, JSON.stringify([d.badRank, d.retained]));
check('methods statement reports outside-boundary and uncertainty counts', await page.evaluate(() => /fell outside the study-area outline/.test(methodsStatement()) && /coordinate uncertainty above 10000 m/.test(methodsStatement())));
const cfg = await page.evaluate(() => analysisConfig());
check('config carries SHA-256 of both inputs and the grid origin', /^[0-9a-f]{64}$/.test(cfg.records.sha256 || '') && cfg.boundary.files && /^[0-9a-f]{64}$/.test(cfg.boundary.files[0].sha256 || '') && typeof cfg.grid.origin.x === 'number', JSON.stringify([cfg.records.sha256, cfg.boundary.files, cfg.grid.origin.x]));
await page.fill('#maxUnc', '');

section('C. Shapefile without .prj must be confirmed');
const shpBuf = fs.readFileSync('test/demo_boundary_shp.zip');
// build a zip without the .prj using JSZip inside the page
const noPrj = await page.evaluate(async b64 => { const z = await JSZip.loadAsync(Uint8Array.from(atob(b64), c => c.charCodeAt(0))); for (const n of Object.keys(z.files)) if (/\.prj$/i.test(n)) z.remove(n); const out = await z.generateAsync({ type: 'base64' }); return out; }, shpBuf.toString('base64'));
let st = await loadBoundary(page, [file('noprj.zip', Buffer.from(noPrj, 'base64'), 'application/zip')]);
check('zip without .prj asks for confirmation instead of assuming WGS84', /Confirm/.test(st.status) && /No \.prj/.test(st.info), st.status + ' | ' + st.info);
check('lon/lat preselected', await page.$eval('#boundaryCrsType', e => e.value) === 'lonlat');
await page.click('#bApplyCrs'); await page.waitForTimeout(400);
st = { status: await page.$eval('#boundaryStatus', e => e.textContent), info: await page.$eval('#boundaryInfo', e => e.textContent) };
check('after confirmation the boundary loads', /Loaded/.test(st.status), st.status + ' | ' + st.info.slice(0, 80));
st = await loadBoundary(page, [file('withprj.zip', shpBuf, 'application/zip')]);
check('zip with .prj loads directly', /Loaded/.test(st.status), st.status);

section('D. Antimeridian and very large extents');
const dateline = { type: 'Polygon', coordinates: [[[170, -20], [-170, -20], [-170, -10], [170, -10], [170, -20]]] };
st = await loadBoundary(page, [file('dl.geojson', JSON.stringify(fc([feat(dateline)])))]);
check('antimeridian-crossing boundary rejected', /Failed/.test(st.status) && /antimeridian|180 degrees/.test(st.info), st.info);
const huge = { type: 'Polygon', coordinates: [[[-60, -30], [40, -30], [40, 40], [-60, 40], [-60, -30]]] };
st = await loadBoundary(page, [file('huge.geojson', JSON.stringify(fc([feat(huge)])))]);
check('very large area accepted with a distortion warning', /Loaded/.test(st.status) && /km across/.test(st.info), st.info.slice(-160));

section('E. Presence/absence omission note and export sheets');
await loadBoundary(page, [file('sq.geojson', JSON.stringify(fc([feat(sq)])))]);
await loadRecords(page, file('edge.csv', csv([['E', 90.1, 23.5], ['F', 90.7, 24.1]], ['species', 'lon', 'lat']), 'text/csv'));
r = await run(page, { sizes: '50', minOverlap: 0 });
const cols = await page.evaluate(() => SUM_COLS.concat(CELL_COLS));
check('renamed columns present', cols.includes('mean_richness_occupied') && cols.includes('record_density_per_km2') && cols.includes('records_in_removed_cells') && !cols.includes('occ_per_km2'), cols.join(','));
console.log('errors:', errors);
await browser.close();
