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

## Live data setup

Copy `.env.example` to `.env`, enter your registered provider credentials locally, and restart the API:

- `BODS_API_KEY`: Bus Open Data Service vehicle monitoring. Reading Buses publishes route geometry separately; 53 routes and 320 shapes are bundled.
- `DARWIN_TOKEN`: National Rail OpenLDBWS SOAP token. Train markers are estimates between timed calling points on connected OSM railway geometry, not GPS observations.
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
```

Downloads are build-time only. `raw/`, `.env`, the Python environment and the SQLite store are excluded from Git. `public/data` contains the derived, versioned OSM database and bundled bus-network data; it is intentionally included for a reproducible local first run. Build into a separate checkout before switching a running installation to a new snapshot, because tile generation replaces local chunks.

## Attribution and licensing

Application code: MIT. Geography: © OpenStreetMap contributors, ODbL 1.0, distributed via Geofabrik. Reading Buses network data: Open Government Licence 3.0. Noto Sans glyphs: SIL Open Font License. Data licensing is separate from the code licence; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Mini London / Mini Tokyo informed the separation of rendering and movement concerns. This is a fresh implementation; no London application source or TfL credentials were copied.
