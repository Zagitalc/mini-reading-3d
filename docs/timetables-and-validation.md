# Stop timetables and rebuild checks

## Timetable release

The stop index is built from Reading Buses GTFS `stops`, `stop_times`, `trips`, `routes`, `calendar` and `calendar_dates`. Serving routes are joined through actual calls, never inferred from nearby route geometry. Direction IDs, headsigns and repeated stop sequences are retained.

The 16 September 2026 download contains 1,105 local stops; its service dates cover 7–18 September. This is a **static timetable snapshot**. Refresh it before expiry; neither the browser nor the minute Worker cron downloads timetables automatically. The UI identifies expired/future snapshots instead of reusing old times as current predictions.

```sh
npm run data:gtfs:fetch
GTFS_OUTPUT=raw/gtfs-staging npm run data:gtfs
```

Inspect `raw/gtfs-staging/bus-stops.json` (validity, provenance, omitted data) and the generated timetable files. After reviewing the staged output, promote `bus-network.json`, `bus-stops.json` and the complete `timetables` directory to `public/data`. Remove the previous timetable directory when promoting, so obsolete snapshots do not accumulate. Rebuild route overlays from the same network using `GEOGRAPHY_OUTPUT=public/data npm run data:routes`, then test, build and deploy together. To update directly in an isolated checkout, `npm run data:gtfs` uses `public/data` by default.

Stop timetables use a ZIP-version directory and content-hashed filenames. The index loads once; individual stop files load on demand, with a 32-stop in-memory cache. An open board advances once per minute using cached data, with no provider requests or D1 writes. Typical per-stop files are tens of KB before compression. Only the shared index is loaded when no stop is selected.

Weekly calendars and added/removed service exceptions are applied in Europe/London. GTFS times after 24:00 retain their original service day. Daylight-saving transitions use the GTFS “noon minus 12 hours” origin. The board shows up to 12 departures in the next 24 hours. Approximate timetable points and arranged-pickup requirements are labelled. Drop-off-only and terminal calls are excluded from departures even when a feed leaves terminal pickup at its default. Missing times are not invented; frequency-based trips are omitted rather than presented as exact departures. Bus cancellation/delay predictions are unavailable in this static feed.

Reference: [GTFS Schedule](https://gtfs.org/documentation/schedule/reference/). Source and licence: [Reading Buses open data](https://www.reading-buses.co.uk/open-data), OGL 3.0.

## Speed limits

The parser accepts explicit 20/30/40/50/60/70 mph, whitespace/case variants, GB:zone20/30 and explicit national-limit tags. Numeric 60/70 remain numeric unless an explicit compatible NSL tag is supplied. Conflicting directional values, incomplete directional information, conflicting base/type tags and conditional restrictions produce a rectangular information badge. Its details preserve the original tags; the map does not evaluate conditional restrictions or assert one convenient speed. Forward/backward refers to the OSM way direction, not a compass bearing.

## Landmark protection

`data:build` validates every configured replacement footprint and station component **before writing staging output**. Missing/duplicate IDs, changed geometry and changed building/railway classifications stop the build. `scripts/landmark-footprints.json` records the reviewed snapshot fingerprints.

When this fails, inspect the named feature in the new OSM extract. Update replacement IDs and modelling components where necessary, then review neighbouring procedural buildings for duplicates. Only after that review should you regenerate the fingerprints using `landmarkFingerprints` from `scripts/landmark-validation.ts` against `raw/geography.geojson`. Do not update fingerprints simply to bypass a failing check. Fingerprints are strict: harmless geometry reordering may also require review.

## Rendering benchmark

`docs/performance-baseline.json` records the deployed build before these additions. `tests/render-performance.mjs` measures a fixed Reading station camera, with a 20-second warmup and 20-second sample, at 1440×1000 and 390×844. Live feeds, weather, traffic and route/stop overlays are disabled for comparability. Device/browser changes affect timings; this is not a real-phone performance claim.

```sh
APP_URL=http://127.0.0.1:8790 BENCHMARK_COMPARE=docs/performance-baseline.json npm run test:performance
APP_URL=http://127.0.0.1:8790 npm run test:stops-browser
```

Use a local server with polling disabled or the deployed site; the benchmark intercepts API calls so it makes no additional upstream provider calls. The comparison fails on browser errors, failed building chunks, or more than 20% growth in chunks/geometries/draw calls. Median/p95 frame times are recorded as diagnostics, not a noisy FPS CI gate. Results are written to `test-results/performance.json`; review a new baseline deliberately when changing scene complexity. The stop browser check exercises actual marker clicks, desktop/mobile details, cached repeat selection and future/expired snapshots.

### Verified release comparison

[Updated measurements](performance-stop-release.json): median frame time 16.7 ms on both viewports. Desktop: 26 chunks, 102 draw calls (unchanged), 134 geometries versus 128. Mobile: 10 chunks, 68 draw calls and 82 geometries (unchanged). No failed chunks. These observations are from this Chrome host with provider fixtures; they do not establish performance on every device.

All 50 unit tests, Worker runtime checks, desktop/mobile stop interactions and existing route/landmark browser checks passed. All 1,103 timetable asset hashes and stop/route/service references were checked; the snapshot contains 152,385 non-terminal stop-time records.
