# Gridrich

**Grid-based species occurrence and richness analysis from occurrence records, in the browser.**

Gridrich divides any study area into equal-area square or hexagonal grid cells of one or several sizes, and into the regions of a multi-feature boundary (divisions, districts, protected areas), and reports for every cell and region the number of occurrence records, observed species richness, occurrence-record density, percentage of observed species, Hurlbert rarefied richness, species frequency, a presence/absence matrix and compositional similarity (Jaccard, Sorensen, Simpson turnover, nestedness, Whittaker beta, multiple-site partition). Results come as interactive maps, side-by-side map comparison across cell sizes, tables, configurable charts, an automatically written methods statement, a reproducibility record and exports for Excel, CSV and GIS.

Everything runs locally in the web browser. No installation, no server, no upload of data.

Copyright (c) 2026 Kakon Chakma. MIT License (see [LICENSE](LICENSE)); bundled libraries are listed in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt). Version 1.0.0; see [CHANGELOG.md](CHANGELOG.md) and [CITATION.cff](CITATION.cff).

## Use it

Without installation:

1. **Release package:** download `Gridrich_1.0.0.zip` from the [Releases page](https://github.com/kakonck/gridrich/releases) (also in [`releases/`](releases/)). It holds Gridrich.html, the README, licences and the example dataset (Bangladesh birds).

Then press **Load example data** and **Build grids and count** to see how it works, or drop your own boundary (GeoJSON, KML, zipped shapefile) and record table (CSV, TSV, Excel or a GBIF download zip), set cell sizes, and run.

Full instructions: [docs/user_manual.md](docs/user_manual.md) and the Help tab inside the application.

## Inputs

| Input | Formats | Notes |
| --- | --- | --- |
| Boundary | GeoJSON, KML, zipped shapefile, .shp + .dbf + .prj | Several polygons are merged; holes kept; multi-layer zips offer a layer chooser. Coordinate system must be confirmed when no .prj is present. Overlapping or self-intersecting features are rejected (repair of self-intersections is opt-in). |
| Records | CSV, TSV, TXT, XLSX, GBIF download zip | Species, longitude and latitude columns detected (GBIF, iNaturalist) or chosen. Optional taxon rank and coordinate uncertainty columns for screening. |

## Method in brief

Boundary and records are projected to a Lambert azimuthal equal-area projection centred on the boundary. Only records inside the boundary outline are analysed. Cells are laid out from the lower-left corner of the projected bounding box; by default every cell touching the area is kept, so every record inside the outline is assigned; an optional minimum share removes edge cells and counts the records in them separately. Each record is assigned to one cell (index arithmetic for squares, nearest centre for hexagons) and to one region. See [docs/methodology.md](docs/methodology.md) for definitions and formulas.

## Validation

An independent R/sf script (`validation/validate.R`) recomputes every table for square and hexagonal grids on the built-in bird example, at the default minimum share and at 0.5; `validation/compare.mjs` runs the application headlessly and compares the values unrounded; browser test suites in `test/` cover geometry, parsing, screening, edge cases and exports. `bash validation/run_all.sh` runs everything and writes reports to `validation/reports/`. See [docs/validation.md](docs/validation.md).

## Repository layout

```
app_template.html   application source (HTML, CSS, JavaScript)
index.html          built page served by GitHub Pages (uses lib/)
Gridrich.html       built single-file application for download
lib/                bundled libraries (see THIRD_PARTY_LICENSES.txt)
releases/           release zip (application, README, licences, examples)
build.py            builds app.html (hosted, uses lib/) and Gridrich.html (single file)
pack.py             builds the release zips
test/               headless browser test suites (Node 18+, Playwright) and fixtures
validation/         independent R/sf script, comparison script, reference tables, reports
docs/               user manual, methodology, validation notes
.github/workflows/  continuous integration
```

`index.html` is the hosted build (loads the libraries from `lib/`), `Gridrich.html` the single-file build; both are generated from `app_template.html` by `python3 build.py` and committed so that the GitHub Pages site and the direct download always match the source. Tests: `npm install && npm test`. Full validation (needs R with sf): `npm run validate`.

## Citation

Chakma, K. (2026). Gridrich: grid-based species occurrence and richness analysis, version 1.0.0. Software. https://github.com/kakonck/gridrich

## Data credits for the built-in example

Occurrence records: GBIF.org (26 September 2026) GBIF Occurrence Download 0008757-260921141020460 (Aves, Bangladesh), CC BY 4.0 and CC0 records only, cleaned and reduced to one row per species and site; eBird (Cornell Lab of Ornithology) and iNaturalist. Division boundaries: geoBoundaries (Runfola et al. 2020), source Bangladesh Bureau of Statistics and OCHA ROAP, CC BY 3.0 IGO, dissolved from districts and simplified. Basemap: Natural Earth (public domain). The derived example files were prepared by Kakon Chakma; upstream licences and attribution apply.
