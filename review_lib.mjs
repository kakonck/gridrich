// Shared helpers for the review scripts. Run from /home/claude/gridrich-app.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export const ROOT = process.cwd();
export const APP = 'file://' + ROOT + '/Gridrich.html';

export async function open(opts = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1400, height: 1000 }, colorScheme: opts.colorScheme || 'light', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts.g(oogle)?apis|ERR_INTERNET|ERR_NAME|net::/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
  await page.goto(APP);
  await page.waitForTimeout(300);
  return { browser, page, errors };
}

export function file(name, content, mimeType = 'application/octet-stream') {
  return { name, mimeType, buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8') };
}

export async function loadBoundary(page, files) {
  await page.setInputFiles('#boundaryInput', files);
  await page.waitForFunction(() => !/Reading/.test(document.getElementById('boundaryStatus').textContent), null, { timeout: 120000 });
  await page.waitForTimeout(150);
  return { status: await page.$eval('#boundaryStatus', e => e.textContent), info: await page.$eval('#boundaryInfo', e => e.textContent) };
}

export async function loadRecords(page, f) {
  await page.setInputFiles('#recordsInput', f);
  await page.waitForFunction(() => !/Reading/.test(document.getElementById('recordsStatus').textContent), null, { timeout: 60000 });
  await page.waitForTimeout(150);
  return { status: await page.$eval('#recordsStatus', e => e.textContent), info: await page.$eval('#recordsInfo', e => e.textContent), files: await page.$eval('#recordsFiles', e => e.textContent), cols: await page.evaluate(() => ({ sp: $('colSpecies').value, lon: $('colLon').value, lat: $('colLat').value, crs: $('recCrsType').value, all: S.records ? S.records.columns : null })) };
}

export async function run(page, o = {}) {
  if (o.sizes !== undefined) await page.fill('#cellSizes', o.sizes);
  if (o.minOverlap !== undefined) await page.fill('#minOverlap', String(o.minOverlap));
  if (o.hex !== undefined) await page.click(`#cellType button[data-v=${o.hex ? 'hexagon' : 'square'}]`);
  if (o.clip !== undefined) await page.setChecked('#clipCells', o.clip);
  if (o.speciesList !== undefined) await page.setChecked('#speciesList', o.speciesList);
  if (o.rarefy !== undefined) { await page.setChecked('#rarefyOn', o.rarefy !== null); if (o.rarefy !== null) await page.fill('#rarefyN', String(o.rarefy)); }
  if (o.regions !== undefined) await page.evaluate(v => { document.getElementById('regionsOn').checked = v; }, o.regions);
  if (o.regionField !== undefined) await page.selectOption('#regionField', o.regionField);
  const disabled = await page.$eval('#runBtn', b => b.disabled);
  if (disabled) return { log: 'RUN BUTTON DISABLED', disabled: true };
  await page.evaluate(() => { document.getElementById('log').textContent = ''; });
  const t0 = Date.now();
  await page.evaluate(() => setTimeout(() => document.getElementById('runBtn').click(), 0));
  await page.waitForFunction(() => { const t = document.getElementById('log').textContent; return t.includes('Done.') || t.includes('Error'); }, null, { timeout: o.timeout || 600000 });
  const log = await page.$eval('#log', e => e.textContent);
  return { log, ms: Date.now() - t0, ok: log.includes('Done.') };
}

export async function results(page) {
  return page.evaluate(() => S.results ? S.results.map(r => ({
    name: r.name, size: r.size, type: r.type, n: r.cells.length, summary: r.summary,
    cellArea: r.cells[0] && r.cells[0].cell_area_km2, sumAreaIn: r.cells.reduce((s, c) => s + c.area_in_km2, 0),
    sumNocc: r.cells.reduce((s, c) => s + c.n_occ, 0), nAssigned: r.recordsAssigned.length,
    maxPropIn: Math.max(...r.cells.map(c => c.prop_in)), minPropIn: Math.min(...r.cells.map(c => c.prop_in)),
    areaGtCell: r.cells.filter(c => c.area_in_km2 > c.cell_area_km2 * (1 + 1e-9)).length,
    species: r.species.map(s => s.species), nSpecies: r.species.length
  })) : null);
}

export function section(t) { console.log('\n=== ' + t + ' ==='); }
export function check(name, cond, detail = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? '  | ' + detail : '')); return cond; }

// square polygon in lon/lat around a centre (degrees)
export function squareGeo(lon0, lat0, halfDeg) {
  return { type: 'Polygon', coordinates: [[[lon0 - halfDeg, lat0 - halfDeg], [lon0 + halfDeg, lat0 - halfDeg], [lon0 + halfDeg, lat0 + halfDeg], [lon0 - halfDeg, lat0 + halfDeg], [lon0 - halfDeg, lat0 - halfDeg]]] };
}
export function fc(features) { return { type: 'FeatureCollection', features }; }
export function feat(geometry, properties = {}) { return { type: 'Feature', properties, geometry }; }
export function csv(rows, header = ['species', 'lon', 'lat']) { return header.join(',') + '\n' + rows.map(r => r.join(',')).join('\n') + '\n'; }
