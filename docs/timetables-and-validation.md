# Stop timetables and rebuild checks

## Timetable release

The stop index is built from Reading Buses GTFS `stops`, `stop_times`, `trips`, `routes`, `calendar` and `calendar_dates`. Serving routes are joined through actual calls, never inferred from nearby route geometry. Direction IDs, headsigns and repeated stop sequences are retained.

The 26 September 2026 download contains 1,107 local stops and 54 routes, covering 19 September–25 October. This is a **static scheduled timetable**; BODS remains the independent live-position feed.

```sh
npm run data:gtfs:refresh
npm run check && npm run cf:check && npm run test:cloudflare
```

The refresh script downloads once, hashes sorted uncompressed GTFS text files (so ZIP timestamps do not trigger rebuilds), and skips unchanged content. Changed feeds build in `raw/gtfs-staging`; validation rejects expired/future-only data, missing local service today, broken joins, invalid geometry, small datasets and losses exceeding 20% of local stops/routes. It promotes the stop index, timetables, route geometry and overlays together. The deployment workflow only publishes after tests pass. A rejected feed leaves the deployed version unchanged.

`public/data/gtfs-metadata.json` records the content hash, retrieval date, calendar coverage and publisher `feed_info` version/dates when supplied. The current publisher ZIP omits `feed_info.txt`; coverage is derived from calendars and exceptions and does not promise that every route runs through the final day. The sidebar always shows the coverage date, warns within three days, and identifies expired/future data. Existing calendar filtering continues to suppress out-of-date scheduled services.

The index loads once; individual stop files load on demand with a 32-stop browser cache. An open board advances once per minute using cached data, with no provider calls or D1 writes. Content-addressed timetable directories retain the current and preceding dataset so recently opened panels can finish loading during a deployment.

### Daily GitHub workflow

`.github/workflows/refresh-gtfs.yml` checks daily at 04:23 UTC and supports **Run workflow**. Changed feeds are validated, tested, committed to `main`, then deployed directly in the same job. This does not rely on a second workflow being triggered by `GITHUB_TOKEN` pushes. The job checks the remote branch before deployment; it never force-pushes or deploys over a newer checkout. An unchanged but not-yet-deployed dataset is retried, allowing recovery from a failed deployment. Expiry and production-version checks appear in the run summary; expired data fails visibly.

One-time setup: add a repository Actions secret named `CLOUDFLARE_API_TOKEN`, limited to this Cloudflare account and the permissions needed to deploy Workers and reference the existing D1 binding. The account ID is public workflow configuration. Provider keys stay in Worker secrets; they are not copied to GitHub. Without the deployment secret, the workflow can download/validate but cannot publish changed data. GitHub may delay scheduled runs and may disable schedules after extended repository inactivity; inspect Actions when an expiry warning appears. The workflow cannot extend coverage beyond the publisher's feed.

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
