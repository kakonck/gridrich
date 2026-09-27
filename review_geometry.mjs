// Geometry checks: equator square, exact LAEA square via PROJ string, UTM shapefile, edge/vertex records, hexagons.
import { open, file, loadBoundary, loadRecords, run, results, section, check, squareGeo, fc, feat, csv, ROOT } from './review_lib.mjs';
import fs from 'fs';

const { browser, page, errors } = await open();

section('A. 0.9 deg square at the equator, 10/25/50 km squares');
{
  const b = fc([feat(squareGeo(0, 0, 0.45), { name: 'eq' })]);
  const rows = []; for (let i = 0; i < 50; i++) rows.push([`Sp${i % 7}`, (-0.44 + 0.88 * (i * 0.37 % 1)).toFixed(5), (-0.44 + 0.88 * (i * 0.61 % 1)).toFixed(5)]);
  rows.push(['Outside', 2, 2], ['Outside', -1, 0.1]);
  console.log(await loadBoundary(page, [file('eq.geojson', JSON.stringify(b))]));
  await loadRecords(page, file('eq.csv', csv(rows), 'text/csv'));
  const r = await run(page, { sizes: '10, 25, 50', minOverlap: 0, hex: false, rarefy: null });
  console.log(r.log);
  const R = await results(page);
  const area = await page.evaluate(() => S.boundary.areaKm2);
  const km = 0.9 * 111.32; // ~100.2 km
  console.log('boundary area km2', area.toFixed(1), 'expected ~', (km * km).toFixed(0));
  const kmLat = 0.9 * 110.57; check('area within 0.5% of 100.2 x 99.5 km', Math.abs(area - km * kmLat) / (km * kmLat) < 0.005, area.toFixed(1));
  for (const g of R) console.log(g.name, 'cells', g.n, 'cell_area', g.cellArea, 'sumAreaIn', g.sumAreaIn.toFixed(2), 'assigned', g.nAssigned, 'sumNocc', g.sumNocc, 'areaGtCell', g.areaGtCell);
  check('10km: 11x10=110 cells (100.2 x 99.5 km extent)', R[0].n === 110, String(R[0].n));
  check('25km: 5x4=20 cells', R[1].n === 20, String(R[1].n));
  check('50km: 3x2=6 cells', R[2].n === 6, String(R[2].n));
  check('cell_area_km2 exact', R[0].cellArea === 100 && R[1].cellArea === 625 && R[2].cellArea === 2500);
  check('sum area_in == boundary area (all sizes)', R.every(g => Math.abs(g.sumAreaIn - area) < 1e-6), R.map(g => (g.sumAreaIn - area).toExponential(2)).join(','));
  check('50 records inside, 2 outside reported', R.every(g => g.nAssigned === 50 && g.sumNocc === 50) && /2 record\(s\) lie outside the boundary outline/.test(r.log), r.log.match(/outside[^\n]*/g)?.join(' | '));
}

section('B. Exact 100 km LAEA square via PROJ string, edge and vertex records');
{
  // Boundary given in the very LAEA the app will build (centre 0,0): coordinates survive the round trip to ~1e-9 m
  const proj = '+proj=laea +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
  const sq = { type: 'Polygon', coordinates: [[[-50000, -50000], [50000, -50000], [50000, 50000], [-50000, 50000], [-50000, -50000]]] };
  const st = await loadBoundary(page, [file('laea.geojson', JSON.stringify(fc([feat(sq)])))]);
  console.log(st);
  await page.selectOption('#boundaryCrsType', 'proj'); await page.fill('#bProj', proj); await page.click('#bApplyCrs'); await page.waitForTimeout(300);
  console.log(await page.$eval('#boundaryInfo', e => e.textContent));
  const bb = await page.evaluate(() => S.boundary.bbox);
  console.log('bbox', bb.map(v => v.toFixed(6)));
  // records in the same PROJ crs: interior points, shared-edge points, shared-vertex points, boundary points, outside
  const rows = [];
  // interior: one per 10km cell centre -> 100 records
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) rows.push([`Sp${(i + j) % 5}`, -45000 + i * 10000, -45000 + j * 10000]);
  // on shared vertical edge x=-30000 (between cols 1 and 2), interior y
  rows.push(['Edge', -30000, 12345], ['Edge', -30000, -12345], ['Edge', 20000, 777]);
  // on shared vertex (-30000,-30000) and (0,0)
  rows.push(['Vertex', -30000, -30000], ['Vertex', 0, 0], ['Vertex', 10000, 10000]);
  // on the outer boundary edges/corners
  rows.push(['Border', -50000, 0], ['Border', 50000, 0], ['Border', 0, 50000], ['Border', 50000, 50000], ['Border', -50000, -50000]);
  // outside
  rows.push(['Out', 60000, 0], ['Out', 0, -50001], ['Out', -70000, -70000]);
  const nInside = rows.length - 3;
  await loadRecords(page, file('laea_pts.csv', csv(rows, ['species', 'x', 'y']), 'text/csv'));
  await page.selectOption('#recCrsType', 'proj'); await page.fill('#rProj', proj);
  const r = await run(page, { sizes: '10, 20, 50, 100', minOverlap: 0, hex: false, rarefy: null, speciesList: true });
  console.log(r.log);
  const R = await results(page);
  for (const g of R) console.log(g.name, 'cells', g.n, 'cell_area', g.cellArea, 'sumAreaIn', g.sumAreaIn.toFixed(6), 'assigned', g.nAssigned, 'sumNocc', g.sumNocc, 'minProp', g.minPropIn, 'maxProp', g.maxPropIn);
  check('10 km: 100 cells', R[0].n === 100, String(R[0].n));
  check('20 km: 25 cells', R[1].n === 25, String(R[1].n));
  check('50 km: 4 cells', R[2].n === 4, String(R[2].n));
  check('100 km: 1 cell', R[3].n === 1, String(R[3].n));
  check('all prop_in == 1', R.every(g => g.minPropIn === 1 && g.maxPropIn === 1));
  check('sum area_in == 10000 km2 (within 1e-4)', R.every(g => Math.abs(g.sumAreaIn - 10000) < 1e-4), R.map(g => g.sumAreaIn.toFixed(9)).join(','));
  check(`inside records ${nInside} counted once at every size`, R.every(g => g.nAssigned === nInside && g.sumNocc === nInside), R.map(g => g.nAssigned).join(','));
  check('3 outside records reported once (boundary test)', /3 record\(s\) lie outside the boundary outline/.test(r.log), (r.log.match(/outside[^\n]*/g) || []).join(' | '));
  // no record in two cells: check recordsAssigned has unique record ids
  const dup = await page.evaluate(() => S.results.map(r => r.recordsAssigned.length - new Set(r.recordsAssigned.map(a => a.record)).size));
  check('no record assigned twice', dup.every(d => d === 0), dup.join(','));
  const ghosts = await page.evaluate(() => S.results.map(r => r.cells.filter(c => c.prop_in < 1e-6).map(c => [c.cell_id, c.x.toFixed(1), c.area_in_km2.toExponential(2), c.n_occ])));
  console.log('ghost cells (prop_in < 1e-6) per size:', JSON.stringify(ghosts));
  check('no ghost cells', ghosts.every(g => g.length === 0));
  // cell centres and lon/lat
  const c0 = await page.evaluate(() => S.results[0].cells.slice(0, 3).map(c => [c.cell_id, c.x, c.y, c.lon, c.lat]));
  console.log('first cells', JSON.stringify(c0));
  check('first 10km cell centre at (-45000,-45000) within 1e-3 m', Math.abs(c0[0][1] + 45000) < 1e-3 && Math.abs(c0[0][2] + 45000) < 1e-3, `${c0[0][1]}, ${c0[0][2]}`);
  // cell species list length equals richness
  const okList = await page.evaluate(() => S.results[0].cells.every(c => c.richness === 0 ? c.species_list === '' : c.species_list.split('; ').length === c.richness));
  check('species_list length == richness', okList);

  section('C. Hexagons on the same square');
  const rh = await run(page, { sizes: '10, 20', hex: true });
  console.log(rh.log);
  const H = await results(page);
  for (const g of H) console.log(g.name, 'cells', g.n, 'cell_area', g.cellArea, 'expected', (Math.sqrt(3) / 2 * g.size * g.size).toFixed(6), 'sumAreaIn', g.sumAreaIn.toFixed(6), 'assigned', g.nAssigned, 'sumNocc', g.sumNocc, 'minProp', g.minPropIn, 'maxProp', g.maxPropIn, 'area>cell', g.areaGtCell);
  check('hex cell_area == sqrt(3)/2 d^2', H.every(g => Math.abs(g.cellArea - Math.sqrt(3) / 2 * g.size * g.size) < 1e-9));
  check('hex: sum area_in == 10000 km2', H.every(g => Math.abs(g.sumAreaIn - 10000) < 1e-4), H.map(g => g.sumAreaIn.toFixed(6)).join(','));
  check(`hex: ${nInside} inside records counted once`, H.every(g => g.nAssigned === nInside && g.sumNocc === nInside), H.map(g => g.nAssigned + '/' + g.sumNocc).join(','));
  const duph = await page.evaluate(() => S.results.map(r => r.recordsAssigned.length - new Set(r.recordsAssigned.map(a => a.record)).size));
  check('hex: no record assigned twice', duph.every(d => d === 0));
  // independent check: every assigned record lies within its hexagon (point in polygon via ring test in page)
  const pip = await page.evaluate(() => {
    const out = [];
    for (const R of S.results) {
      const byId = new Map(R.cells.map(c => [c.cell_id, c]));
      // recompute pts
      const rows = S.records.rows; let bad = 0;
      for (const a of R.recordsAssigned) { const row = rows[a.record - 1]; const p = proj4($('rProj').value, S.boundary.proj, [Number(row.x), Number(row.y)]); const c = byId.get(a.cell_id); const inside = turf.booleanPointInPolygon(p, turf.polygon(c.ring)); if (!inside) bad++; }
      out.push(bad);
    }
    return out;
  });
  check('hex: every assigned record is inside its hexagon (boundary inclusive)', pip.every(b => b === 0), pip.join(','));
  // hex clip run: check clipped geometry areas sum to boundary
  const rc = await run(page, { sizes: '10', hex: true, clip: true });
  const clipSum = await page.evaluate(() => S.results[0].cells.reduce((s, c) => s + geomArea(c.geom), 0) / 1e6);
  check('hex clip: sum of clipped geometry areas == 10000', Math.abs(clipSum - 10000) < 1e-4, clipSum.toFixed(6));
  await run(page, { hex: false, clip: false });
}

section('D. UTM shapefile (loose, with .prj) vs same file without .prj + zone 13');
{
  const files = ['demo_utm.shp', 'demo_utm.dbf', 'demo_utm.prj'].map(n => ROOT + '/test/shp/' + n);
  console.log(await loadBoundary(page, files));
  const a1 = await page.evaluate(() => ({ area: S.boundary.areaKm2, bbox: S.boundary.bbox, c: [S.boundary.lon0, S.boundary.lat0] }));
  console.log(await loadBoundary(page, files.slice(0, 2)));
  await page.selectOption('#boundaryCrsType', 'utm'); await page.fill('#bUtmZone', '13'); await page.selectOption('#bUtmHemi', 'N'); await page.click('#bApplyCrs'); await page.waitForTimeout(300);
  const a2 = await page.evaluate(() => ({ area: S.boundary.areaKm2, bbox: S.boundary.bbox, c: [S.boundary.lon0, S.boundary.lat0] }));
  console.log(a1, a2);
  check('prj path and manual UTM path agree on area', Math.abs(a1.area - a2.area) < 1e-3, `${a1.area} vs ${a2.area}`);
  // independent area: planar UTM area from the shapefile rings scaled by nothing (UTM scale ~0.9996..1.0004) -> compare within 0.1%
  const shp = (await import('shpjs')).default;
  const g = shp.parseShp(fs.readFileSync(ROOT + '/test/shp/demo_utm.shp'));
  const ringArea = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const utmArea = g[0].coordinates.reduce((s, r, i) => s + (i ? -ringArea(r) : ringArea(r)), 0) / 1e6;
  console.log('planar UTM area', utmArea.toFixed(2), 'LAEA area', a1.area.toFixed(2), 'ratio', (a1.area / utmArea).toFixed(5));
  check('LAEA area within 0.1% of UTM planar area', Math.abs(a1.area / utmArea - 1) < 0.001);
  // wrong hemisphere should be rejected or give absurd result
  console.log(await loadBoundary(page, files.slice(0, 2)));
  await page.selectOption('#bUtmHemi', 'S'); await page.click('#bApplyCrs'); await page.waitForTimeout(300);
  console.log('wrong hemisphere ->', await page.$eval('#boundaryStatus', e => e.textContent), '|', await page.$eval('#boundaryInfo', e => e.textContent));
  console.log('CRS row hidden after Apply (cannot correct zone without reloading)?', await page.$eval('#boundaryCrsRow', e => e.hidden));
  console.log(await loadBoundary(page, files.slice(0, 2)));
  await page.selectOption('#bUtmHemi', 'N'); await page.fill('#bUtmZone', '33'); await page.click('#bApplyCrs'); await page.waitForTimeout(300);
  console.log('wrong zone 33 ->', await page.$eval('#boundaryStatus', e => e.textContent), '|', await page.$eval('#boundaryInfo', e => e.textContent));
  // ghost cell detail from section B: list cells with prop_in < 1e-6
  const b = fc([feat(squareGeo(0, 0, 0.45))]); await loadBoundary(page, [file('eq.geojson', JSON.stringify(b))]);
}

console.log('\nerrors:', errors);
await browser.close();
