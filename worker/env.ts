import type { D1Database, Fetcher } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BODS_API_KEY?: string;
  DARWIN_TOKEN?: string;
  TRAFFIC_FEED_URL?: string;
  TRAFFIC_FEED_TOKEN?: string;
  STREET_MANAGER_ENABLED?: string;
}
