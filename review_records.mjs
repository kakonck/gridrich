// Record table parsing and coordinate handling.
import { open, file, loadBoundary, loadRecords, run, results, section, check, squareGeo, fc, feat, csv, ROOT } from './review_lib.mjs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require(ROOT + '/lib/xlsx.full.min.js');

const { browser, page, errors } = await open();
// boundary: 1 deg square around Dhaka-ish (90.4, 23.8)
const B = fc([feat(squareGeo(90.4, 23.8, 0.5))]);
await loadBoundary(page, [file('b.geojson', JSON.stringify(B))]);
const inside = (i) => [(90.4 - 0.45 + 0.9 * ((i * 0.37) % 1)).toFixed(5), (23.8 - 0.45 + 0.9 * ((i * 0.61) % 1)).toFixed(5)];

async function runTable(label, f, opts = {}) {
  section(label);
  const L = await loadRecords(page, f);
  console.log('status:', L.status, '| info:', L.info, '| files:', L.files, '| cols:', JSON.stringify(L.cols));
  if (opts.select) { for (const [id, v] of Object.entries(opts.select)) await page.selectOption('#' + id, v); }
  if (!opts.keepCrs) await page.selectOption('#recCrsType', opts.crs || 'lonlat');
  if (opts.crs) { await page.selectOption('#recCrsType', opts.crs); if (opts.zone) { await page.fill('#rUtmZone', String(opts.zone)); await page.selectOption('#rUtmHemi', opts.hemi || 'N'); } if (opts.proj) await page.fill('#rProj', opts.proj); }
  const r = await run(page, { sizes: '25', minOverlap: 0, hex: false, rarefy: null, speciesList: true });
  console.log(r.log.split('\n').filter(l => !/Building|Boundary area/.test(l)).join('\n'));
  const R = await results(page);
  return { L, r, R: R && R[0] };
}

// 1. species names with commas, quotes, semicolons, non-ASCII, spaces; extra "name" column
{
  const names = ['Oryza sativa', '"Oryza, quoted"', 'Oryza; semi', 'ধান (Oryza)', 'Ærø plant', '  Oryza sativa  ', 'Oryza  sativa', 'Oryza sativa'];
  const rows = names.map((n, i) => { const [x, y] = inside(i); return `${/[",]/.test(n) ? '"' + n.replace(/"/g, '""') + '"' : n},site${i},${x},${y}`; });
  const text = 'species,name,decimalLongitude,decimalLatitude\n' + rows.join('\n') + '\n';
  const { R } = await runTable('1. odd species names + a "name" column', file('names.csv', text, 'text/csv'));
  console.log('species found:', JSON.stringify(R.species));
  check('species column picked over name', (await page.$eval('#colSpecies', e => e.value)) === 'species');
  check('5 distinct species (trim + internal whitespace collapse merges 3 Oryza sativa)', R.nSpecies === 5, R.nSpecies + ' ' + JSON.stringify(R.species));
  check('Bengali and accented names intact', R.species.includes('ধান (Oryza)') && R.species.includes('Ærø plant'));
  check('quoted name with comma intact', R.species.includes('"Oryza, quoted"'), JSON.stringify(R.species));
  const cellList = await page.evaluate(() => S.results[0].cells.filter(c => c.richness > 1).map(c => c.species_list));
  console.log('species_list containing "Oryza; semi" is ambiguous when split on "; ":', JSON.stringify(cellList.filter(s => s.includes('semi'))));
}

// 2. decimal commas as strings, semicolon delimited (typical European CSV)
{
  const rows = []; for (let i = 0; i < 6; i++) { const [x, y] = inside(i); rows.push(`Sp${i % 2};${String(x).replace('.', ',')};${String(y).replace('.', ',')}`); }
  const text = 'species;lon;lat\n' + rows.join('\n') + '\n';
  const { R, r } = await runTable('2. semicolon CSV with decimal commas', file('decimal_comma.csv', text, 'text/csv'), { keepCrs: true });
  const raw = await page.evaluate(() => S.records.rows.slice(0, 2));
  console.log('parsed rows:', JSON.stringify(raw));
  check('6 records inside', R && R.nAssigned === 6, R && R.nAssigned + ' | ' + r.log.replace(/\n/g, ' / '));
}
// 2b. comma CSV with quoted decimal-comma coordinates
{
  const rows = []; for (let i = 0; i < 6; i++) { const [x, y] = inside(i); rows.push(`Sp${i % 2},"${String(x).replace('.', ',')}","${String(y).replace('.', ',')}"`); }
  const text = 'species,lon,lat\n' + rows.join('\n') + '\n';
  const { R, r } = await runTable('2b. comma CSV, quoted decimal-comma coordinates', file('decimal_comma2.csv', text, 'text/csv'), { keepCrs: true });
  console.log('parsed rows:', JSON.stringify(await page.evaluate(() => S.records.rows.slice(0, 2))));
  check('6 records inside', R && R.nAssigned === 6, R && R.nAssigned + ' | ' + r.log.replace(/\n/g, ' / '));
}

// 2c. sticky CRS: after a file that triggered UTM, load a plain lon/lat file without touching the selector
{
  const rows = []; for (let i = 0; i < 6; i++) { const [x, y] = inside(i); rows.push(`Sp${i % 2},${x},${y}`); }
  const { L, R } = await runTable('2c. plain lon/lat file loaded right after a UTM-guessed file (selector untouched)', file('plain.csv', 'species,lon,lat\n' + rows.join('\n') + '\n', 'text/csv'), { keepCrs: true });
  check('CRS selector reset to lonlat for the new file', L.cols.crs === 'lonlat', 'selector = ' + L.cols.crs);
  check('6 records inside', R && R.nAssigned === 6, R && R.nAssigned);
}
// 3. XLSX input
{
  const data = [['species', 'longitude', 'latitude', 'note']]; for (let i = 0; i < 8; i++) { const [x, y] = inside(i); data.push([`Sp${i % 3}`, Number(x), Number(y), 'x']); }
  data.push(['ধান', '90,41', '23,81', 'string coords with decimal comma']);
  data.push(['Sp0', null, 23.8, 'missing lon']);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'data'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['other']]), 'second');
  const buf = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const { R, r } = await runTable('3. XLSX input (2 sheets; string coords with decimal comma; missing lon)', file('recs.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  check('9 records inside, 1 dropped', R && R.nAssigned === 9 && /Dropped 1 record/.test(r.log), R && R.nAssigned);
  check('Bengali name from xlsx intact', R && R.species.includes('ধান'));
}

// 4. TSV
{
  const rows = []; for (let i = 0; i < 5; i++) { const [x, y] = inside(i); rows.push(`Sp${i}\t${x}\t${y}`); }
  const { R } = await runTable('4. TSV', file('recs.tsv', 'scientific_name\tlongitude\tlatitude\n' + rows.join('\n') + '\n', 'text/tab-separated-values'));
  check('5 records', R && R.nAssigned === 5, R && R.nAssigned);
}
// 5. BOM
{
  const rows = []; for (let i = 0; i < 5; i++) { const [x, y] = inside(i); rows.push(`Sp${i},${x},${y}`); }
  const { R, L } = await runTable('5. UTF-8 BOM', file('bom.csv', Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('species,lon,lat\r\n' + rows.join('\r\n') + '\r\n')]), 'text/csv'));
  check('BOM stripped from first header', L.cols.all[0] === 'species', JSON.stringify(L.cols.all));
  check('5 records', R && R.nAssigned === 5, R && R.nAssigned);
}
// 5b. Latin-1 encoded file (not UTF-8)
{
  const rows = []; for (let i = 0; i < 3; i++) { const [x, y] = inside(i); rows.push(`Sp\xe9${i},${x},${y}`); }
  const { R } = await runTable('5b. Latin-1 (cp1252) encoded species names', file('latin1.csv', Buffer.from('species,lon,lat\n' + rows.join('\n') + '\n', 'latin1'), 'text/csv'));
  console.log('species:', JSON.stringify(R && R.species), 'raw rows:', JSON.stringify(await page.evaluate(() => S.records.rows)));
}
// 6. header with extra columns, duplicate column names, empty header cells
{
  const rows = []; for (let i = 0; i < 4; i++) { const [x, y] = inside(i); rows.push(`Sp${i},${x},${y},a,b`); }
  const { L, R } = await runTable('6. header has extra empty columns', file('extra.csv', 'species,lon,lat,,\n' + rows.join('\n') + '\n', 'text/csv'));
  console.log('columns:', JSON.stringify(L.cols.all));
  const { L: L2, R: R2 } = await runTable('6b. duplicate column names (lat twice)', file('dup.csv', 'species,lon,lat,lat\n' + rows.map(r => r.replace(/,a,b$/, ',99')).join('\n') + '\n', 'text/csv'));
  console.log('columns:', JSON.stringify(L2.cols.all), 'lat picked:', L2.cols.lat);
  check('first lat column picked', L2.cols.lat === 'lat' && R2 && R2.nAssigned === 4, L2.cols.lat + ' ' + (R2 && R2.nAssigned));
}
// 7. empty file, header only, wrong file type
{
  section('7. empty file'); console.log(await loadRecords(page, file('empty.csv', '', 'text/csv')));
  section('7b. header only'); console.log(await loadRecords(page, file('hdr.csv', 'species,lon,lat\n', 'text/csv')));
  section('7c. header only + blank lines'); console.log(await loadRecords(page, file('hdr2.csv', 'species,lon,lat\n\n\n', 'text/csv')));
  section('7d. a PNG dropped as records'); console.log(await loadRecords(page, file('x.png', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 1, 2, 3]), 'image/png')));
  section('7e. GeoJSON dropped as records'); console.log(await loadRecords(page, file('x.json', JSON.stringify(B), 'application/json')));
  console.log('run button enabled after failed loads?', !(await page.$eval('#runBtn', b => b.disabled)));
}
// 8. columns not recognised -> user must pick; names like "name", "X_COORD"
{
  const rows = []; for (let i = 0; i < 4; i++) { const [x, y] = inside(i); rows.push(`Sp${i},${x},${y}`); }
  const { L } = await runTable('8. unrecognised column names (name, X_COORD, Y_COORD)', file('unk.csv', 'name,X_COORD,Y_COORD\n' + rows.join('\n') + '\n', 'text/csv'));
  console.log('selected:', JSON.stringify(L.cols));
  await page.selectOption('#colSpecies', 'name'); await page.selectOption('#colLon', 'X_COORD'); await page.selectOption('#colLat', 'Y_COORD');
  const r = await run(page, {}); console.log(r.log.split('\n').slice(-2).join(' / '));
}
// 9. swapped lon/lat
{
  const rows = []; for (let i = 0; i < 20; i++) { const [x, y] = inside(i); rows.push(`Sp${i % 3},${y},${x}`); }
  const { r, R } = await runTable('9. swapped lon/lat columns (lat values in lon column)', file('swap.csv', 'species,lon,lat\n' + rows.join('\n') + '\n', 'text/csv'), { keepCrs: true });
  check('swap is flagged in the log or status', /swap|reversed|latitude.*longitude/i.test(r.log), r.log.split('\n').slice(-3).join(' / '));
}
// 9b. swapped where lat > 90 (Saskatchewan-like)
{
  const rows = []; for (let i = 0; i < 20; i++) rows.push(`Sp${i % 3},${52 + (i % 5) / 10},${-106 - (i % 7) / 10}`);
  const { r } = await runTable('9b. swapped columns, |lat| > 90', file('swap2.csv', 'species,lon,lat\n' + rows.join('\n') + '\n', 'text/csv'), { keepCrs: true });
  check('swap hint given', /swap|reversed/i.test(r.log), r.log.split('\n').slice(-3).join(' / '));
}
// 10. one bad row flips CRS guess
{
  const rows = []; for (let i = 0; i < 30; i++) { const [x, y] = inside(i); rows.push(`Sp${i % 3},${x},${y}`); }
  rows.push('Sp0,900.5,23.8');
  const { L, r, R } = await runTable('10. lon/lat file with ONE out-of-range typo row', file('typo.csv', 'species,lon,lat\n' + rows.join('\n') + '\n', 'text/csv'), { keepCrs: true });
  check('CRS selector still lonlat', L.cols.crs === 'lonlat', 'selector = ' + L.cols.crs + '; status ' + L.status);
  check('30 records counted, 1 dropped', R && R.nAssigned === 30, R && R.nAssigned + ' | ' + r.log.split('\n').slice(-2).join(' / '));
}
// 11. values out of range with lonlat selected
{
  const rows = []; for (let i = 0; i < 5; i++) { const [x, y] = inside(i); rows.push(`Sp${i},${x},${y}`); }
  rows.push('Bad,181,0', 'Bad,0,-91', 'Bad,NaN,1', 'Bad,,1', 'Bad,1e400,1', 'Bad,0x10,1');
  const { r, R } = await runTable('11. out-of-range and odd numeric values', file('range.csv', 'species,lon,lat\n' + rows.join('\n') + '\n', 'text/csv'), { crs: 'lonlat' });
  console.log(r.log);
  check('5 records assigned', R && R.nAssigned === 5, R && R.nAssigned);
}
// 12. UTM records against lon/lat boundary; then PROJ string records
{
  const proj4 = require(ROOT + '/lib/proj4.js');
  const utm = '+proj=utm +zone=46 +datum=WGS84 +units=m +no_defs';
  const rows = []; for (let i = 0; i < 10; i++) { const [x, y] = inside(i); const p = proj4('EPSG:4326', utm, [Number(x), Number(y)]); rows.push(`Sp${i % 2},${p[0].toFixed(2)},${p[1].toFixed(2)}`); }
  const { L, r, R } = await runTable('12. UTM 46N records (auto-detected projected?)', file('utm.csv', 'species,easting,northing\n' + rows.join('\n') + '\n', 'text/csv'), { crs: 'utm', zone: 46, hemi: 'N' });
  check('projected guess set UTM', L.cols.crs === 'utm', L.cols.crs);
  check('10 records inside', R && R.nAssigned === 10, R && R.nAssigned);
  const { r: r2, R: R2 } = await runTable('12b. same via PROJ string', file('utm2.csv', 'species,easting,northing\n' + rows.join('\n') + '\n', 'text/csv'), { crs: 'proj', proj: utm });
  check('10 records inside via PROJ', R2 && R2.nAssigned === 10, R2 && R2.nAssigned);
  const { r: r3 } = await runTable('12c. PROJ string garbage', file('utm3.csv', 'species,easting,northing\n' + rows.join('\n') + '\n', 'text/csv'), { crs: 'proj', proj: '+proj=nonsense' });
  console.log('garbage PROJ ->', r3.log.split('\n').slice(-1)[0]);
  const { r: r4, R: R4 } = await runTable('12d. wrong UTM zone (45) silently', file('utm4.csv', 'species,easting,northing\n' + rows.join('\n') + '\n', 'text/csv'), { crs: 'utm', zone: 45, hemi: 'N' });
  console.log('wrong zone ->', r4.log.split('\n').slice(-2).join(' / '));
}
// 13. UTM records with a projected (UTM) boundary
{
  const proj4 = require(ROOT + '/lib/proj4.js');
  const utm = '+proj=utm +zone=13 +datum=WGS84 +units=m +no_defs';
  await loadBoundary(page, ['demo_utm.shp', 'demo_utm.dbf', 'demo_utm.prj'].map(n => ROOT + '/test/shp/' + n));
  // records: reproject demo_occurrences to UTM 13
  const fs = await import('fs'); const lines = fs.readFileSync(ROOT + '/test/demo_occurrences.csv', 'utf8').trim().split('\n').slice(1);
  const wbd = XLSX.read(fs.readFileSync(ROOT + '/test/demo_occurrences.csv'), { type: 'buffer' }); const recs = XLSX.utils.sheet_to_json(wbd.Sheets[wbd.SheetNames[0]]);
  const rows = recs.map(m => { const p = proj4('EPSG:4326', utm, [Number(m.decimalLongitude), Number(m.decimalLatitude)]); return `${m.species},${p[0].toFixed(3)},${p[1].toFixed(3)}`; });
  const { r, R } = await runTable('13. UTM boundary (prj) + UTM records', file('utm_recs.csv', 'species,x,y\n' + rows.join('\n') + '\n', 'text/csv'), { crs: 'utm', zone: 13, hemi: 'N' });
  await loadRecords(page, ROOT + '/test/demo_occurrences.csv'); await page.selectOption('#recCrsType', 'lonlat');
  const r2 = await run(page, {}); const R2 = (await results(page))[0];
  check('UTM records give the same counts as lon/lat records', R && R2 && R.nAssigned === R2.nAssigned && R.summary.gamma_richness === R2.summary.gamma_richness, `${R && R.nAssigned} vs ${R2.nAssigned}`);
}

console.log('\nerrors:', errors);
await browser.close();
