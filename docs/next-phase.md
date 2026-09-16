# Routes and landmark release

Bus routes and Train routes are independent static layers, initially off. Search by route number, available destination or corridor name, choose an item to dim its peers, or reset with All routes. Clicking an overlap opens a chooser. Live vehicle switches remain independent. Traffic congestion is drawn above both route layers and has its own legend and unavailable state.

## Reproduce the geography

1. `npm run data:download`
2. `.geo-venv/bin/python scripts/extract-osm.py raw/berkshire.osm.pbf` (Python environment needs `osmium`.)
3. `npm run data:build` — writes to **raw/staging**, not bundled assets.
4. `node --import tsx scripts/build-routes.ts` — uses the existing bundled GTFS snapshot and staged railway geometry.
5. `GEOGRAPHY_OUTPUT=raw/staging npm test`
6. With the dev server running, `STAGING_DATA=raw/staging node tests/phase-browser.mjs` validates staged assets in Chrome. Review screenshots before promotion.
7. Copy validated staging files into `public/data`, run `npm run cf:check`, `npm run test:cloudflare`, and browser checks, then commit and deploy with `npm run cf:deploy`.

`GEOGRAPHY_OUTPUT` can select another staging directory. Raw downloads remain ignored. The bundled live matching network and live API contracts are unchanged.

## Provenance and interpretation

- Bus geometry: 53 routes from the bundled Reading Buses GTFS snapshot, 2026-09-05. Clip each shape to the map boundary; retain distinct variants and remove identical/reversed coordinate sequences at six decimal places. These are snapshot patterns, not a promise that each variant operates today. Destinations come from trip headsigns.
- Colour names for emerald 5/6/6a, orange 13/14, sky blue 15/15a and purple 17 were checked against [Reading Buses](https://www.reading-buses.co.uk/maps/15) and its current [15](https://www.reading-buses.co.uk/services/RBUS/15) and [17](https://www.reading-buses.co.uk/services/RBUS/17) pages on 2026-09-05. Display shades approximate that branding. Other routes use the documented FNV-1a hash palette in `shared/static-routes.ts`. The GTFS's white placeholder is not treated as a verified colour.
- Rail: seven infrastructure corridors follow connected non-service OSM track edges; no synthetic links bridge disconnected tracks. Parallel tracks are represented by one path, while the original detailed track basemap remains. Labels and colours identify infrastructure, not train services or operators. Endpoint coordinates identify the extent actually drawn.
- OSM source: Geofabrik Berkshire replication timestamp **2026-09-04T20:21:21Z**, retrieved 2026-09-05. [OSM attribution and ODbL](https://www.openstreetmap.org/copyright) apply to regenerated geography.
- Speed badges accept explicit 20/30/40/50/60/70 mph. Explicit national-limit tags remain NSL, even when the source also records their numeric equivalent. No numeric 60 badge appears in this particular snapshot because its 60 mph roads carry NSL tags. All seven renderings are tested. Dashed badges describe road limits; solid ones are surveyed sign locations. No area-wide zones or traffic-speed inference are introduced.

## Landmark modelling limits

`landmark-components.json` preserves georeferenced polygons and source tags. The station uses 15 platform outlines, separately identified canopy/entrance footprints and the mapped pedestrian footbridge as its elevated concourse. Roof structures have no walls to the ground. Only explicitly reviewed replacement IDs suppress generic buildings at both zoom regimes; nearby Thames Tower and Apex Plaza remain.

The Oracle follows its irregular mall footprint and separately identified riverside, cinema and parking components, including curved polygon ends. Geometry anchors are source coordinates, independent of label positions. No rectangle spans the Kennet. Roof patterns follow source footprint axes, not a guessed model rotation. Heights, facade glazing, roof profiles and skylight spacing remain approximate miniature details informed by the supplied screenshots; this is not a surveyed architectural model. Source building parts and platforms are retained by extraction for future refinement.

## Following phase — suggestions only

Validation before promotion: 34 regression tests passed with staged assets; desktop/mobile Chrome checked both selectors, overlap picking, route/vehicle independence and landmark views. A four-second station orbit at 1440×1000 measured a 16.7 ms median and p95 frame interval for both the deployed baseline and this phase (241 frames each). Draw calls increased from 57 to 97 for the added component meshes; this is a desktop sample, not a guarantee for every mobile GPU.

1. Clickable places and transport: source-backed landmark history, restaurant details, food-hygiene ratings, station facilities, bus stops and departures. Every card should show its source and update time.
2. Historical transit charts: observed headways, bunching and service coverage; rail delays only when supported by collected observations. Assess retention and storage costs first.
3. Environmental context: river levels, flood warnings and locally available measurements, with station locations and freshness.
4. A separate simulation mode: road closures, bus frequency changes and estimated accessibility impacts, with visible assumptions and uncertainty. Assess computation budgets independently.

Rankings must name the measured criterion, such as frequency or food hygiene. Do not call these popularity, ridership or customer satisfaction without corresponding evidence. No historical storage or simulation is implemented in this release.

The September 16 follow-up adds strict landmark footprint validation, GB/directional/conditional speed handling, a repeatable benchmark, and scheduled stop departures. See [the refresh and verification guide](timetables-and-validation.md).
