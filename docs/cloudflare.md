# Cloudflare deployment

The app uses one Cloudflare Worker with Static Assets, a D1 database, and a cron trigger every minute. No Pages project, rented server, or custom domain is required. Local Node development remains available with `npm run dev`.

## First deployment

Use Node.js 24 or later, then:

```sh
npm ci --include=dev
npx wrangler login
npx wrangler d1 create mini-reading-3d
```

Copy the returned database ID into `wrangler.jsonc` (replace the all-zero placeholder). Then:

```sh
npm run cf:check
npm run test:cloudflare
npm run cf:migrate
npm run cf:deploy
```

Wrangler prints the real `https://mini-reading-3d.<account-subdomain>.workers.dev` address. Use that exact address followed by `/api/v1/ingest/street-manager` for both Permit and Activity subscriptions. The receiver is enabled by default but accepts only verified notifications from the official DfT topics. A browser GET returns 405 intentionally; notifications use POST.

## Credentials

Set credentials as Worker secrets; `.env` is not uploaded or used by the deployed Worker:

```sh
npx wrangler secret put BODS_API_KEY
npx wrangler secret put RDM_API_KEY
# Optional, only for an existing legacy SOAP credential:
# npx wrangler secret put DARWIN_TOKEN
npx wrangler secret put TRAFFIC_FEED_URL
npx wrangler secret put TRAFFIC_FEED_TOKEN
```

Only configure feeds you have credentials for. Rail uses the RDM Live Departure Board Consumer key via `RDM_API_KEY`, or a legacy OpenLDBWS SOAP token via `DARWIN_TOKEN`. Street Manager uses signed subscriptions, not an API key. Never prefix credentials with `VITE_`.

After adding or changing a secret, run `npm run cf:deploy`. Wrangler creates a secret-only Worker version, and a full deployment ensures the cron trigger invokes the application bundle containing that secret.

## Local Cloudflare runtime

```sh
npm run build
npm run cf:migrate:local
npm run cf:dev
```

Wrangler displays the local URL. Optional local secrets belong in the ignored `.dev.vars` file. Trigger a local scheduled update with `/__scheduled?cron=*+*+*+*+*` when running `cf:dev`. The production app has no public manual polling endpoint.

## Free-plan constraints

Static assets are served directly; `/api/*` invokes the Worker. Bus API requests refresh a shared snapshot at most once per minute while the map is in use; the cron handles the other feeds at their configured cadences. D1 persists snapshots, road events, subscription state and delivery IDs across deployments. Snapshot chunks limit write amplification; snapshots exceeding the configured storage budget fail visibly instead of truncating live data. Old vehicle/traffic observations disappear after five minutes.

Free Workers currently allow 100,000 requests/day and 10 ms CPU per invocation. Free D1 allows 5 million rows read/day and 100,000 rows written/day. Signed notification verification, XML parsing, route matching, full-country Street Manager deliveries, and active map clients can exceed these budgets. This deployment does not enable a paid plan. Inspect Workers metrics and D1 usage after adding real credentials; local tests do not prove production CPU compliance. A credential-free map is supported, but all live feeds on the free tier are not guaranteed.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Keep one deployment writing each D1 database. D1 batches publish each feed snapshot atomically and preserve road-event ordering/cancellation tombstones. SNS delivery IDs are retained for seven days. Back up D1 before schema changes; this deployment starts with a fresh cloud database and does not import the local SQLite history.

## New feed configuration and call budgets

For Node (`npm run dev` / `npm start`), add the traffic key to the ignored `.env`:

```dotenv
TOMTOM_API_KEY=
TOMTOM_MONTHLY_TILE_LIMIT=150000
WEATHER_ENABLED=true
FUEL_ENABLED=true
```

Weather and fuel use keyless endpoints. Existing BODS/rail credentials are preserved. `TRAFFIC_FEED_URL` is the older optional custom JSON bridge; leave it blank when using TomTom. The bridge is not polled when TomTom is enabled.

**`.env` is not uploaded to Cloudflare.** For the deployed Worker, run `npx wrangler secret put TOMTOM_API_KEY` and enter the key at the prompt, then deploy the tested bundle. Use `.dev.vars` for Wrangler local development. Non-secret weather/fuel switches and the traffic cap are in `wrangler.jsonc`. RDM JSON is supported through `RDM_API_KEY`; `DARWIN_TOKEN` remains a separate optional SOAP credential. Keys stay server-side and are not returned by the configuration API.

| Work | Cadence / bound |
| --- | --- |
| BODS bounding-box request | On demand, at most once per minute shared across all viewers (maximum 1,440/day); no idle cron calls |
| Rail boards | Once per minute per configured station (11 stations; at most 15,840/day); no per-viewer or per-train detail calls |
| Optional JSON traffic bridge | Five minutes (288/day), only without TomTom |
| TomTom | Visible Reading tiles only; five-minute cache; 150,000 upstream attempts/month hard cap by default |
| Open-Meteo | 15 minutes (96/day) |
| Reading fuel mirror | Six hours (4/day) |
| Street Manager | Push notifications only; zero polling calls |
| Browser vehicle state and health | Two requests/minute total while visible |
| Browser roadworks snapshot | Once per five minutes (95% fewer reads than the old 15-second refresh) |
| Browser weather / fuel snapshot | 15 minutes / six hours when healthy; bounded earlier retry while unavailable |

Provider failures use exponential backoff. Polling uses persistent atomic leases to avoid overlapping cron calls or concurrent viewers; this also suppresses premature manual local ticks. Immutable network assets are cached per isolate. Fresh buses are persisted before optional route-geometry work, so missing geometry cannot erase a working position feed. Five-minute vehicle expiry remains unchanged.

Street Manager verifies every notification before handling it. Out-of-area/unsupported notifications are acknowledged without writing per-message records; there is no local side effect to deduplicate. Relevant notifications retain deduplication and version ordering. This reduces D1 writes, **not inbound nationwide SNS delivery volume**. Narrowing that volume would require a supported change to the DfT subscription. Never drop relevant lifecycle updates to reduce traffic. Node prunes deduplication history at most hourly; Worker cleanup runs daily.

Run `APP_URL=http://127.0.0.1:8787 npm run check:feeds` after adding keys and restarting the app. Set `APP_URL` to the deployed URL to audit production. The check prints no credentials and reports the persistent TomTom counter and cap. Its vehicle request may trigger one shared BODS refresh when due. `/api/v1/usage` exposes the same budget/cadences. Node and Cloudflare counters are separate; other consumers of the same TomTom key are outside this cap. Production free-Worker CPU limits still need validation with the account's metrics; local runtime tests do not emulate CPU enforcement.

## BODS geographic restriction

On 16 September the global cron's BODS request received an explicit CloudFront country-block response (HTTP 403). The same authorised request worked from the UK. `wrangler.jsonc` therefore sets `placement.region` to `aws:eu-west-2` for fetch handlers. Buses refresh through `/api/v1/vehicle-state` and `/api/v1/vehicles`, under the existing D1 lease and backoff. The global cron excludes buses; placement of fetch handlers does not relocate scheduled handlers. Static assets remain served near visitors.

The first vehicle request after an idle period may wait for the provider. Concurrent requests share the refresh; subsequent requests read the saved snapshot. No observations are kept visible beyond their five-minute expiry, and the health panel is read after the vehicle request so it reflects the refreshed snapshot. Production verification recovered 104 fresh buses and 99 route-line matches. Keep the London placement when changing deployment configuration. See [Cloudflare placement](https://developers.cloudflare.com/workers/configuration/placement/).
