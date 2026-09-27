// Boundary formats, degenerate geometries, regions, state resets.
import { open, file, loadBoundary, loadRecords, run, results, section, check, squareGeo, fc, feat, csv, ROOT } from './review_lib.mjs';
import fs from 'fs';

const { browser, page, errors } = await open();
const sq = squareGeo(90.4, 23.8, 0.5);
const pts = []; for (let i = 0; i < 40; i++) pts.push([`Sp${i % 6}`, (90.4 - 0.45 + 0.9 * ((i * 0.37) % 1)).toFixed(5), (23.8 - 0.45 + 0.9 * ((i * 0.61) % 1)).toFixed(5)]);
const recFile = file('pts.csv', csv(pts), 'text/csv');

async function tryBoundary(label, files, o = {}) {
  section(label);
  const st = await loadBoundary(page, files);
  console.log(st);
  const info = await page.evaluate(() => S.boundary && S.boundary.pfeat ? { area: S.boundary.areaKm2, parts: polysOf(S.boundary.feature.geometry).length, holes: polysOf(S.boundary.feature.geometry).reduce((s, p) => s + p.length - 1, 0), notUnioned: S.boundary.notUnioned, nFeat: S.boundary.fc.features.length, regionBox: !$('regionBox').hidden, regionField: $('regionField').value, regionOpts: Array.from($('regionField').options).map(o => o.value) } : null);
  console.log(JSON.stringify(info));
  return { st, info };
}

const PART = process.argv[2] || 'all';
let base = { info: { area: 11286.512350096638 } }, baseArea = base.info.area;
if (PART !== 'b') {
base = await tryBoundary('1. GeoJSON Feature (not FeatureCollection)', [file('f.geojson', JSON.stringify(feat(sq, { name: 'A' })))]);
baseArea = base.info.area;
await tryBoundary('2. bare Geometry', [file('g.json', JSON.stringify(sq))]);
{
  // MultiPolygon with holes: two squares, each with a hole
  const holeSq = (lon, lat, h, hh) => [squareGeo(lon, lat, h).coordinates[0], squareGeo(lon, lat, hh).coordinates[0].slice().reverse()];
  const mp = { type: 'MultiPolygon', coordinates: [holeSq(90.0, 23.8, 0.2, 0.05), holeSq(90.8, 23.8, 0.2, 0.1)] };
  const { info } = await tryBoundary('3. MultiPolygon with 2 holes', [file('mp.geojson', JSON.stringify(fc([feat(mp)])))]);
  check('2 parts, 2 holes kept', info && info.parts === 2 && info.holes === 2);
  await loadRecords(page, recFile); await page.selectOption('#recCrsType', 'lonlat');
  const r = await run(page, { sizes: '10', minOverlap: 0, hex: false, rarefy: null });
  const R = (await results(page))[0];
  check('sum area_in == boundary area with holes', Math.abs(R.sumAreaIn - info.area) < 1e-6, `${R.sumAreaIn} vs ${info.area}`);
  // a record inside a hole must be reported outside (if the hole cell is dropped) or counted in a kept edge cell; check n records in cells with prop_in 0? n/a
  const holePt = await page.evaluate(() => { const p = proj4('EPSG:4326', S.boundary.proj, [90.0, 23.8]); return S.results[0].cells.filter(c => Math.abs(c.cx - p[0]) < 5000 && Math.abs(c.cy - p[1]) < 5000).map(c => [c.cell_id, c.prop_in]); });
  console.log('cells around the hole centre (90.0,23.8):', JSON.stringify(holePt));
}
{
  const mixed = fc([feat({ type: 'Point', coordinates: [90.4, 23.8] }, { name: 'pt' }), feat(sq, { name: 'poly' }), feat({ type: 'LineString', coordinates: [[90, 23], [91, 24]] }), feat(null, { name: 'nullgeom' })]);
  const { info } = await tryBoundary('4. FeatureCollection mixing point, line, null geometry and polygon', [file('mixed.geojson', JSON.stringify(mixed))]);
  check('only the polygon kept, area unchanged', info && info.nFeat === 1 && Math.abs(info.area - baseArea) < 1e-6);
}
{
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>KML area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
89.9,23.3,0 90.9,23.3,0 90.9,24.3,0 89.9,24.3,0 89.9,23.3,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>KML pt</name><Point><coordinates>90.4,23.8,0</coordinates></Point></Placemark></Document></kml>`;
  const { info } = await tryBoundary('5. KML with altitude (3D coords) + a point', [file('b.kml', kml, 'application/vnd.google-earth.kml+xml')]);
  check('KML area equals GeoJSON square area', info && Math.abs(info.area - baseArea) < 1e-3, info && `${info.area} vs ${baseArea}`);
  const coordsLen = await page.evaluate(() => S.boundary.pfeat.geometry.coordinates[0][0].length);
  console.log('projected coordinate arity:', coordsLen);
  await loadRecords(page, recFile); const r = await run(page, { sizes: '10' }); console.log(r.log.split('\n').slice(-2).join(' / '));
  // GeoJSON export with 3D input -> check exported coords arity
  await page.click('.tabs button[data-tab=export]'); const dl = page.waitForEvent('download'); await page.click('#dlGeojson'); const d = await dl; const gj = JSON.parse(fs.readFileSync(await d.path(), 'utf8'));
  console.log('exported cell coordinate arity:', gj.features[0].geometry.coordinates[0][0].length, 'features', gj.features.length);
}
{
  const kmz = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>MultiGeometry</name><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>89.9,23.3 90.3,23.3 90.3,24.3 89.9,24.3 89.9,23.3</coordinates></LinearRing></outerBoundaryIs></Polygon><Polygon><outerBoundaryIs><LinearRing><coordinates>90.5,23.3 90.9,23.3 90.9,24.3 90.5,24.3 90.5,23.3</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark></Document></kml>`;
  await tryBoundary('5b. KML MultiGeometry (2 polygons in one placemark)', [file('b2.kml', kmz)]);
}
await tryBoundary('6. zipped shapefile', [ROOT + '/test/demo_boundary_shp.zip']);
{
  const gj = JSON.parse(fs.readFileSync(ROOT + '/test/demo_boundary.geojson', 'utf8'));
  const { info } = await tryBoundary('6b. same boundary as GeoJSON (compare area with zip)', [file('d.geojson', JSON.stringify(gj))]);
}
{
  // self-intersecting bow-tie polygon
  const bow = { type: 'Polygon', coordinates: [[[90, 23.5], [91, 24.5], [91, 23.5], [90, 24.5], [90, 23.5]]] };
  const { info, st } = await tryBoundary('7. self-intersecting (bow-tie) polygon', [file('bow.geojson', JSON.stringify(fc([feat(bow)])))]);
  check('invalid polygon rejected with instructions', st.status.includes('Failed') && /Self-intersecting/.test(st.info), st.info);
  await page.check('#repairKinks');
  const rep2 = await tryBoundary('7b. bow-tie with repair ticked', [file('bow.geojson', JSON.stringify(fc([feat(bow)])))]);
  check('repaired bow-tie: two triangles, area ~ 5700 km2, note in info', rep2.info && Math.abs(rep2.info.area - 5700) < 150 && /split into simple parts/.test(rep2.st.info), JSON.stringify(rep2.info));
  await page.uncheck('#repairKinks');
}
{
  const a = squareGeo(90.2, 23.8, 0.4), b = squareGeo(90.6, 23.8, 0.4); // overlap 0.4 deg wide
  const { st } = await tryBoundary('8. two overlapping polygons (rejected)', [file('ov.geojson', JSON.stringify(fc([feat(a, { name: 'A' }), feat(b, { name: 'B' })])))]);
  check('overlapping polygons rejected with the overlap area', st.status.includes('Failed') && /overlap each other by/.test(st.info), st.info);
  const c = squareGeo(91.4, 23.8, 0.4); // touches b along an edge, no overlap
  const { st: st2 } = await tryBoundary('8b. two adjacent polygons sharing an edge (accepted)', [file('adj.geojson', JSON.stringify(fc([feat(b, { name: 'B' }), feat(c, { name: 'C' })])))]);
  check('adjacent polygons accepted', st2.status.includes('Loaded'), st2.info);
}
{
  // >40000 vertices: two overlapping circles densified -> not unioned path
  const circle = (lon, lat, r, n) => { const ring = []; for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; ring.push([lon + r * Math.cos(a), lat + r * Math.sin(a) * 0.92]); } ring.push(ring[0]); return { type: 'Polygon', coordinates: [ring] }; };
  const big = fc([feat(circle(90.2, 23.8, 0.4, 25000), { n: 'A' }), feat(circle(90.6, 23.8, 0.4, 25000), { n: 'B' })]);
  const { st } = await tryBoundary('9. two overlapping polygons with 50k vertices (union skipped, overlap test)', [file('bigov.geojson', JSON.stringify(big))]);
  check('detailed overlapping polygons rejected', st.status.includes('Failed') && /overlap each other by/.test(st.info), st.info);
}
}
if (PART !== 'a') {
{
  // 400k vertices single polygon: performance
  const n = 400000; const ring = []; for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; const rr = 0.5 + 0.02 * Math.sin(40 * a); ring.push([90.4 + rr * Math.cos(a), 23.8 + rr * Math.sin(a) * 0.92]); } ring.push(ring[0]);
  const t0 = Date.now();
  const { info } = await tryBoundary('10. single polygon with 400k vertices', [file('huge.geojson', JSON.stringify(fc([feat({ type: 'Polygon', coordinates: [ring] })])))]);
  console.log('load ms', Date.now() - t0);
  await loadRecords(page, recFile);
  const r = await run(page, { sizes: '5, 10, 25' }); console.log('run ms', r.ms, r.log.split('\n').slice(-1)[0]);
  const rh = await run(page, { sizes: '10', hex: true, timeout: 400000 }); console.log('hex run ms', rh.ms, rh.log.split('\n').slice(-1)[0]);
  await run(page, { hex: false });
}
{
  const tiny = squareGeo(90.4, 23.8, 0.01); // ~2 km
  const { info } = await tryBoundary('11. boundary smaller than one cell (2 km square, 10 km cells)', [file('tiny.geojson', JSON.stringify(fc([feat(tiny)])))]);
  const rows = csv([['A', 90.4, 23.8], ['B', 90.405, 23.805], ['C', 90.395, 23.795], ['Out', 90.43, 23.83]]);
  await loadRecords(page, file('tiny.csv', rows, 'text/csv'));
  for (const mo of [0, 0.5]) { const r = await run(page, { sizes: '10', minOverlap: mo, clip: true }); console.log('minOverlap', mo, '->', r.log.split('\n').slice(-2).join(' / ')); const R = await results(page); if (R) console.log('cells', R[0].n, 'prop', R[0].maxPropIn, 'assigned', R[0].nAssigned, 'sumAreaIn', R[0].sumAreaIn.toFixed(3), 'clip geom area', await page.evaluate(() => geomArea(S.results[0].cells[0].geom) / 1e6)); }
  await page.setChecked('#clipCells', false);
  // the 'Out' record at 90.43 is ~3.3 km from centre: outside boundary, inside the 10 km cell -> counted
}
{
  // huge grid guard: 1e-3 km cells on a 100 km boundary would be 1e10 centres
  await loadBoundary(page, [file('f.geojson', JSON.stringify(feat(sq)))]); await loadRecords(page, recFile);
  section('12. cell size guard');
  for (const sz of ['0.05', '5000', '10;25', 'abc', '0', '-5', '10, 10, 25', '1e1', '', '0.5km']) {
    const r = await run(page, { sizes: sz, minOverlap: 0, timeout: 60000 }).catch(e => ({ log: 'TIMEOUT/EXCEPTION ' + e.message }));
    console.log(JSON.stringify(sz), '->', (r.log || '').split('\n').filter(l => /Error|cells|Done/.test(l)).join(' / '));
  }
  // 1e-3 would allocate 1e10 centres before the guard; try 0.01 (1e8 centres) with a timeout to see whether the tab survives
  const t0 = Date.now();
  const r = await run(page, { sizes: '0.01', timeout: 90000 }).catch(e => ({ log: 'TIMEOUT/EXCEPTION ' + e.message.split('\n')[0] }));
  console.log('0.01 km ->', (r.log || '').split('\n').slice(-1)[0], 'after', Date.now() - t0, 'ms');
  const alive = await page.evaluate(() => 1).catch(() => 'PAGE DEAD');
  console.log('page alive?', alive);
}
}
console.log('\nerrors:', errors);
await browser.close();
