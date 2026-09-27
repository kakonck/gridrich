// Gridrich validation: runs the application headlessly on a boundary and a record file
// and compares every result table, unrounded, with the tables written by validate.R.
// Usage: node validation/compare.mjs <boundary> <records> <expected_dir> <sizes> <rarefy_n> <region_field> [report_name] [min_share=0]
// Copyright (c) 2026 Kakon Chakma. MIT License.
import { chromium } from 'playwright'; import fs from 'fs'; import path from 'path';
const [boundary, records, expDir, sizes, rarefyN, regionField, reportName, minShare] = process.argv.slice(2); const MIN = minShare == null ? '0' : minShare;
if (!boundary) { console.error('arguments: boundary records expected_dir sizes rarefy_n region_field [report_name]'); process.exit(2); }
const TOL = { int: 0, area: 1e-5, rel: 1e-5, coord: 0.01, rar: 1e-7, sim: 1e-9 };
// The projection centre is rounded to 1e-4 degrees; when the centroid lies within numerical noise of a rounding step the two
// implementations can pick adjacent values, which shifts the whole frame by up to 11 m without changing any assignment.
// Cell centres are therefore compared relative to the grid origin (lower-left corner of the boundary bounding box).
const results = []; let worst = {};
function check(section, name, ok, detail) { results.push({ section, name, ok, detail }); }
function csv(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r/g, ''); const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) { const ch = txt[i]; if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const head = rows[0]; return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const num = v => v === '' || v == null || v === 'NA' ? null : Number(v);
function cmpNum(section, name, got, exp, tol, relative, absTol) {
  // relative: a value passes when its relative difference is within tol, or (slivers) its absolute difference is within absTol
  let bad = 0, maxd = 0, maxa = 0, n = 0;
  for (let i = 0; i < exp.length; i++) { const e = exp[i], g = got[i]; n++; if (e == null && g == null) continue; if (e == null || g == null) { bad++; continue; } const a = Math.abs(g - e); const d = relative ? a / Math.max(Math.abs(e), 1e-12) : a; if (d > maxd) maxd = d; if (a > maxa) maxa = a; if (d > tol && !(absTol != null && a <= absTol)) bad++; }
  check(section, name, bad === 0 && got.length === exp.length, `${n} values, max ${relative ? 'relative ' : ''}difference ${maxd.toExponential(2)}${relative ? ` (max absolute ${maxa.toExponential(2)})` : ''}${bad ? `, ${bad} beyond tolerance ${tol}` : ''}${got.length !== exp.length ? `, length ${got.length} vs ${exp.length}` : ''}`);
}
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', args: ['--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + path.resolve('Gridrich.html')); await page.waitForTimeout(400);
await page.setInputFiles('#boundaryInput', [boundary]); await page.waitForFunction(() => /Loaded/.test(document.getElementById('boundaryStatus').textContent), null, { timeout: 120000 });
await page.setInputFiles('#recordsInput', [records]); await page.waitForFunction(() => /Loaded|Choose|Check/.test(document.getElementById('recordsStatus').textContent), null, { timeout: 600000 });
if (regionField && regionField !== '-') { await page.check('#regionsOn'); await page.selectOption('#regionField', regionField); }
await page.fill('#cellSizes', sizes.replace(/,/g, ', ')); await page.fill('#minOverlap', MIN); await page.check('#rarefyOn'); await page.fill('#rarefyN', rarefyN); await page.check('#speciesList');
for (const shape of ['square', 'hexagon']) {
  await page.click(`#cellType button[data-v=${shape}]`);
  const t = Date.now(); await page.click('#runBtn');
  await page.waitForFunction(() => /Done\.|Error/.test(document.getElementById('log').textContent), null, { timeout: 1800000 });
  const logTxt = await page.$eval('#log', e => e.textContent); if (/Error/.test(logTxt)) { check(shape, 'run', false, logTxt.slice(-300)); continue; }
  check(shape, 'run completed', true, `${((Date.now() - t) / 1000).toFixed(1)} s`);
  const got = await page.evaluate(() => ({
    dq: S.dataSummary,
    grids: S.results.map(R => ({ name: R.name, cells: R.cells.map(c => ({ cell_id: c.cell_id, area_in_km2: c.area_in_km2, prop_in: c.prop_in, x: c.x, y: c.y, n_occ: c.n_occ, record_density_per_km2: c.record_density_per_km2, richness: c.richness, pct_species: c.pct_species, occupied: c.occupied, species_list: c.species_list, richness_rarefied: c.richness_rarefied })), summary: R.summary, species: R.species,
      pa: (() => { const { species, rows } = paMatrix(R, false); return { species, rows: Array.from(rows.entries()) }; })(),
      sim: (() => { const { sets } = unitPA(String(S.results.indexOf(R))); const names = Array.from(sets.keys()); const ms = multiSite(sets); const out = { names, ms }; if (names.length <= 400) for (const idx of ['jaccard', 'sorensen', 'bsor', 'bsim', 'bsne']) out[idx] = names.map(a => names.map(b => a === b ? (idx === 'jaccard' || idx === 'sorensen' ? 1 : 0) : pairIndices(sets.get(a), sets.get(b))[idx])); return out; })() })),
    regions: S.regions ? { items: S.regions.items.map(r => ({ region: r.name, area_km2: r.area_km2, n_occ: r.n_occ, richness: r.richness, richness_rarefied: r.richness_rarefied })), sim: (() => { const { sets } = unitPA('regions'); const names = Array.from(sets.keys()); const ms = multiSite(sets); const out = { names, ms }; for (const idx of ['jaccard', 'sorensen', 'bsor', 'bsim', 'bsne']) out[idx] = names.map(a => names.map(b => a === b ? (idx === 'jaccard' || idx === 'sorensen' ? 1 : 0) : pairIndices(sets.get(a), sets.get(b))[idx])); return out; })() } : null
  }));
  // data quality
  const dq = Object.fromEntries(csv(path.join(expDir, 'expected_data_quality.csv')).map(r => [r.item, +r.value]));
  const dqPairs = [['submitted', got.dq.submitted], ['missing_coordinates', got.dq.badXY], ['out_of_range', got.dq.outRange], ['missing_species', got.dq.badSp], ['coordinate_duplicates', got.dq.dupes], ['outside_boundary', got.dq.outsideBoundary], ['inside_boundary', got.dq.retained], ['species', got.dq.species]];
  check(shape, 'data quality counts', dqPairs.every(([k, v]) => dq[k] === v), dqPairs.map(([k, v]) => `${k} ${v}${dq[k] === v ? '' : ` (R ${dq[k]})`}`).join('; '));
  const summ = csv(path.join(expDir, 'expected_summary.csv')).filter(r => r.shape === shape);
  for (const G of got.grids) {
    const tag = `${shape}_${G.name}`; const sec = `${shape} ${G.name}`;
    const exp = csv(path.join(expDir, `expected_cells_${tag}.csv`));
    check(sec, 'number of cells', exp.length === G.cells.length, `${G.cells.length} vs ${exp.length}`);
    const n = Math.min(exp.length, G.cells.length); const E = k => exp.slice(0, n).map(r => num(r[k])); const A = k => G.cells.slice(0, n).map(c => c[k]);
    cmpNum(sec, 'cell_id', A('cell_id'), E('cell_id'), TOL.int);
    { const ex0 = Math.min(...E('x')), ey0 = Math.min(...E('y')), gx0 = Math.min(...A('x')), gy0 = Math.min(...A('y')); cmpNum(sec, 'cell centre x, y relative to grid origin (m)', [...A('x').map(v => v - gx0), ...A('y').map(v => v - gy0)], [...E('x').map(v => v - ex0), ...E('y').map(v => v - ey0)], TOL.coord); check(sec, 'projection frame offset below 12 m (centre rounding)', Math.abs(gx0 - ex0) < 12 && Math.abs(gy0 - ey0) < 12, `dx ${(gx0 - ex0).toFixed(3)} m, dy ${(gy0 - ey0).toFixed(3)} m`); }
    cmpNum(sec, 'area inside boundary (km2)', A('area_in_km2'), E('area_in_km2'), TOL.area, true, 1e-4);
    cmpNum(sec, 'prop_in', A('prop_in'), E('prop_in'), TOL.area, true, 1e-6);
    cmpNum(sec, 'n_occ', A('n_occ'), E('n_occ'), TOL.int);
    cmpNum(sec, 'richness', A('richness'), E('richness'), TOL.int);
    cmpNum(sec, 'record_density_per_km2', A('record_density_per_km2'), E('record_density_per_km2'), TOL.rel, true, 1e-6);
    cmpNum(sec, 'pct_species', A('pct_species'), E('pct_species'), TOL.rel, true);
    cmpNum(sec, 'richness_rarefied (unrounded)', A('richness_rarefied'), E('richness_rarefied'), TOL.rar);
    check(sec, 'species lists', exp.slice(0, n).every((r, i) => (r.species_list || '') === (G.cells[i].species_list || '')), 'cell by cell string comparison');
    const es = summ.find(r => r.scale === G.name);
    const sk = ['n_cells', 'n_occupied', 'total_occ', 'records_in_removed_cells', 'gamma_richness', 'max_richness', 'max_occ', 'median_richness_occupied', 'median_occ_occupied', 'cells_rarefied', 'cells_excluded_rarefaction'];
    check(sec, 'summary integers', sk.every(k => +es[k] === G.summary[k]), sk.map(k => `${k} ${G.summary[k]}${+es[k] === G.summary[k] ? '' : ` (R ${es[k]})`}`).join('; '));
    cmpNum(sec, 'summary means (app rounds to 0.01)', [G.summary.mean_richness_occupied, G.summary.mean_occ_occupied], [+es.mean_richness_occupied, +es.mean_occ_occupied], 0.0051);
    cmpNum(sec, 'pct_occupied (app rounds to 0.1)', [G.summary.pct_occupied], [+es.pct_occupied], 0.051);
    const esp = csv(path.join(expDir, `expected_species_${tag}.csv`));
    check(sec, 'species table (order, n_occ, n_cells)', esp.length === G.species.length && esp.every((r, i) => r.species === G.species[i].species && +r.n_occ === G.species[i].n_occ && +r.n_cells === G.species[i].n_cells), `${G.species.length} species`);
    const epa = csv(path.join(expDir, `expected_pa_${tag}.csv`)); const paCols = Object.keys(epa[0] || {}).filter(k => k !== 'cell_id');
    let paBad = 0; const gpaIdx = new Map(G.pa.species.map((s, i) => [s, i])); const gpaRows = new Map(G.pa.rows);
    for (const r of epa) { const row = gpaRows.get(+r.cell_id); if (!row) { paBad++; continue; } for (const s of paCols) if (+r[s] !== (row[gpaIdx.get(s)] || 0)) paBad++; }
    check(sec, 'presence/absence matrix', paBad === 0 && epa.length === G.pa.rows.length && paCols.length === G.pa.species.length, `${epa.length} x ${paCols.length}${paBad ? `, ${paBad} mismatches` : ''}`);
    const ems = csv(path.join(expDir, `expected_multisite_${tag}.csv`))[0];
    cmpNum(sec, 'multiple-site beta (gamma, mean alpha, Whittaker, Sorensen, turnover, nestedness)', [G.sim.ms.gamma, G.sim.ms.meanAlpha, G.sim.ms.whittaker, G.sim.ms.bsor, G.sim.ms.bsim, G.sim.ms.bsne], [+ems.gamma, +ems.mean_alpha, +ems.whittaker_beta, +ems.sorensen_multisite, +ems.turnover_simpson, +ems.nestedness], TOL.sim);
    if (G.sim.jaccard) for (const idx of ['jaccard', 'sorensen', 'bsor', 'bsim', 'bsne']) {
      const f = path.join(expDir, `expected_sim_${tag}_${idx}.csv`); if (!fs.existsSync(f)) continue; const em = csv(f); const names = em.map(r => r['']); const gi = new Map(G.sim.names.map((s, i) => [s, i]));
      const gv = [], ev = []; em.forEach((r, i) => names.forEach(c => { ev.push(num(r[c])); const a = gi.get(names[i]), b = gi.get(c); gv.push(a == null || b == null ? null : G.sim[idx][a][b]); }));
      cmpNum(sec, `pairwise ${idx} (${names.length} units)`, gv, ev, TOL.sim);
    }
  }
  if (got.regions && fs.existsSync(path.join(expDir, 'expected_regions.csv'))) {
    const er = csv(path.join(expDir, 'expected_regions.csv')); const byName = new Map(got.regions.items.map(r => [r.region, r]));
    check(`${shape} regions`, 'records and richness per region', er.every(r => byName.get(r.region) && +r.n_occ === byName.get(r.region).n_occ && +r.richness === byName.get(r.region).richness), er.map(r => `${r.region} ${r.n_occ}/${r.richness}`).join('; '));
    cmpNum(`${shape} regions`, 'region area', er.map(r => byName.get(r.region)?.area_km2), er.map(r => +r.area_km2), TOL.area, true);
    cmpNum(`${shape} regions`, 'region rarefied richness', er.map(r => byName.get(r.region)?.richness_rarefied), er.map(r => num(r.richness_rarefied)), TOL.rar);
    const ems = csv(path.join(expDir, 'expected_sim_regions_multisite.csv'))[0];
    cmpNum(`${shape} regions`, 'multiple-site beta between regions', [got.regions.sim.ms.gamma, got.regions.sim.ms.meanAlpha, got.regions.sim.ms.whittaker, got.regions.sim.ms.bsor, got.regions.sim.ms.bsim, got.regions.sim.ms.bsne], [+ems.gamma, +ems.mean_alpha, +ems.whittaker_beta, +ems.sorensen_multisite, +ems.turnover_simpson, +ems.nestedness], TOL.sim);
    for (const idx of ['jaccard', 'sorensen', 'bsor', 'bsim', 'bsne']) { const em = csv(path.join(expDir, `expected_sim_regions_${idx}.csv`)); const names = em.map(r => r['']); const gi = new Map(got.regions.sim.names.map((s, i) => [s, i])); const gv = [], ev = []; em.forEach((r, i) => names.forEach(c => { ev.push(num(r[c])); const a = gi.get(names[i]), b = gi.get(c); gv.push(a == null || b == null ? null : got.regions.sim[idx][a][b]); })); cmpNum(`${shape} regions`, `pairwise ${idx} between regions`, gv, ev, TOL.sim); }
  }
}
await browser.close();
const ver = fs.readFileSync('Gridrich.html', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const fails = results.filter(r => !r.ok).length;
const lines = [`Gridrich ${ver} validation report`, '='.repeat(40), `Date: ${new Date().toISOString()}`, `Boundary: ${path.basename(boundary)}`, `Records: ${path.basename(records)}`, `Cell sizes: ${sizes} km; minimum share ${MIN}; rarefaction ${rarefyN}; regions: ${regionField}`, `Reference: validate.R (R/sf), ${expDir}`, `Tolerances: integers exact; areas and densities relative ${TOL.area} (or 100 m2 absolute for slivers); coordinates ${TOL.coord} m; rarefaction ${TOL.rar}; similarity ${TOL.sim}`, ''];
let cur = ''; for (const r of results) { if (r.section !== cur) { cur = r.section; lines.push(`[${cur}]`); } lines.push(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(70)} ${r.detail}`); }
lines.push('', `Checks: ${results.length}, failed: ${fails}${errs.length ? `, page errors: ${errs.join(' | ')}` : ''}`, fails ? 'RESULT: FAIL' : 'RESULT: PASS');
const rep = lines.join('\n'); console.log(rep);
fs.mkdirSync('validation/reports', { recursive: true }); fs.writeFileSync(`validation/reports/${reportName || path.basename(expDir)}_report.txt`, rep + '\n');
process.exit(fails ? 1 : 0);
