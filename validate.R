# Independent recomputation of Gridrich results with R and sf.
# Copyright (c) 2026 Kakon Chakma. MIT License.
#
# This script does not use Gridrich or any of its code. It reads a boundary
# and an occurrence table, applies the documented rules and writes every
# table Gridrich produces (cells, summary, species, regions, presence/absence,
# pairwise similarity and multiple-site beta diversity) for square and
# hexagonal grids, unrounded, so that the comparison script can test the
# application against them.
#
# Usage:
#   Rscript validate.R <boundary.geojson> <records.csv> <outdir> <sizes_km> <rarefy_n> <region_field|-> [min_share]
#   e.g. Rscript validate.R test/bgd_example_divisions.geojson test/bgd_example_records.csv validation/bangladesh 10,25,50 50 division 0
#
# Rules (identical to the Gridrich documentation):
#   records: drop rows without numeric coordinates, with |lon|>180 or |lat|>90, or
#            with an empty species name; trim names and collapse internal spaces;
#            coordinate duplicates are kept
#   projection: Lambert azimuthal equal-area, WGS84, centred on the area-weighted
#            centroid of the boundary (two passes, centre rounded to 1e-4 degrees)
#   boundary: only records inside the outline (holes excluded) are analysed
#   grid:    squares of side s laid from the lower-left corner of the projected
#            bounding box; flat-top hexagons with distance s between opposite
#            edges, centres at x0 + i*1.5R, y0 + j*s (+ s/2 for odd i), R = s/sqrt(3);
#            a cell is kept when its area inside the boundary is > 0 (min share 0,
#            the default) or >= the given share; areas below 1 m2 count as 0
#   assignment: squares by integer index; hexagons to the nearest centre
#   metrics: n_occ, richness, record density, pct_species, Hurlbert rarefaction,
#            species frequency, presence/absence, Jaccard, Sorensen, Sorensen
#            dissimilarity, Simpson turnover, nestedness, Whittaker beta and the
#            Baselga (2010) multiple-site partition
suppressMessages(library(sf))
sf_use_s2(FALSE)
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 5) stop("arguments: boundary records outdir sizes_km rarefy_n [region_field]")
BOUNDARY <- args[1]; RECORDS <- args[2]; OUT <- args[3]
SIZES <- as.numeric(strsplit(args[4], ",")[[1]]); RAREFY <- as.integer(args[5])
REGION_FIELD <- if (length(args) >= 6 && args[6] != "-") args[6] else NA
MINSHARE <- if (length(args) >= 7) as.numeric(args[7]) else 0
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

div <- st_make_valid(st_read(BOUNDARY, quiet = TRUE))
occ <- read.csv(RECORDS, stringsAsFactors = FALSE, encoding = "UTF-8", check.names = FALSE)
lon_col <- intersect(c("decimalLongitude", "longitude", "lon", "x"), names(occ))[1]
lat_col <- intersect(c("decimalLatitude", "latitude", "lat", "y"), names(occ))[1]
sp_col  <- intersect(c("species", "scientificName", "scientific_name"), names(occ))[1]

# --- records: screening -------------------------------------------------
n_sub <- nrow(occ)
lon <- suppressWarnings(as.numeric(occ[[lon_col]])); lat <- suppressWarnings(as.numeric(occ[[lat_col]]))
sp  <- trimws(gsub("\\s+", " ", occ[[sp_col]])); sp[is.na(sp)] <- ""
ok_coord <- !is.na(lon) & !is.na(lat)
ok_range <- ok_coord & abs(lon) <= 180 & abs(lat) <= 90
ok_sp    <- sp != ""
keep <- ok_range & ok_sp
pts <- data.frame(species = sp[keep], lon = lon[keep], lat = lat[keep])
dup_keys <- sum(duplicated(pts))

# --- projection ------------------------------------------------------------
outline <- st_union(st_geometry(div))
c0 <- st_coordinates(suppressWarnings(st_centroid(outline)))
laea <- function(lon0, lat0) sprintf("+proj=laea +lat_0=%s +lon_0=%s +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs", lat0, lon0)
p1 <- st_transform(outline, laea(round(c0[1], 4), round(c0[2], 4)))
c1 <- round(st_coordinates(st_transform(st_centroid(p1), 4326)), 4)
crs <- laea(c1[1], c1[2])
bnd <- st_transform(outline, crs); bb <- st_bbox(bnd)
ppts <- st_transform(st_as_sf(pts, coords = c("lon", "lat"), crs = 4326), crs)

# --- boundary filter: an independent spatial predicate ------------------------
inside <- lengths(st_intersects(ppts, bnd)) > 0
n_outside <- sum(!inside)
ppts <- ppts[inside, ]; pts <- pts[inside, ]
xy <- st_coordinates(ppts)
cat(sprintf("submitted %d; dropped coordinates %d; out of range %d; species %d; duplicate keys %d; outside boundary %d; analysed %d; species %d\n",
            n_sub, sum(!ok_coord), sum(ok_coord & !ok_range), sum(ok_range & !ok_sp), dup_keys, n_outside, nrow(pts), length(unique(pts$species))))
write.csv(data.frame(item = c("submitted", "missing_coordinates", "out_of_range", "missing_species", "coordinate_duplicates", "outside_boundary", "inside_boundary", "species"),
                     value = c(n_sub, sum(!ok_coord), sum(ok_coord & !ok_range), sum(ok_range & !ok_sp), dup_keys, n_outside, nrow(pts), length(unique(pts$species)))),
          file.path(OUT, "expected_data_quality.csv"), row.names = FALSE)

rarefy <- function(counts, n) { N <- sum(counts); if (N < n) return(NA_real_); sum(1 - exp(lchoose(N - counts, n) - lchoose(N, n))) }

# --- similarity from a presence/absence matrix ---------------------------------
similarity <- function(PA, unit_names) {
  S <- rowSums(PA); a <- PA %*% t(PA); B <- outer(S, S, function(si, sj) si) - a; C <- t(B)
  mn <- pmin(B, C); den <- 2 * a + B + C
  out <- list(jaccard = a / (a + B + C), sorensen = 2 * a / den, bsor = (B + C) / den,
              bsim = mn / (a + mn), bsne = (B + C) / den - mn / (a + mn))
  for (k in names(out)) { m <- out[[k]]; diag(m) <- if (k %in% c("jaccard", "sorensen")) 1 else 0; dimnames(m) <- list(unit_names, unit_names); out[[k]] <- m }
  n <- nrow(PA); ST <- sum(colSums(PA) > 0); sumS <- sum(S)
  up <- upper.tri(a); summin <- sum(mn[up]); summax <- sum(pmax(B, C)[up])
  out$multi <- data.frame(n_units = n, gamma = ST, mean_alpha = sumS / n, whittaker_beta = ST / (sumS / n) - 1,
                          sorensen_multisite = if (summin + summax > 0) (summin + summax) / (2 * (sumS - ST) + summin + summax) else 0,
                          turnover_simpson = if (summin > 0) summin / (sumS - ST + summin) else 0)
  out$multi$nestedness <- out$multi$sorensen_multisite - out$multi$turnover_simpson
  out
}
write_sim <- function(sim, prefix) {
  for (k in c("jaccard", "sorensen", "bsor", "bsim", "bsne")) write.csv(sim[[k]], file.path(OUT, sprintf("%s_%s.csv", prefix, k)))
  write.csv(sim$multi, file.path(OUT, sprintf("%s_multisite.csv", prefix)), row.names = FALSE)
}

# --- grids -----------------------------------------------------------------
hex_ring <- function(cx, cy, R) { a <- pi / 3 * 0:5; rbind(cbind(cx + R * cos(a), cy + R * sin(a)), c(cx + R, cy)) }
summ_all <- NULL
for (shape in c("square", "hexagon")) for (km in SIZES) {
  s <- km * 1000
  if (shape == "square") {
    cols <- ceiling((bb["xmax"] - bb["xmin"]) / s - 1e-9); rows <- ceiling((bb["ymax"] - bb["ymin"]) / s - 1e-9)
    g <- expand.grid(i = 0:(cols - 1), j = 0:(rows - 1)); g <- g[order(g$j, g$i), ]
    cx <- bb["xmin"] + (g$i + 0.5) * s; cy <- bb["ymin"] + (g$j + 0.5) * s
    cell_area <- s * s
    polys <- lapply(seq_len(nrow(g)), function(k) st_polygon(list(rbind(c(cx[k] - s/2, cy[k] - s/2), c(cx[k] + s/2, cy[k] - s/2), c(cx[k] + s/2, cy[k] + s/2), c(cx[k] - s/2, cy[k] + s/2), c(cx[k] - s/2, cy[k] - s/2)))))
  } else {
    R <- s / sqrt(3); dx <- 1.5 * R; dy <- s
    cols <- ceiling((bb["xmax"] - bb["xmin"]) / dx) + 1; rows <- ceiling((bb["ymax"] - bb["ymin"]) / dy) + 1
    g <- expand.grid(j = 0:(rows - 1), i = 0:(cols - 1))[, c("i", "j")]  # i outer, j inner, as Gridrich
    cx <- bb["xmin"] + g$i * dx; cy <- bb["ymin"] + g$j * dy + ifelse(g$i %% 2 == 1, dy / 2, 0)
    cell_area <- sqrt(3) / 2 * s * s
    polys <- lapply(seq_len(nrow(g)), function(k) st_polygon(list(hex_ring(cx[k], cy[k], R))))
  }
  cells <- st_sfc(polys, crs = crs)
  # cells whose bbox is entirely outside the boundary bbox are never generated by Gridrich
  cb <- do.call(rbind, lapply(cells, function(p) as.numeric(st_bbox(p))))
  gen <- !(cb[, 3] <= bb["xmin"] | cb[, 1] >= bb["xmax"] | cb[, 4] <= bb["ymin"] | cb[, 2] >= bb["ymax"])
  inter <- suppressWarnings(st_intersection(st_sf(k = seq_len(nrow(g)), geometry = cells), st_sf(geometry = bnd)))
  area_in <- numeric(nrow(g)); if (nrow(inter)) area_in[inter$k] <- as.numeric(st_area(inter))
  area_in[area_in < 1] <- 0; area_in <- pmin(area_in, cell_area)
  prop <- area_in / cell_area; prop[prop > 1 - 1e-6] <- 1
  keepc <- gen & (if (MINSHARE > 0) prop >= MINSHARE - 1e-9 else prop > 0)
  g <- g[keepc, ]; cx <- cx[keepc]; cy <- cy[keepc]; prop <- prop[keepc]; area_in <- area_in[keepc]
  g$cell_id <- seq_len(nrow(g))
  # --- assignment
  if (shape == "square") {
    pi_ <- floor((xy[, 1] - bb["xmin"]) / s); pj <- floor((xy[, 2] - bb["ymin"]) / s)
    pi_[pi_ == cols & xy[, 1] <= bb["xmax"] + 1e-6] <- cols - 1; pj[pj == rows & xy[, 2] <= bb["ymax"] + 1e-6] <- rows - 1
  } else {
    i0 <- round((xy[, 1] - bb["xmin"]) / dx); best <- rep(Inf, nrow(xy)); pi_ <- pj <- rep(NA_integer_, nrow(xy))
    for (di in -1:1) { ii <- i0 + di; off <- ifelse(ii %% 2 == 1, dy / 2, 0); j0 <- round((xy[, 2] - bb["ymin"] - off) / dy)
      for (dj in -1:1) { jj <- j0 + dj; ccx <- bb["xmin"] + ii * dx; ccy <- bb["ymin"] + jj * dy + off; d <- (xy[, 1] - ccx)^2 + (xy[, 2] - ccy)^2
        better <- d < best; best[better] <- d[better]; pi_[better] <- ii[better]; pj[better] <- jj[better] } }
  }
  cid <- g$cell_id[match(paste(pi_, pj), paste(g$i, g$j))]
  n_removed <- sum(is.na(cid))
  n_occ <- tabulate(cid[!is.na(cid)], nbins = nrow(g))
  spl <- split(pts$species[!is.na(cid)], cid[!is.na(cid)])
  rich <- integer(nrow(g)); rich[as.integer(names(spl))] <- sapply(spl, function(v) length(unique(v)))
  rar <- rep(NA_real_, nrow(g)); rar[as.integer(names(spl))] <- sapply(spl, function(v) rarefy(as.numeric(table(v)), RAREFY))
  splist <- rep("", nrow(g)); splist[as.integer(names(spl))] <- sapply(spl, function(v) paste(sort(unique(v)), collapse = "; "))
  gamma_sp <- sort(unique(unlist(spl)))
  ll <- st_coordinates(st_transform(st_as_sf(data.frame(x = cx, y = cy), coords = c("x", "y"), crs = crs), 4326))
  out <- data.frame(cell_id = g$cell_id, cellsize = km, cell_area_km2 = cell_area / 1e6, area_in_km2 = area_in / 1e6,
                    prop_in = prop, x = cx, y = cy, lon = round(ll[, 1], 6), lat = round(ll[, 2], 6),
                    n_occ = n_occ, record_density_per_km2 = ifelse(area_in > 0, n_occ / (area_in / 1e6), NA),
                    richness = rich, pct_species = if (length(gamma_sp)) 100 * rich / length(gamma_sp) else 0,
                    occupied = n_occ > 0, species_list = splist, richness_rarefied = rar, row.names = NULL)
  tag <- sprintf("%s_%dkm", shape, km)
  write.csv(out, file.path(OUT, sprintf("expected_cells_%s.csv", tag)), row.names = FALSE, na = "")
  oc <- out[out$occupied, ]
  summ_all <- rbind(summ_all, data.frame(shape = shape, scale = paste0(km, "km"), cellsize = km, n_cells = nrow(out), n_occupied = nrow(oc),
    pct_occupied = 100 * nrow(oc) / nrow(out), total_occ = sum(out$n_occ), records_in_removed_cells = n_removed,
    gamma_richness = length(gamma_sp), mean_richness_occupied = mean(oc$richness), median_richness_occupied = median(oc$richness), max_richness = max(oc$richness),
    mean_occ_occupied = mean(oc$n_occ), median_occ_occupied = median(oc$n_occ), max_occ = max(oc$n_occ),
    rarefy_n = RAREFY, cells_rarefied = sum(!is.na(out$richness_rarefied)), cells_excluded_rarefaction = sum(oc$n_occ > 0 & is.na(oc$richness_rarefied))))
  # species table
  sp_in <- pts$species[!is.na(cid)]; cid_in <- cid[!is.na(cid)]
  spt <- data.frame(species = gamma_sp); spt$n_occ <- as.integer(table(sp_in)[spt$species])
  spt$n_cells <- sapply(spt$species, function(z) length(unique(cid_in[sp_in == z]))); spt$pct_cells <- 100 * spt$n_cells / nrow(out)
  spt <- spt[order(-spt$n_cells, -spt$n_occ, spt$species), ]
  write.csv(spt, file.path(OUT, sprintf("expected_species_%s.csv", tag)), row.names = FALSE)
  # presence/absence and similarity over occupied cells
  PA <- table(factor(cid_in, levels = oc$cell_id), factor(sp_in, levels = gamma_sp)); PA <- (unclass(PA) > 0) * 1
  write.csv(cbind(cell_id = oc$cell_id, as.data.frame(PA)), file.path(OUT, sprintf("expected_pa_%s.csv", tag)), row.names = FALSE)
  sim <- similarity(PA, as.character(oc$cell_id))
  write.csv(sim$multi, file.path(OUT, sprintf("expected_multisite_%s.csv", tag)), row.names = FALSE)
  if (nrow(oc) <= 400) write_sim(sim, sprintf("expected_sim_%s", tag))
  cat(sprintf("%s %d km: %d cells, %d occupied, %d records, %d in removed cells, gamma %d\n", shape, km, nrow(out), nrow(oc), sum(out$n_occ), n_removed, length(gamma_sp)))
}
write.csv(summ_all, file.path(OUT, "expected_summary.csv"), row.names = FALSE)

# --- regions -------------------------------------------------------------------
if (!is.na(REGION_FIELD) && REGION_FIELD %in% names(div)) {
  pd <- st_transform(div, crs)
  w <- st_intersects(ppts, pd); first <- sapply(w, function(v) if (length(v)) v[1] else NA_integer_)
  reg <- data.frame(region = pd[[REGION_FIELD]],
                    area_km2 = as.numeric(st_area(pd)) / 1e6,
                    n_occ = sapply(seq_len(nrow(pd)), function(k) sum(first == k, na.rm = TRUE)),
                    richness = sapply(seq_len(nrow(pd)), function(k) length(unique(pts$species[which(first == k)]))))
  reg$occ_per_1000km2 <- 1000 * reg$n_occ / reg$area_km2; reg$species_per_1000km2 <- 1000 * reg$richness / reg$area_km2
  reg$richness_rarefied <- sapply(seq_len(nrow(pd)), function(k) { v <- pts$species[which(first == k)]; if (length(v)) rarefy(as.numeric(table(v)), RAREFY) else NA })
  write.csv(reg, file.path(OUT, "expected_regions.csv"), row.names = FALSE, na = "")
  occ_reg <- reg$n_occ > 0
  PA <- table(factor(first[!is.na(first)], levels = which(occ_reg)), pts$species[!is.na(first)]); PA <- (unclass(PA) > 0) * 1
  write_sim(similarity(PA, reg$region[occ_reg]), "expected_sim_regions")
  cat(sprintf("regions: %d; records in no region: %d\n", nrow(reg), sum(is.na(first))))
  print(reg[, c("region", "n_occ", "richness")], row.names = FALSE)
}
writeLines(c(capture.output(sessionInfo()), "", sprintf("GEOS %s, GDAL %s, PROJ %s", sf_extSoftVersion()["GEOS"], sf_extSoftVersion()["GDAL"], sf_extSoftVersion()["PROJ"])), file.path(OUT, "sessionInfo.txt"))
