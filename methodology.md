# Gridrich methodology

Version 1.0.0. Copyright (c) 2026 Kakon Chakma, MIT License.

## Projection

The boundary is read in WGS84 longitude/latitude (shapefiles are reprojected from their `.prj`; other projected inputs are converted with the coordinate system the user confirms). A first centre is the planar centre of mass of the outline; the outline is projected to a Lambert azimuthal equal-area (LAEA) projection on that centre, its area-weighted centroid (holes subtracted) is computed in that projection and transformed back, and the final projection is LAEA centred on that point rounded to 0.0001 degrees (`+proj=laea +lat_0=.. +lon_0=.. +datum=WGS84 +units=m`). Boundary, records and basemap are transformed to it. LAEA preserves area everywhere, so all cells of one size have the same true area; shape distortion grows with distance from the centre, which is why areas above 5,000 km across get a warning and areas crossing the antimeridian are refused.

Areas (boundary, regions, cell area inside the boundary) are planar areas in this projection.

## Boundary handling

Features are merged into one outline (holes kept). Files above 40,000 vertices are kept as separate polygons instead. Features that overlap each other (intersection area above 0.01% of the total or 0.01 km2) are rejected; self-intersecting rings are rejected unless automatic splitting is requested; the coordinate system of a shapefile without `.prj` is never assumed.

## Record screening

In this order, each row is dropped and counted when: coordinates are missing or non-numeric; coordinates are outside |lon| <= 180, |lat| <= 90 (geographic input); the species name is empty; a taxon rank column is chosen and the rank is above the kept set; an uncertainty column and maximum are chosen and the uncertainty exceeds the maximum. Species names are trimmed and internal runs of white space collapsed. Coordinate duplicates (same name and coordinates) are counted and, only if requested, removed. The record is then projected.

## Boundary test

Every record is tested against the boundary outline with the even-odd rule over the projected rings, holes included; a record on the outline itself (within 1 micrometre) counts as inside, matching the `st_intersects` convention. Records outside are counted and excluded from every grid and region.

## Grids

Let (x0, y0) be the lower-left corner of the projected boundary bounding box and s the cell size in metres.

- Squares: cell (i, j) spans [x0 + i s, x0 + (i+1) s] x [y0 + j s, y0 + (j+1) s]; columns = ceil((xmax - x0)/s), rows likewise; cells are numbered row by row from the bottom left.
- Hexagons (flat-top, distance s between opposite edges): circumradius R = s / sqrt(3); centres at x0 + i (1.5 R), y0 + j s (+ s/2 for odd i); area = (sqrt 3 / 2) s^2.

For each cell the area inside the boundary A_i is measured exactly (rectangle clipping for squares, polygon intersection for hexagons); values below 1 m2 are set to 0 and A_i never exceeds the cell area. `prop_in` = A_i / cell area. Cells are kept when `prop_in` > 0 (minimum share 0, the default) or `prop_in` >= the chosen minimum share. With the default every record inside the outline is assigned at every cell size. Records inside the boundary whose cell was removed by a positive minimum share are counted as `records_in_removed_cells`.

Assignment: squares by index arithmetic (a record on a shared edge belongs to the cell on its upper right, so it is counted once); hexagons to the nearest centre.

## Metrics per cell

- O_i, `n_occ`: number of records assigned to cell i.
- S_i, `richness`: number of distinct species with at least one record in cell i.
- `record_density_per_km2` = O_i / A_i, a proxy for sampling intensity (one survey can produce many records, another few).
- `pct_species` = 100 S_i / S_total, where S_total is the number of species retained at that cell size (gamma richness of the grid); not comparable across cell sizes.
- `richness_rarefied`: Hurlbert (1971) expected number of species in a random sample of n records,
  E[S_n] = sum_j [1 - C(N - N_j, n) / C(N, n)], with N the records in the cell and N_j the records of species j; computed with log-gamma functions; empty when N < n. It standardises the number of records and reduces, but does not remove, the effect of unequal sampling. When records are species-site combinations (as in checklist data), the result is the expected richness in a sample of records, not of individuals.

Summary per grid: cells, occupied cells and percentage, records assigned, records in removed cells, records whose coordinate uncertainty exceeds the cell size, gamma richness (total observed species across the cells), mean, median and maximum richness and records **over occupied cells**, rarefaction inclusion counts.

Species table: records and cells occupied (F_j) per species, percentage of cells. Presence/absence matrix PA_ij = 1 if species j has a record in cell i (occupied cells only).

## Regions

Each feature of the boundary file is a region; a record inside the outline is assigned to the first region containing it (regions may not overlap). Per region: area, records, richness, records and species per 1,000 km2, rarefied richness, species list.

## Similarity and beta diversity

From the presence/absence matrix, for units A and B with a shared species, b only in A, c only in B: Jaccard a/(a+b+c); Sorensen 2a/(2a+b+c); Sorensen dissimilarity (b+c)/(2a+b+c); Simpson dissimilarity (turnover) min(b,c)/(a+min(b,c)); nestedness component = Sorensen dissimilarity - Simpson dissimilarity (Baselga 2010). Across all units: Whittaker beta = gamma / mean alpha - 1; multiple-site Sorensen, Simpson and nestedness following Baselga (2010), using the sums over all pairs of min(b,c) and max(b,c). Multiple-site values depend on the number of units and are comparable only between sets of similar size. Only presence/absence indices are offered because occurrence records do not measure abundance.

## Classification and display

Map classes: continuous, natural breaks (Jenks 1967, Fisher-Jenks optimisation), equal intervals, quantiles. Cells without records are shown grey and never coloured as low richness.

## References

Baselga A. (2010) Partitioning the turnover and nestedness components of beta diversity. Global Ecology and Biogeography 19, 134-143. Hurlbert S.H. (1971) The nonconcept of species diversity: a critique and alternative parameters. Ecology 52, 577-586. Jaccard P. (1901) Bulletin de la Societe Vaudoise des Sciences Naturelles 37, 547-579. Jenks G.F. (1967) International Yearbook of Cartography 7, 186-190. Simpson G.G. (1943) American Journal of Science 241, 1-31. Snyder J.P. (1987) Map projections: a working manual. USGS Professional Paper 1395. Sorensen T. (1948) Biologiske Skrifter 5, 1-34. Whittaker R.H. (1960) Ecological Monographs 30, 279-338.
