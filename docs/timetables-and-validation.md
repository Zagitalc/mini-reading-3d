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

### Tonight / overnight departures

The stop details panel offers **Next departures** (the existing next-12 view) and **Tonight / overnight**. The latter lists scheduled departures from now until the next 04:00 in Europe/London. Before 04:00 it shows the remainder of the current night; at 04:00 a new window begins. The civil cutoff is resolved separately from the GTFS service-day origin so both UK clock changes work correctly.

The panel shows the window's dates and cutoff, marks following-calendar-day departures “Tomorrow”, and preserves the original service date, destination, approximate-time and pickup-arrangement labels. Thirty rows appear initially; **Show more departures** reveals subsequent rows from the same cached calculation. The count states how many are visible and how many fall in the window. This cutoff does not identify the last bus or establish a viable journey home. Post-midnight route labels require actual scheduled departures in that window, and do not claim uninterrupted all-night operation.

Expired and future-only snapshots show unavailable states rather than implying that buses have stopped running. A window extending beyond the dataset's final date warns of partial coverage; known overnight calls from covered service dates can still appear. No times are inferred for missing or frequency-based records. Switching views, revealing more rows and minute-by-minute refresh use the existing stop cache: there are no additional provider calls or D1 writes.

`tests/tonight-timetable.test.ts` covers midnight, the 04:00 boundary, both DST transitions, service exceptions, coverage states and untruncated results. `npm run test:tonight-browser` exercises the panel using deterministic timetable fixtures with provider requests intercepted. The [PDF source audit](timetable-audit-2026-09-26.md) remains separate: the sampled route 21 PDF/GTFS differences are unresolved and have not been hard-coded into this feature.

### Evening timetable explorer

**Evening timetable** in the layers panel shows the scheduled network at a chosen time of night: which routes have buses timetabled to be on the road, which start later, which have finished, and each destination's remaining journeys and last start before 04:00. A bar chart shows buses timetabled to be on the road from 16:00 to 04:00, and **Show only these routes on the map** dims the rest of the bus route layer. It is labelled as a scheduled view and never mixes in live vehicle positions, delays or cancellations.

A night runs from 04:00 to 04:00 London time, as in the stop panel. Times from 00:00 to 03:59 are the early hours after the chosen date. Journeys from the previous and following GTFS service dates count where they overlap the night, so a 25:10 trip from Friday and an early Saturday trip at 03:20 both appear on Friday night. When the day before or after is outside the snapshot, the view warns that crossing journeys may be missing.

The compiler writes one service summary per dataset, `timetables/<version>/services-<hash>.json`, referenced from `bus-stops.json` as `servicesUrl`. Each timed, non-frequency journey that boards inside the map area has one row: service, route, destination at its first boarding stop (so loop routes keep their far-side label), direction, first boarding time, last timed call in the map area (terminal included) and first boarding stop. It is about 380 KB (under 50 KB compressed), loads only when the explorer opens and is reused for every date and time. Snapshots compiled before `TIMETABLE_COMPILER` 4 have no summary; the explorer then says it will be available after the next refresh. `tests/scheduled-services.test.ts` covers the night boundaries, both service-date overlaps, clock changes, coverage and the compiled summary; `npm run test:evening-browser` exercises the panel with fixtures.

### "What if" frequency scenarios

**What if…** in the layers panel takes one bus route, a stretch of one night and an even interval (4 to 60 minutes), and sets today's timetable beside the same route at that interval. It reports, for each direction, buses leaving, the average and longest wait at a reference stop, the most buses needed at once (with turnaround), the most on the road at once and the hours of running, and can draw both on the map at a chosen minute: hollow grey dots for today's timetable, filled dots in the route colour for the scenario. It is labelled as a scenario, not a forecast.

The logic is in `shared/scenarios.ts`. It reads the service summary for calendars and each route's `journeys-*.json` for call times and road geometry, joined on first stop, start and end time (every summary row matched for the 28 September 2026 snapshot). Waits are measured at the stop most of a direction's window journeys call at, averaged over arrivals spread evenly through the window. Every journey that passes that stop inside the window is replaced by the commonest full calling pattern at the chosen interval, starting at today's first departure in the window when it falls within one interval of the start. Each new journey copies the running times of today's journey on that pattern nearest in time. Journeys outside the window are unchanged, so waits near the end of a window depend on the next timetabled bus.

Assumptions, all shown in the panel: buses run to time and evenly spaced; people arrive at random; each bus needs a turnaround of 10% of its running time, at least 5 minutes (`ASSUMPTIONS` in `shared/scenarios.ts`); only running inside the map area is counted; route, stops and demand are unchanged. It makes no ridership, cost or staffing claim. The per-route history recorded by Reading over time is network-wide, so it cannot check a route-level scenario; when the chosen window includes the present moment and the live bus feed is connected, the panel shows how many buses are reporting that route. `tests/scenarios.test.ts` covers the wait arithmetic, the calendar join, fleet and phase; `npm run test:scenario-browser` checks the panel against the bundled timetable.

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

Manual runs of the refresh workflow also run the complete validation and deployment path when the feed is unchanged, so deployment credentials can be verified without waiting for a timetable change. Scheduled runs continue to skip unchanged builds and deployments.

Deployment verification: on 26 September, the publisher returned HTTP 403 for both its current download and open-data index from GitHub-hosted runners. Local downloads still work. Unattended refresh is therefore blocked until the publisher provides a CI-accessible download or an approved runner is configured. The workflow fails visibly and leaves production intact. A manual run can uncheck `refresh_feed` to validate and deploy the already bundled timetable; this does not refresh timetable coverage.
