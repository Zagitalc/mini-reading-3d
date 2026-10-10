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

## Roadmap after the live-traffic map review (9 October 2026)

Source: a look at uklivetraffic.duckdns.org, a UK live-traffic map built with Next.js, MapLibre and OpenFreeMap. Two things are worth taking from it. The first is a warning: it puts a DfT yearly-average "busiest road" under a "Very busy now" headline and mentions that it is "not a live count" only in small print. The second is its local summary, which is a good idea even though its layout is not.

What stays the same: the stack (Vite, MapLibre, Three.js, the Cloudflare Worker and D1). Next.js is not adopted; nothing here needs server rendering. The miniature-world look stays too, so there are no two side panels, toolbar or ticker. New information goes into the panel, cards and bottom sheet that already exist.

### Order

1. Fix the two failing browser tests (history-browser and direct-finder-browser). Already queued; unchanged.
2. **Evidence labels** (small to medium; done 9 October). New, and placed first because items 3 and 4 below rely on it.
3. **Layer zoom thresholds and a render budget** (small; done 9 October, see below). Placed before landmark models, which add draw calls.
4. **Local summary for the area in view** (medium).
5. Detailed landmark models (large). Already queued; moves down behind items 2 to 4.
6. Multi-car trains (small). Unchanged; still waits for "build trains".
7. **Replay the last hour** (medium, low priority).

### Evidence labels

Every figure on the map, cards and summary says which kind of evidence it is:

| Label | Meaning | Examples in Mini Reading |
|---|---|---|
| Observed | Reported by a source for a specific recent moment | BODS bus GPS fixes, EA gauge readings and flood warnings, forecourt price submissions (with their age), active roadworks |
| Estimated | Worked out by us or a provider from other evidence | Train positions, live bus departure estimates, the animated bus position between fixes, Open-Meteo weather (modelled), TomTom flow speeds, Darwin expected times |
| Scheduled | Planned in advance | GTFS timetable departures, planned roadworks, Darwin booked times |
| Historical | A record or average of the past | Reading over time, history headlines, 30-day fuel range |

**What exists.** The distinction is already made in many places, but each one in its own words: `VehicleObservation.status` is `observed` or `estimated` (`shared/types.ts`), stop cards separate "Live estimates" from "Scheduled timetable" (`src/map/stop-layers.ts`), the summary card says trains are "positions estimated" and weather is "modelled, not measured here" (`shared/summary.ts`), and every feed has a `Provenance` with `observedAt`. Nothing yet makes the kind of evidence visible at a glance.

**The change.** One small badge (a letter or glyph plus text, never colour alone) used by summary lines, departure rows, vehicle and gauge cards and history headlines. `SummaryLine` gains an `evidence` field so a line cannot be added without one. Headlines must match their label: "now" only for observed figures, and a historical figure is never written in the present tense.

**Edge cases to settle while building it.** A bus card shows the observed GPS fix, but the bus on the map is drawn at an interpolated position, so the card and the drawing carry different labels. Fuel prices are observed but can be weeks old; the label stays "observed" and the age does the rest. TomTom flow is a provider's model of probe data, so it is labelled estimated rather than presented as a count.

**Depends on:** nothing new. It touches the summary card, stop and station cards, vehicle cards, river cards and the history panel.

### Layer zoom thresholds and a render budget

**What exists.** The layer groups are already done: modes (`shared/modes.ts`), five collapsible groups in the Explore panel (`src/ui/shell.ts`) and the Tools menu. Many layers already have a minimum zoom: route and bus labels from 13, river gauge labels from 13.5, stops from 15 with labels at 17, food from 12 with clusters and ratings at 16, road labels at 15, and Three.js buildings from 14 with at most 80 chunks. So this is mostly the zoom half of the item.

**What was done (9 October).** Checking the code showed the first draft of this item overstated the gaps. Speed-limit badges (from zoom 15.7), 3D signs (16) and cameras (15) already had zoom rules, and DOM markers, 3D vehicles and building chunks already had hard caps (160, 512 of each kind, 80). What was missing was a single place to read them. They now live in `shared/layer-zoom.ts` (`LAYER_ZOOM` and `RENDER_BUDGET`), every layer takes its zoom from that table, and `tests/layer-zoom.test.ts` fails if a new layer writes a zoom number beside itself or a label is set to appear before the thing it labels. The one new rule is for roadwork pins: below zoom 13 only road closures are pinned, because ordinary works are small and the town-wide view is crowded enough. `tests/roadworks-zoom-browser.mjs` covers it.

**Deliberately not done.** Bus dots, fuel pumps, river gauges, flood areas, event lines and traffic lines still draw at every zoom: there are on the order of a hundred buses, 37 forecourts and a handful of gauges, which is not crowded, and hiding them at town scale would hide the town-wide picture the modes exist to give. No per-mode budget was added either; there is no measurement showing a mode that needs one, and both test phones hold 60 fps. If a phone does struggle, the Graphics test tool is the way to find out which layer, and the table is where the fix goes.

**Depends on:** nothing. It should land before landmark models so their extra draw calls have a named budget to fit in.

### Local summary for the area in view

**What exists.** The mode summary card (`shared/summary.ts`, `src/ui/summary.ts`) gives town-wide counts from figures the layers already hold, published through `publishFact`. It does not follow the map and its lines cannot be clicked.

**The change.** The same card gains a "Here" view for the area in view: by default a circle around the map centre whose radius follows the zoom, plus a "pin this spot" option so it stops moving. It lists what is nearby and current: roadworks and closures, flood warnings and the nearest gauges against their typical range, the next departures from the two or three nearest stops (and the station board when Reading station is in range). Each item carries its evidence label. Tapping an item flies the map to it and opens the card that already exists for it (stop, gauge, roadwork, warning). On phones it lives in the existing bottom sheet; no second panel.

**Rule to keep.** The town-wide card shows only what its mode already loads. The local view is allowed one exception: it may fetch the timetable files for the few nearest stops, and only while the view is open. It must not switch on vehicle polling or any feed the mode does not already use.

**Depends on:** evidence labels (item 2); positions in the published facts rather than only counts, which means `publishFact` carrying the items themselves for roadworks, warnings and gauges; the existing stop timetable files and live-estimate code; and the zoom table in `shared/layer-zoom.ts` (item 3, done), so that "nearby" agrees with what is drawn.

### Replay the last hour (low priority)

This reverses the 3 October review's "no vehicle playback", so it needs a narrow version to be worth doing.

**What exists.** History (`shared/history.ts`, D1 tables `history_hours` and `history_fuel`) stores hourly summaries only, no positions. Buses are sampled only while someone has the map open, so a server-side record would have gaps whenever nobody was looking.

**The change.** Start in the browser: keep a rolling buffer of the vehicle snapshots this browser has already received (about one a minute) and let a slider replay them over the miniature. It costs no storage and no new requests, but it covers only the time since the page was opened, and the control has to say so ("replaying 23 minutes seen on this device"). A server-side hour of positions in D1 would come later, if at all, and only after checking write volume and stating its coverage.

**Depends on:** evidence labels (everything in a replay is labelled historical); the vehicle feed and movement tracker (`src/map/vehicle-feed.ts`, `src/movement`). Nothing else on this list depends on it.

## Following phase — suggestions only

The list below dates from the routes and landmark release. Items 1 and 3 have largely shipped and item 2 in part (Reading over time, without headways or bunching); the current order is in the section above.

Validation before promotion: 34 regression tests passed with staged assets; desktop/mobile Chrome checked both selectors, overlap picking, route/vehicle independence and landmark views. A four-second station orbit at 1440×1000 measured a 16.7 ms median and p95 frame interval for both the deployed baseline and this phase (241 frames each). Draw calls increased from 57 to 97 for the added component meshes; this is a desktop sample, not a guarantee for every mobile GPU.

1. Clickable places and transport: source-backed landmark history, restaurant details, food-hygiene ratings, station facilities, bus stops and departures. Every card should show its source and update time.
2. Historical transit charts: observed headways, bunching and service coverage; rail delays only when supported by collected observations. Assess retention and storage costs first.
3. Environmental context: river levels, flood warnings and locally available measurements, with station locations and freshness.
4. A separate simulation mode: road closures, bus frequency changes and estimated accessibility impacts, with visible assumptions and uncertainty. Assess computation budgets independently.
5. Trains as linked cars rather than one block: a simple carriage model repeated along the track behind the estimated position, each car following the railway's curve. Darwin's board gives a carriage count (`length`) for most services; on 3 October 2026 the Reading board had GWR trains of 3 to 10 cars, while the Elizabeth line reported 0 (unknown). Use the count when given, otherwise draw 3 cars.

Rankings must name the measured criterion, such as frequency or food hygiene. Do not call these popularity, ridership or customer satisfaction without corresponding evidence. No historical storage or simulation is implemented in this release.

The September 16 follow-up adds strict landmark footprint validation, GB/directional/conditional speed handling, a repeatable benchmark, and scheduled stop departures. See [the refresh and verification guide](timetables-and-validation.md).

The September 26 transport foundation adds validated daily GTFS refresh, expiry warnings, shared-section bus matching, journey continuity and route-following movement. Scheduled deployment requires the repository Cloudflare deployment secret described in [the refresh guide](timetables-and-validation.md).
