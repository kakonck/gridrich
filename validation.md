# Gridrich validation

Version 1.0.0. Copyright (c) 2026 Kakon Chakma, MIT License.

## What is validated

The reference dataset is the **Bangladesh bird example** built into the application: 130,778 GBIF records, 677 species, eight divisions from geoBoundaries; cell sizes 10, 25, 50 km; rarefaction at 50 records. It is run twice: with the default minimum share of 0 (every cell touching the area kept) and with a minimum share of 0.5, which exercises the removed-edge-cell accounting.

For each run and for **both square and hexagonal grids**, `validation/validate.R` (R >= 4.1, sf) recomputes, without using any Gridrich code: data-quality counts; the boundary test with `st_intersects`; every cell (area inside, share, centre, records, richness, record density, percentage of species, rarefied richness, species list); the per-grid summary; the species table; the presence/absence matrix; pairwise Jaccard, Sorensen, Sorensen dissimilarity, Simpson turnover and nestedness for up to 400 units; Whittaker beta and the multiple-site partition; and the region table with its pairwise and multiple-site indices.

`validation/compare.mjs` then runs the application headlessly on the same inputs and compares every value **before display rounding**:

| Quantity | Tolerance |
| --- | --- |
| Counts, identifiers, presence/absence | exact |
| Areas, shares, densities, percentages | 1e-5 relative, or 100 m2 (1e-6 in share) absolute for slivers |
| Cell centres (relative to the grid origin) | 0.01 m |
| Rarefied richness | 1e-7 |
| Similarity and beta-diversity indices | 1e-9 |
| Summary means | 0.005 (the application rounds them to 0.01) |

The projection centre is rounded to 0.0001 degrees. When the true centroid lies within numerical noise of a rounding step the two implementations can pick adjacent values, which shifts the whole coordinate frame by up to 11 m without changing any assignment; cell centres are therefore compared relative to the grid origin and the frame offset is reported (11.07 m in y for the Bangladesh example).

## Results

Both runs pass every check (reports in `validation/reports/`): 150 checks each, covering 2,046 square and 2,356 hexagonal cells at minimum share 0 and 1,690 square and 1,952 hexagonal cells at 0.5. Observed differences: counts 0; areas below 4e-4 km2 absolute (below 2e-6 relative except for slivers under 0.1 km2, where the 11 m frame offset gives up to 2e-3 relative); rarefaction below 1e-11; indices below 1e-15.

## Browser test suites

`test/review_geometry.mjs` (exact 100 km LAEA square, edge and vertex records, hexagon geometry, clipping, ghost cells), `test/review_records.mjs` (parsing, encodings, column detection, swapped coordinates, projected coordinates), `test/review_boundary.mjs` (formats, holes, layer chooser, self-intersection rejection and repair, overlap rejection, large files), `test/review_misc.mjs` (HTML escaping, state handling), `test/review_screening.mjs` (boundary test with holes, taxon rank, coordinate uncertainty, .prj confirmation, antimeridian, large extents, reproducibility metadata, renamed columns). About 80 checks in total.

## Running

```
npm install                      # Playwright
bash validation/run_all.sh       # build, browser suites, R reference tables, comparison, reports
```

`validation/*/sessionInfo.txt` records the R, sf, GEOS, GDAL and PROJ versions used to produce the reference tables. The GitHub Actions workflow in `.github/workflows/validate.yml` runs the same script on every push.

## Known limits

- Areas crossing the antimeridian are refused; very large extents are accepted with a warning.
- Features above 20,000 vertices are not tested for self-intersection; files above 150,000 vertices or 300 features are not tested for overlap (a warning is shown).
- Species names are matched as text; taxonomic harmonisation must be done beforehand.
