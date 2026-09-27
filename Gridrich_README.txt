GRIDRICH 1.0.0 - desktop version
================================
Copyright (c) 2026 Kakon Chakma. MIT License (see LICENSE).
Third-party library licences: THIRD_PARTY_LICENSES.txt.

WHAT IT IS
Gridrich divides a study area into square or hexagonal grid cells of one
or several sizes and counts, for every cell, the number of occurrence
records and the number of species. Results can be mapped and saved as
Excel, GeoJSON (for QGIS / ArcGIS Pro), CSV and map images.

Everything runs inside your web browser. No installation, no internet
connection and no upload of your data: the file works offline.

WHERE TO GET IT
  Online:  https://kakonck.github.io/gridrich/
  Offline: https://github.com/kakonck/gridrich (Gridrich.html or the
           release zip under Releases)

HOW TO START
1. Double-click Gridrich.html. It opens in your default browser. It is
   tested in Chromium (the engine of Chrome and Edge) and written with
   standard web APIs only, so recent Firefox and Safari are expected to
   work; report any problem you meet there.
2. Press "Load example data" (top right) and then "Build grids and
   count" to see how it works. The example is Bangladesh: its eight
   divisions (geoBoundaries, CC BY 3.0 IGO) and Aves, 130,778 cleaned
   GBIF bird records (one per species and site, CC BY 4.0 or CC0), so
   both the grid and the region summary are shown. Loading takes a few
   seconds; the analysis at 10, 25 and 50 km about ten. The example
   files are in the examples folder (Bangladesh.geojson, Aves.csv).

STEP 1 - BOUNDARY
Drop the outline of your study area on the first box, or click it and
choose the file(s):
  - GeoJSON (.geojson or .json)
  - KML (.kml)
  - Zipped shapefile (.zip containing .shp, .shx, .dbf, .prj). If the
    archive holds several layers (for example GADM levels 0 to 3) a
    drop-down lets you choose the layer; the divisions level is
    preselected.
  - Or select the .shp, .dbf and .prj files together (hold Ctrl or Cmd)
Several polygons are merged into one outline. Holes are kept. If the
shapefile has no .prj file, or the coordinates are projected, the app
asks you to confirm or choose the coordinate system before it accepts
the file; it never assumes one. Features that overlap each other and
self-intersecting polygons are rejected (fix them in QGIS or ArcGIS, or
tick the repair option for self-intersections). Study areas crossing
the antimeridian are not supported.
GeoPackage (.gpkg) cannot be read in a browser: export the layer as
GeoJSON from QGIS or ArcGIS Pro first.

REGIONS (DIVISIONS, DISTRICTS)
If the boundary file has several polygons, for example the 8 divisions
of Bangladesh or the counties of a province, the app offers "Also
summarise by region". Choose the attribute field with the region names.
You then get, for every region: area, records, richness, records and
species per 1000 km2, optional species list and rarefied richness; a
"Regions" map layer; a Regions tab; a "regions" sheet in the Excel file
and a GeoJSON download. The grid itself is built over the merged outline
of all regions.

STEP 2 - OCCURRENCE RECORDS
Drop a table with one row per record: CSV, TSV, TXT or Excel (.xlsx), or
the zip file exactly as downloaded from GBIF.
Needed columns: species name, longitude (or X), latitude (or Y).
Common column names are detected automatically (GBIF downloads and
iNaturalist exports work as they are); otherwise pick the columns from
the drop-down lists. Coordinates are taken as WGS84 longitude/latitude
unless you choose UTM or give a PROJ string. Rows without coordinates or
species are dropped; the log tells you how many.
Optional screening columns: a taxon rank column (GBIF taxonRank) drops
records above species level; a coordinate uncertainty column (GBIF
coordinateUncertaintyInMeters) with an optional maximum drops imprecise
records, and the summary counts, for every cell size, the assigned
records whose uncertainty is larger than the cell. Without a rank column
the data-quality table says the rank was not checked.
Only records inside the boundary outline (holes excluded) are analysed;
records outside it are counted and excluded from every grid and region.

STEP 3 - GRID
  - Cell sizes in km, comma separated (e.g. 10, 25, 50). "Suggest sizes"
    proposes sizes that give roughly 400, 100 and 25 cells.
  - Square or hexagon cells.
  - Minimum share inside boundary (default 0): 0 keeps every cell that
    touches the area, so every record inside the outline is counted at
    every cell size; 0.5 drops cells that are mostly outside (records in
    them are reported as records_in_removed_cells); 1 keeps only cells
    completely inside.
  - Clip edge cells to the outline (optional).
  - Species list per cell (optional).
  - Rarefied richness: expected number of species in a random sample of
    a fixed number of records (Hurlbert 1971). It standardises the number
    of records compared and reduces, but does not remove, the effect of
    unequal sampling.
  - Remove coordinate duplicates (off by default): rows with the same
    species name and coordinates. Date, observer and identifiers are not
    compared, so such rows may be separate legitimate observations; they
    raise record counts but never richness.

STEP 4 - RUN
Press "Build grids and count". The log reports dropped records, cell
counts and records outside the grid for every cell size.

DATA QUALITY (reported after every run, Summary tab and Excel sheet)
  Records submitted; missing or non-numeric coordinates; coordinates
  outside range; missing species names; not identified to species rank
  (if a rank column is chosen); uncertainty above the maximum (if set);
  coordinate duplicates (counted, removed only if you tick the option);
  outside the boundary outline (excluded); records inside the boundary;
  unique species; and, for every cell size, records in removed edge
  cells and records assigned to cells. Submitted = dropped + outside +
  removed + assigned, at every cell size.

METRICS PER CELL
  n_occ           occurrence count O_i
  richness        observed species richness S_i (distinct species)
  record_density_per_km2  occurrence-record density O_i / A_i (records
                  per km2 of the cell area inside the boundary); a proxy
                  for sampling intensity, not a direct measure of effort
  pct_species     S_i / S_total x 100, percentage of the species observed
                  at that cell size; not comparable across cell sizes
  richness_rarefied  expected species in a random sample of n records
                  (Hurlbert 1971); empty below n records; the summary
                  reports how many cells were included and excluded
  Summary table: mean_richness_occupied, median_richness_occupied,
  mean_occ_occupied and median_occ_occupied are over occupied cells only;
  gamma_richness is the total observed richness across the cells of a
  grid, not an estimate of true regional diversity.
  species frequency (Species tab): number of cells occupied per species
  presence/absence matrix (Export tab and Excel sheets pa_*): cells x
  species, 1 where the species has a record in the cell

RESULTS
  Map      : colour by richness, records, rarefied richness or share
             inside the boundary. Scroll to zoom, drag to pan, hover a
             cell for its values. Grey cells have no records.
  Summary  : one row per cell size (cells, occupancy, records assigned,
             records in removed edge cells, records with uncertainty
             above the cell size, gamma richness, mean / median /
             maximum richness and records over occupied cells).
  Cells    : the full cell table.
  Species  : records and cells occupied per species.
  Regions  : per-region table (when the boundary has several polygons).
  Charts   : plain-language reading of the results plus charts of
             richness against sampling effort, the distribution of
             richness, the effect of cell size, the most widespread
             species, and richness and effort by region. Colour bars and
             dots by value with any palette, colour the effort chart by
             rarefied richness, density or share inside, switch to log
             axes, choose the number of species and histogram bins. Every
             chart can be saved as a high-resolution PNG (width
             adjustable, 3000 px by default) or as an editable SVG, singly
             or all at once as a zip; titles are embedded, backgrounds are
             white.
  Compare  : all grids and the regions side by side for one variable or
             one species, with a shared or separate colour scale, using
             the map settings; PNG and SVG of the whole panel.
  Similarity: pairwise Jaccard and Sorensen similarity, Sorensen
             dissimilarity, Simpson turnover and nestedness between
             regions or between occupied cells; Whittaker beta and the
             multiple-site Sorensen partition (Baselga 2010); CSV download
             and Excel sheets. Presence/absence based only. Multiple-site
             values depend on the number of units: compare them only
             between sets with similar numbers of occupied units.
  Methods  : a methods statement written from your settings and results
             (copy it into a manuscript), a reproducibility table (input
             file SHA-256 hashes and sizes, projection, grid origin and
             bounding box in metres, all settings and counts), a JSON
             configuration file and a full HTML analysis report.
  Export   : Excel workbook (summary, cells, species, data quality,
             presence/absence, methods, regions, column dictionary),
             GeoJSON per cell size or for regions, presence/absence CSV,
             cells CSV, PNG and SVG map. When a presence/absence matrix is
             too large for a worksheet the sheet holds a note instead and
             the CSV download, which has no limit, should be used.

COLUMNS IN THE OUTPUT
  cell_id, cellsize, cell_area_km2, area_in_km2, prop_in,
  x, y (cell centre in the grid projection, metres),
  lon, lat (cell centre, WGS84),
  n_occ, record_density_per_km2, richness, pct_species, occupied,
  species_list, richness_rarefied

PROJECTION AND EXTENT
Grids are built in a Lambert azimuthal equal-area projection centred on
the boundary, so every cell has the same true area wherever the study
area is. Cells are laid out from the lower-left corner of the projected
boundary bounding box; the PROJ string, the origin and the bounding box
are written to the "columns" sheet of the Excel export and to the JSON
configuration, so a grid can be rebuilt exactly. The projection suits
local to continental study areas (up to a few thousand kilometres
across); shape distortion grows with distance from the centre and the
app warns above 5,000 km. Areas crossing the antimeridian are refused.

NOTES
  - Records exactly on a shared cell edge are counted in one cell only;
    records exactly on the boundary outline count as inside.
  - Records inside cells removed by the minimum share are reported as
    records_in_removed_cells for that cell size.
  - Observed richness rises with the number of records. Compare richness
    with n_occ, or use rarefied richness, before describing a cell as
    exceptionally rich; the software reports highest observed richness,
    not hotspots in the sense of a defined hotspot methodology.
  - Species names are trimmed but matched exactly (case sensitive).
    Standardise names before gridding.
  - Large inputs work: 640,000 records at three cell sizes take about
    two minutes, 140,000 records about half a minute (2023 laptop). The
    progress bar shows the state. Excel exports with a presence/absence
    sheet of hundreds of cells x hundreds of species reach 20 MB or more. Boundary files with more than 40,000 vertices are kept as
    separate polygons rather than merged; their features must not overlap
    (the app measures and reports any overlap).
  - If most records fall outside the boundary the log says whether the
    longitude and latitude columns appear to be swapped or whether the
    coordinates look projected.

VALIDATION
An independent script written in R with the sf package (validation/ in
the source) recomputes every table Gridrich produces, for square and
hexagonal grids, on the Bangladesh bird example with the default minimum
share and with a minimum share of 0.5: data-quality
counts, cells (area inside, share, records, richness, density, share of
species, rarefied richness, species lists), summaries, species
frequencies, regions, presence/absence matrices, pairwise Jaccard,
Sorensen, Sorensen dissimilarity, Simpson turnover and nestedness,
Whittaker beta and the multiple-site partition. A comparison script runs
the application headlessly and checks the values unrounded (counts
exactly; areas and densities to 1e-5 relative; rarefaction to 1e-7;
indices to 1e-9). The reports are in validation/reports of the source
package; both runs pass every check. The R and library versions used
are recorded in validation/*/sessionInfo.txt.

FILES IN THIS FOLDER
  Gridrich.html              the application (open in a browser)
  Gridrich_README.txt        this file
  LICENSE                    MIT License, Copyright (c) 2026 Kakon Chakma
  THIRD_PARTY_LICENSES.txt   licences of the bundled libraries
  examples/                  Bangladesh.geojson (eight divisions) and
                             Aves.csv (cleaned GBIF bird records)
  CITATION.cff, CHANGELOG.md citation metadata and version history

CITATION
  Chakma, K. (2026). Gridrich: grid-based species occurrence and richness
  analysis, version 1.0.0. Software.

VERSION HISTORY
  1.0.0  first public release.
