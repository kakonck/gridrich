// UTM boundary + UTM records vs lon/lat records (same demo data)
import { open, file, loadBoundary, loadRecords, run, results, section, check, ROOT } from './review_lib.mjs';
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(import.meta.url);
const XLSX = require(ROOT + '/lib/xlsx.full.min.js'); const proj4 = require(ROOT + '/lib/proj4.js');
const { browser, page, errors } = await open();
const utm = '+proj=utm +zone=13 +datum=WGS84 +units=m +no_defs';
console.log(await loadBoundary(page, ['demo_utm.shp', 'demo_utm.dbf', 'demo_utm.prj'].map(n => ROOT + '/test/shp/' + n)));
const wbd = XLSX.read(fs.readFileSync(ROOT + '/test/demo_occurrences.csv'), { type: 'buffer' }); const recs = XLSX.utils.sheet_to_json(wbd.Sheets[wbd.SheetNames[0]]);
const rows = recs.filter(m => m.species && isFinite(Number(m.decimalLongitude)) && isFinite(Number(m.decimalLatitude))).map(m => { const p = proj4('EPSG:4326', utm, [Number(m.decimalLongitude), Number(m.decimalLatitude)]); return `${m.species},${p[0].toFixed(3)},${p[1].toFixed(3)}`; });
section('13. UTM boundary (prj) + UTM records');
console.log(await loadRecords(page, file('utm_recs.csv', 'species,x,y\n' + rows.join('\n') + '\n', 'text/csv')));
await page.selectOption('#recCrsType', 'utm'); await page.fill('#rUtmZone', '13'); await page.selectOption('#rUtmHemi', 'N');
const r = await run(page, { sizes: '25', minOverlap: 0.5, hex: false, rarefy: null }); console.log(r.log); const R = (await results(page))[0];
await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
const r2 = await run(page, {}); console.log(r2.log); const R2 = (await results(page))[0];
// records lying exactly on the boundary outline can fall either side after a different coordinate path (UTM -> LAEA vs lon/lat -> LAEA); allow a handful
check('UTM records give the same counts as lon/lat records (within 3 edge records)', Math.abs(R.nAssigned - R2.nAssigned) <= 3 && R.summary.gamma_richness === R2.summary.gamma_richness && R.summary.n_occupied === R2.summary.n_occupied, `${R.nAssigned} vs ${R2.nAssigned}`);
console.log('errors:', errors); await browser.close();
