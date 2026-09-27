# Gridrich user manual

Version 1.0.0. Copyright (c) 2026 Kakon Chakma, MIT License.

## 1. Opening the application

Open `Gridrich.html` in a web browser (double-click, or File > Open). No installation and no internet connection are needed; nothing is uploaded. The application is tested in Chromium (Chrome, Edge) and uses standard web APIs, so recent Firefox and Safari are expected to work.

## 2. Boundary (step 1)

Drop the study-area outline on the first box or click to choose files.

- GeoJSON (`.geojson`, `.json`), KML (`.kml`), zipped shapefile (`.zip`), or `.shp` + `.dbf` + `.prj` selected together.
- A zip with several layers (for example GADM levels 0 to 3) shows a layer chooser; the divisions level is preselected.
- Several polygons are merged into one outline; holes are kept. If the file has several features you can also summarise by region (section 5).
- **Coordinate system.** A shapefile carries its coordinate system in the `.prj` file. Without it, or when coordinates are projected, Gridrich asks you to confirm or choose the system (WGS84 longitude/latitude, UTM zone, or PROJ string) and press Apply. It never assumes one.
- **Rejected files.** Features that overlap each other are rejected because overlaps would count area and records twice: dissolve them or fix the shared borders in a GIS (QGIS: Vector > Geoprocessing > Dissolve; Vector > Geometry Tools > Fix Geometries). Self-intersecting rings are rejected too, unless you tick *Repair self-intersecting polygons automatically*, in which case they are split into simple parts and the log says so. Areas crossing the antimeridian (180 degrees) are not supported.
- Very detailed files (more than 40,000 vertices) are kept as separate polygons instead of being merged; features above 20,000 vertices are not tested for self-intersection.
- Areas more than 5,000 km across get a warning: the equal-area projection keeps areas exact but distorts shapes far from the centre.

## 3. Occurrence records (step 2)

Drop a table with one row per record: CSV, TSV, TXT, Excel (`.xlsx`, first sheet) or the zip file exactly as downloaded from GBIF.

- Species, longitude and latitude columns are detected from common names (GBIF `species`, `decimalLongitude`, `decimalLatitude`; iNaturalist `scientific_name`, `longitude`, `latitude`) and can be changed.
- Coordinates are WGS84 longitude/latitude unless you choose UTM or a PROJ string. If most values are far beyond 180/90 the app switches to UTM and asks for the zone; if the records only fit the boundary with longitude and latitude exchanged, it tells you.
- **Optional screening columns.** *Taxon rank column* (GBIF `taxonRank`, detected automatically): records above species level are dropped; choose to keep species, subspecies, variety and form (default), species only, or all. *Coordinate uncertainty column* (GBIF `coordinateUncertaintyInMeters`) with an optional *maximum uncertainty*: records above the maximum are dropped, records without a value are kept and counted; after the run the summary reports, for every cell size, how many assigned records have an uncertainty larger than the cell.
- Species names are trimmed and internal runs of spaces collapsed, but otherwise matched exactly (case sensitive). Standardise spelling and synonyms before gridding.

## 4. Grid (step 3)

- **Cell sizes** in km, comma separated. *Suggest sizes* proposes sizes giving roughly 400, 100 and 25 cells.
- **Cell shape.** Square (size = side) or hexagon (size = distance between opposite edges; area = 0.866 size^2).
- **Minimum share of cell inside boundary.** Default 0: every cell touching the area is kept, so every record inside the outline is assigned at every cell size and gamma richness does not depend on cell size. 0.5 drops cells mostly outside (records inside the boundary but in removed cells are counted as `records_in_removed_cells`); 1 keeps only cells completely inside. Prefer judging small edge cells afterwards with `prop_in` or `area_in_km2` rather than discarding their records.
- **Clip edge cells** cuts edge cells to the outline in the map and exports.
- **Species list per cell** adds a semicolon-separated list.
- **Remove coordinate duplicates** (off by default) drops rows with the same species name and coordinates. Other fields are not compared, so such rows may be separate observations; they raise record counts but never richness.
- **Rarefied richness**: expected number of species in a random sample of n records (Hurlbert 1971), n at least 2. It standardises the number of records compared and reduces, but does not remove, the effect of unequal sampling. Cells with fewer than n records get no value. Choose n from the distribution of records per cell (the Charts tab shows it).

## 5. Regions

If the boundary has several features, tick *Also summarise by region* and choose the attribute with the region names. Each region gets records, richness, records and species per 1,000 km2, rarefied richness, a species list, a map layer, a table, Excel sheets and a GeoJSON export. The grid is still built over the merged outline. Regions must not overlap (the file is rejected if they do).

## 6. Running and the audit trail

Press *Build grids and count*. The progress bar and the text under it show the stage (boundary test, grid construction with percentage, counting, regions, drawing); the button is disabled while the run lasts. The log and the Data quality table report: records submitted; missing or non-numeric coordinates; coordinates outside range; missing species name; not identified to species rank (if a rank column is chosen); uncertainty above the maximum (if set); coordinate duplicates; **outside the boundary outline (excluded)**; records inside the boundary; unique species; and for every cell size the records in removed edge cells and the records assigned. Submitted = dropped + outside + removed + assigned at every cell size.

## 7. Results

- **Map**: colour cells or regions by any metric or by one species; nine palettes, continuous or classified (natural breaks, equal intervals, quantiles); graticule and country basemap; record overlay (green inside, red outside) to check alignment before running; hover for values; scroll to zoom.
- **Summary**: one row per cell size; data quality table.
- **Cells**, **Species**, **Regions**: full tables.
- **Charts**: plain-language reading plus six charts. Colour bars and dots by value with any palette or a single colour; colour the effort chart's dots by rarefied richness, share inside the boundary or record density; linear or log axes; number of species; histogram bins; value labels. Each chart has PNG and SVG buttons, and the toolbar saves all charts as a zip at the chosen width.
- **Compare maps**: every grid and the regions side by side for one variable or one species, with a shared colour scale (same colour = same value in every panel, the right choice for judging the effect of cell size) or separate scales, the map's palette, classes and basemap, a choice of layers and columns, hover values, and PNG/SVG export of the whole panel.
- **Similarity**: pairwise indices between regions or between the occupied cells of one grid; multiple-site values across all units. Compare multiple-site values only between sets with similar numbers of units.
- **Methods**: methods statement (copy into a manuscript), reproducibility table (input file SHA-256 and size, projection, grid origin, bounding box, settings, counts), JSON configuration, HTML report.
- **Export**: Excel workbook, cells CSV, presence/absence CSV, GeoJSON (per cell size or regions), PNG and SVG map. When a presence/absence matrix is too large for a worksheet the sheet holds a note and the CSV download should be used.

## 8. Columns

Cells: `cell_id, cellsize, cell_area_km2, area_in_km2, prop_in, x, y, lon, lat, n_occ, record_density_per_km2, richness, pct_species, occupied, species_list, richness_rarefied`.

Summary: `scale, cellsize, n_cells, n_occupied, pct_occupied, total_occ, records_in_removed_cells, records_uncertainty_above_cell, gamma_richness, mean_richness_occupied, median_richness_occupied, max_richness, mean_occ_occupied, median_occ_occupied, max_occ, rarefy_n, cells_rarefied, cells_excluded_rarefaction`.

Regions: `region, area_km2, n_occ, richness, occ_per_1000km2, species_per_1000km2, richness_rarefied, species_list`.

The `columns` sheet of the workbook defines every column and records the projection, grid origin and bounding box.

## 9. Interpreting the results

Observed richness rises with the number of records and with cell size. Compare richness with `n_occ`, or use rarefied richness, before describing a cell as exceptionally rich; Gridrich reports highest observed richness, not hotspots in the sense of a defined hotspot methodology. Grey cells have no records: they are unsampled, not species poor. `gamma_richness` is the total observed richness across the cells of a grid, not an estimate of true regional diversity. `pct_species` uses the species pool retained at that cell size as denominator and is not comparable across cell sizes.
