# Architecture

## Boundaries

- `shared`: geographic configuration, public types, coordinate transforms and date logic.
- `src/map`: MapLibre local-vector style, interaction and live-layer orchestration.
- `src/scene`: one Three.js custom layer sharing MapLibre's WebGL context/camera; worker-generated building geometry, landmarks, instanced vehicles and road furniture.
- `src/movement`: provider-independent observation ingestion and position interpolation.
- `server/providers`: SIRI-VM buses, National Rail SOAP boards, Street Manager/SNS and optional traffic bridge.
- `server`: polling/caching, journey matching, railway graph, versioned API and SQLite store.
- `scripts`: repeatable bounded geography and GTFS processing.

No application state or API key is stored on an upstream map service. No deployment or GitHub remote is configured.

## Static data flow

Geofabrik PBF → Python osmium polygon assembly → bounded GeoJSON → local MVT tiles (zoom 10–15) + building chunks + compact features + railway geometry. Source IDs and source timestamp are retained. The manifest declares the bounds, source, schema version, chunks and counts.

Building height precedence is measured height, storeys × 3 metres, then deterministic building-type estimate. User-facing descriptions disclose inferred heights. Footprints are real; texture palettes and roofs are procedural. Named landmarks use curated OSM positions and explicit footprint replacement IDs. These miniature assets are approximate, not architectural surveys.

Three.js merges each chunk into walls and roofs. One neutral window/brick texture is reused with vertex colours. Model coordinates use east/north local metres relative to Reading station and the same Mercator scale as the basemap. At wide zoom MapLibre draws coarse extrusions; at zoom 14+ Three.js loads intersecting chunks, nearest first, with at most 80 resident chunks and 3 worker requests. Leaving chunks dispose their geometry. Failed chunks are not retried in a tight loop. Vehicles and road furniture use instanced meshes. One renderer owns all Three.js objects.

The initial renderer uses WebGL2. Hardware fallback and full terrain are not implemented. A maximum 80-chunk working set keeps memory bounded but can show flat distant footprints at high pitch. All models currently use flat ground; bridge/tunnel tags remain in the source tiles and rail graph connectivity is preserved, but reliable per-vehicle vertical placement needs source elevation enrichment.

## Live data flow

One shared provider snapshot serves all browsers. Buses refresh at most once per minute through London-placed Worker requests; other feeds use the cron and their configured cadences. See `shared/feed-policy.ts` and `docs/cloudflare.md`. Atomic leases suppress overlapping requests and failures back off. Errors are reduced to non-secret status messages.

The browser fetches vehicle snapshots every minute. Observations older than five minutes are removed; stale status starts after two normal provider intervals. Interpolation never crosses a large observation jump. Extrapolation requires a matching journey path, stops at station holds, and is limited to one refresh interval. Anchors outside the fixed map boundary are omitted, with no wrap or edge clamp.

BODS identifiers are matched to GTFS trips when possible. A line/heading/proximity fallback also checks recent observations from the same journey. Branch variants may expose only their common local geometry, labelled as a shared section. Unmatched vehicles hold their reported location; they are not animated on straight lines through the town. Matched buses align to the route immediately and interpolate along it, with heading derived from the local tangent. New journeys and discontinuities rebind. The source GPS observation is retained separately from the rendered position. Stop panels show live estimates separately from the timetable. A departure gets one only when exactly one fresh bus (position under three minutes old) reports running that timetabled trip in GTFS-RT, carries the same route number, lies within 60 m of the journey's road, and implies a delay between 15 minutes early and an hour late. Per-route journey files (`journeys-*.json`, compiled with the timetable) hold each stop pattern's shape and stop distances and every trip's timed calls inside the map. Everything else keeps its scheduled time. Rail placement requires two known timed stations and a connected path; trains without enough evidence are omitted. OSM graph routing does not establish the actual platform, track assignment or signalling block.

## API v1

GET `/api/v1/vehicles`, `/api/v1/road-events`, `/api/v1/traffic`, `/api/v1/health` return `{ version: 1, generatedAt, data: [...] }`.

GET `/api/v1/vehicle-routes` returns `{ version: 1, routes: { [tripId]: [longitude, latitude][] } }`.

POST `/api/v1/ingest/street-manager` accepts signed AWS SNS notification envelopes only when the receiver is enabled. Production topic ARNs, signature version, certificate host/path, canonical signature, age and confirmation URL are validated. Arbitrary confirmation URLs are never followed. Body size is limited to 1 MB. SNS IDs deduplicate deliveries; upserts reject older event timestamps and lower equal-time versions. SQLite WAL persists closures and lifecycle changes across restarts.

Roadworks are geographic, not Reading-authority-only: events anywhere inside the map are included. Point events remain points. Only closure events produce X marks; ordinary works produce cones. Planned and actual dates remain distinct. Missing ends stay unknown. Traffic is separately sourced and is not inferred from speed limits or works.

## Operational notes

The health endpoint reports connection state and observation counts. A quiet Street Manager subscription cannot prove completeness or health; stored events after restart are labelled unverified until signed delivery is received. Subscription history/backfill requires a separately authorised export. Import it with `npm run data:roadworks -- file.json`.

The Node server is local by default; production runs on the existing Cloudflare Worker and D1. Daily validated GTFS refresh is defined in `.github/workflows/refresh-gtfs.yml`; see `docs/timetables-and-validation.md` for deployment-secret setup.
