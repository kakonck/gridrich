# Changelog

All notable changes to Gridrich are recorded here. Versions follow semantic versioning.

## 1.0.0 - 2026-09-26

First public release.

- Equal-area square and hexagonal grids of any cell sizes over any polygon boundary (GeoJSON, KML, shapefile), with region summaries for multi-feature boundaries. Every cell touching the area is kept by default (minimum share 0); a positive minimum share is optional.
- Records are tested against the boundary outline (holes excluded); only records inside it are assigned to cells. Records in edge cells removed by the minimum-share rule are counted separately, so every submitted record is accounted for.
- Screening: missing, non-numeric and out-of-range coordinates, missing names, taxon rank (optional column), coordinate uncertainty (optional column and maximum; per-grid count of records whose uncertainty exceeds the cell size), coordinate duplicates (same name and coordinates, kept by default), swapped-column detection.
- Boundary safety: coordinate system must be confirmed when a shapefile has no .prj; overlapping features and self-intersecting rings are rejected (automatic splitting of self-intersections is opt-in); antimeridian-crossing areas are refused; areas over 5,000 km across get a distortion warning.
- Metrics: occurrence count, observed richness, occurrence-record density, percentage of observed species, Hurlbert rarefied richness, species frequency, presence/absence matrix, Jaccard, Sorensen, Sorensen dissimilarity, Simpson turnover, nestedness, Whittaker beta and the Baselga multiple-site partition.
- Compare maps tab: all grids and regions side by side with a shared or separate colour scale, PNG/SVG export.
- Outputs: interactive map with nine palettes and four classification methods, basemap and record overlays, six charts with PNG/SVG download, Excel workbook, CSV, GeoJSON, PNG/SVG maps, methods statement, reproducibility table (input file SHA-256, grid origin, bounding box), JSON configuration and HTML report.
- Validation: independent R/sf script recomputes every table for square and hexagonal grids on the built-in Bangladesh bird example (minimum share 0 and 0.5); comparison script and browser test suites run in continuous integration.
