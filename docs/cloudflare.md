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
npx wrangler secret put DARWIN_TOKEN
npx wrangler secret put TRAFFIC_FEED_URL
npx wrangler secret put TRAFFIC_FEED_TOKEN
```

Only configure feeds you have credentials for. Darwin still requires an OpenLDBWS SOAP token; the migration does not add Rail Data Marketplace JSON support. Street Manager uses signed subscriptions, not an API key. Never prefix credentials with `VITE_`.

After adding or changing a secret, run `npm run cf:deploy`. Wrangler creates a secret-only Worker version, and a full deployment ensures the cron trigger invokes the application bundle containing that secret.

## Local Cloudflare runtime

```sh
npm run build
npm run cf:migrate:local
npm run cf:dev
```

Wrangler displays the local URL. Optional local secrets belong in the ignored `.dev.vars` file. Trigger a local scheduled update with `/__scheduled?cron=*+*+*+*+*` when running `cf:dev`. The production app has no public manual polling endpoint.

## Free-plan constraints

Static assets are served directly; `/api/*` invokes the Worker. Feed polling runs once per minute, not continuously. D1 persists snapshots, road events, subscription state and delivery IDs across deployments. Snapshot chunks limit write amplification; snapshots exceeding the configured storage budget fail visibly instead of truncating live data. Old vehicle/traffic observations disappear after five minutes.

Free Workers currently allow 100,000 requests/day and 10 ms CPU per invocation. Free D1 allows 5 million rows read/day and 100,000 rows written/day. Signed notification verification, XML parsing, route matching, full-country Street Manager deliveries, and active map clients can exceed these budgets. This deployment does not enable a paid plan. Inspect Workers metrics and D1 usage after adding real credentials; local tests do not prove production CPU compliance. A credential-free map is supported, but all live feeds on the free tier are not guaranteed.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

Keep one deployment writing each D1 database. D1 batches publish each feed snapshot atomically and preserve road-event ordering/cancellation tombstones. SNS delivery IDs are retained for seven days. Back up D1 before schema changes; this deployment starts with a fresh cloud database and does not import the local SQLite history.
