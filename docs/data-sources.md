# Data sources and known coverage

Checked 5 September 2026. No provider credentials were supplied or read from other projects.

| Source | Access verified | Current implementation |
|---|---|---|
| Geofabrik Berkshire OSM | Public PBF downloaded, snapshot 4 September 2026 20:21 UTC | Real bounded roads, buildings, parks/water, railway geometry, places, maxspeed and cameras |
| Reading Buses GTFS | Current public ZIP downloaded successfully | 320 route shapes, 6,042 trips, 53 routes, 1,107 local stops |
| Reading r2p open data | Public portal lists live vehicle APIs; registration required | Documented alternative; live adapter uses BODS SIRI-VM instead |
| BODS | DfT documents registered SIRI-VM access | Parser and bounded polling implemented; authenticated availability/Reading coverage not verified |
| National Rail OpenLDBWS | Current WSDL and imported SOAP binding checked | Registered SOAP board adapter, timed rail estimates, cancellation and dwell handling; authenticated feed not tested |
| Street Manager | Official event/SNS documentation checked | Signed HTTPS receiver and SQLite lifecycle store; subscription/backfill not available locally |
| Congestion | No complete free area-wide source established | Optional validated `TrafficSegment[]` bridge; unavailable by default |

Source pages:

- https://download.geofabrik.de/europe/united-kingdom/england/berkshire.html
- https://www.reading-buses.co.uk/open-data
- https://reading-opendata.r2p.com/
- https://www.bus-data.dft.gov.uk/
- https://github.com/department-for-transport-BODS/bods-data-extractor
- https://lite.realtime.nationalrail.co.uk/OpenLDBWS/documentation.aspx
- https://lite.realtime.nationalrail.co.uk/OpenLDBWS/wsdl.aspx?ver=2021-11-01
- https://www.nationalrail.co.uk/developers/darwin-data-feeds/
- https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/
- https://www.gov.uk/guidance/find-and-use-roadworks-data
- https://www.reading.gov.uk/vehicles-roads-and-transport/roads-and-streets/current-roadworks/

## Live transport

Put credentials in `.env` using the names in `.env.example`. BODS is used for buses because its published SIRI-VM contract is accessible without guessing a private r2p endpoint. Do not substitute a Reading r2p key for a BODS key. The National Rail adapter expects the OpenLDBWS SOAP token; some Rail Data Marketplace products use different authentication and are not interchangeable.

The rail request uses the 2021-11-01 request namespace and the 2015-05-14 SOAPAction specified by the current WSDL. It requests ten services per local station and uses a non-negative time offset compatible with ordinary tokens. Coverage is limited by station-board availability and known railway geometry; freight, non-stopping services, detailed platform assignments and precise train GPS are not provided.

Trains without two known timed calls or a verified station dwell are not placed. Live end-to-end validation requires credentials. No timetable-only train is labelled live.

## Speed signs and cameras

The bundled OSM snapshot has mapped road limits and 78 speed-camera nodes. Physical 20/30/NSL sign nodes and red-light camera locations were not found by this bounded extraction. Road-limit badges for 20 mph, 30 mph and NSL appear on mapped road sections; NSL requires an explicit national-speed-limit tag, not an assumption that every 60/70 mph road is NSL.

The UI distinguishes these dashed road-limit badges from surveyed solid signs, for which the renderer and schema are ready. Cameras indicate a mapped location only. No claim of camera operation, current enforcement or completeness is made.

## Roadworks

DfT's open feed pushes signed SNS envelopes to a public HTTPS endpoint. Register that receiver separately when hosting is desired. Local default operation never exposes the service publicly. The implementation accepts the production permit/activity topics and rejects unverified payloads. Section 58 restrictions are excluded because they do not by themselves mean a road is closed.

An authorised historic export can seed the SQLite store:

```sh
npm run data:roadworks -- /path/to/export.json
```

The export must contain official Street Manager event objects (`event_type`, `object_type`, `object_data`, `event_time`). This command is a local administrative import, not an unauthenticated HTTP bypass. Retain original provenance. Coordinates are converted from British National Grid with the standard seven-parameter transform; small positional error is possible without OSTN15. Only POINT and LINESTRING locations are currently placed. Proposed dates are shown as dates, actual timestamps as Europe/London times. Unknown dates are never fabricated.

An event stream is not a complete snapshot: events predating the subscription may be absent, and a quiet feed cannot prove that there are no roadworks. Do not scrape the council's one.network embed as an API.

## Optional congestion bridge

`TRAFFIC_FEED_URL` must be a server-controlled URL whose data you are authorised to use. It returns JSON `TrafficSegment[]`:

```json
[{
  "id": "provider-stable-road-id",
  "coordinates": [[-0.973,51.455],[-0.970,51.456]],
  "currentSpeed": 12,
  "freeFlowSpeed": 30,
  "confidence": 0.9,
  "source": "Your licensed provider",
  "observedAt": "2026-09-05T08:00:00Z"
}]
```

Speeds are mph, coordinates WGS84, confidence 0–1. This is a schema example, not an actual traffic observation and is never loaded as application data. Schema-invalid responses fail the feed; observations older than five minutes are omitted. The bridge token, if supplied, is transmitted only by the server in a Bearer header. No commercial provider is purchased or enabled by default.
