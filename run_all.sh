#!/usr/bin/env bash
# Full Gridrich validation: rebuild, headless browser test suites, and the
# independent R/sf comparison on both reference datasets (square and hexagon).
# Requirements: python3, node >= 18 with playwright (npm install), R >= 4.1 with sf.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 build.py
echo "== browser test suites"
fail=0
for t in review_geometry review_records review_records13 review_boundary review_regions_state review_misc review_screening; do
  out=$(node test/$t.mjs 2>&1) || true
  n_pass=$(printf '%s\n' "$out" | grep -c '^PASS' || true); n_fail=$(printf '%s\n' "$out" | grep -c '^FAIL' || true)
  echo "$t: $n_pass passed, $n_fail failed"; [ "$n_fail" -eq 0 ] || { fail=1; printf '%s\n' "$out" | grep '^FAIL'; }
done
echo "== independent R/sf reference tables"
Rscript validation/validate.R test/bgd_example_divisions.geojson test/bgd_example_records.csv validation/bangladesh 10,25,50 50 division 0 2>/dev/null | grep -v "planar\|although"
Rscript validation/validate.R test/bgd_example_divisions.geojson test/bgd_example_records.csv validation/bangladesh_minshare05 10,25,50 50 division 0.5 2>/dev/null | grep -v "planar\|although"
echo "== comparison"
node validation/compare.mjs test/bgd_example_divisions.geojson test/bgd_example_records.csv validation/bangladesh 10,25,50 50 division bangladesh 0 | tail -2 || fail=1
node validation/compare.mjs test/bgd_example_divisions.geojson test/bgd_example_records.csv validation/bangladesh_minshare05 10,25,50 50 division bangladesh_minshare05 0.5 | tail -2 || fail=1
[ $fail -eq 0 ] && echo "ALL PASSED" || { echo "FAILURES"; exit 1; }
