import type { D1Database, Fetcher } from '@cloudflare/workers-types';

export interface Env {
  TOMTOM_API_KEY?:string;
  TOMTOM_MONTHLY_TILE_LIMIT?:string;
  WEATHER_ENABLED?:string;
  FUEL_ENABLED?:string;
  DB: D1Database;
  ASSETS: Fetcher;
  BODS_API_KEY?: string;
  RDM_API_KEY?: string;
  DARWIN_TOKEN?: string;
  TRAFFIC_FEED_URL?: string;
  TRAFFIC_FEED_TOKEN?: string;
  STREET_MANAGER_ENABLED?: string;
}
