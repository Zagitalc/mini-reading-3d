# Mini Reading 3D

A local-first miniature of greater Reading built with TypeScript, MapLibre GL JS and Three.js. Real OSM footprints and locally generated map tiles, procedural buildings, six curated landmarks, local place search, sourced road-limit badges and camera locations. A separate Node service ingests transport and roadworks data without exposing credentials to the browser.

## Run

Node.js 24 or newer is required (SQLite uses `node:sqlite`). The generated geography is included; no map token or geography download is needed to explore.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5174/**. The API listens on **127.0.0.1:8787**. Both bind to loopback by default.

To run the compiled application:

```sh
npm run build
npm start
```

Then open **http://127.0.0.1:8787/**. Development uses Vite; production serves the application and API from one Node process.

The Node server limits each client to 1,200 requests per minute across all routes,
including static map files, with a tighter shared limit of 300 API requests per
minute. Limits run before file/database access, upstream requests and Street
Manager body parsing; excess requests return HTTP 429 with `Retry-After`.
Forwarded IP headers are ignored because this server binds directly to loopback
by default. If hosting Node behind a proxy, configure explicitly trusted proxy
addresses and a shared limiter store for multiple processes. The default counters
are in memory per process; these Express limits do not apply to the separate
Cloudflare Worker deployment.

## Live data setup

For hosting the whole application on Cloudflare Workers with persistent D1 storage, see [Cloudflare deployment](docs/cloudflare.md). Cloudflare buses refresh on demand through London-placed API requests, shared across viewers at most once per minute. Other feeds use the minute cron with their own cadences; local Node polling retains its original intervals.

Copy `.env.example` to `.env`, enter your registered provider credentials locally, and restart the API:

- `BODS_API_KEY`: Bus Open Data Service vehicle monitoring. Reading Buses publishes route geometry separately; 53 routes and 320 shapes are bundled.
- `RDM_API_KEY`: Consumer key for Rail Data Marketplace’s **Live Departure Board** product (Specification → API access credentials). Uses the detailed JSON board via `x-apikey`; no consumer secret is needed.
- `DARWIN_TOKEN`: Optional legacy National Rail OpenLDBWS SOAP token; `RDM_API_KEY` takes precedence. Train markers are estimates between timed calling points on connected OSM railway geometry, not GPS observations.
- `STREET_MANAGER_ENABLED=true`: enables the signed AWS SNS receiver at `/api/v1/ingest/street-manager`. DfT must register a publicly reachable HTTPS receiver before live roadworks can arrive. Local-only operation does not provide that public endpoint.
- `TRAFFIC_FEED_URL`: optional authorised bridge returning the documented traffic schema. No complete free Reading traffic feed is bundled or claimed.

**The default installation has no live vehicle, traffic or roadworks observations.** It explicitly reports each unavailable feed and never fills the map with fabricated live activity. Unit-test fixtures do not appear in the application.

See [data sources and limitations](docs/data-sources.md) for registration, coverage, timing, roadworks import and data contracts.

## Controls

Drag to pan, scroll to zoom, right-drag to tilt/rotate. Touch gestures and labelled controls work on mobile. Use the landmark dock or local search to fly to a place. Click a speed badge, camera, vehicle or road event for provenance and details. Solid speed signs represent mapped physical signs; dashed badges describe road limits only. The bundled snapshot currently has road-limit information, not surveyed 20/30/NSL sign locations.

## Development and verification

```sh
npm test
npm run build
```

Tests cover invalid coordinates, out-of-order observations, stale expiry, cancellation, bounds, station holds, route discontinuities, roadworks geometry/status/dates, persistence, SNS trust boundaries, API no-data behaviour and map-style validation. See [architecture](docs/architecture.md) and [verification notes](docs/verification.md).

## Rebuilding geography

The source snapshot comes from Geofabrik's Berkshire OSM extract, clipped to `[-1.08, 51.39, -0.84, 51.50]`. Install Python's `osmium` in an isolated environment:

```sh
python3 -m venv .geo-venv
.geo-venv/bin/pip install -r scripts/requirements-geo.txt
npm run data:download
.geo-venv/bin/python scripts/extract-osm.py raw/berkshire.osm.pbf
npm run data:build
npm run data:gtfs
npm run data:routes
GEOGRAPHY_OUTPUT=raw/staging npm test
```

Downloads are build-time only. `raw/`, `.env`, the Python environment and the SQLite store are excluded from Git. `public/data` contains the derived, versioned OSM database and bundled bus-network data; it is intentionally included for a reproducible local first run. Geography and static route generation now default to `raw/staging`. Validate it in the browser before copying staged files into `public/data`; see [routes and landmark release](docs/next-phase.md). The GTFS rebuild includes clickable stops and scheduled departures; use `GTFS_OUTPUT=raw/gtfs-staging` to stage a refresh. See [timetable updates, speed parsing, landmark validation and the benchmark](docs/timetables-and-validation.md).

## Attribution and licensing

Application code: MIT. Geography: © OpenStreetMap contributors, ODbL 1.0, distributed via Geofabrik. Reading Buses network data: Open Government Licence 3.0. Noto Sans glyphs: SIL Open Font License. Data licensing is separate from the code licence; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Mini London / Mini Tokyo informed the separation of rendering and movement concerns. This is a fresh implementation; no London application source or TfL credentials were copied.

Traffic/weather/fuel: enter `TOMTOM_API_KEY` in `.env` for local development. Keyless weather effects and Reading fuel snapshots are enabled there; see [feed sources](docs/data-sources.md#traffic-weather-and-fuel-september-2026) and [deployment/call budgets](docs/cloudflare.md#new-feed-configuration-and-call-budgets). Buses have route-coloured labels and selectable line matching. Use `npm run check:feeds` against the running local server (`APP_URL` overrides the URL) to audit cached feed status and the traffic request budget without calling providers directly.
