import { fetchBuses } from '../server/providers/buses';
import { fetchRailBoard, estimateBoard } from '../server/providers/trains';
import { fetchTraffic } from '../server/providers/traffic';
import { RailNetwork, STATIONS } from '../server/rail-network';
import { matchBusRoute, type BusNetwork } from '../server/route-matcher';
import type { FeedStatus, LngLat, VehicleObservation } from '../shared/types';
import type { Env } from './env';
import { CloudStore } from './store';

async function asset<T>(env: Env, name: string): Promise<T> {
  const response = await env.ASSETS.fetch(`https://assets.internal/data/${name}`);
  if (!response.ok) throw Error('Bundled network unavailable');
  return response.json() as Promise<T>;
}

export async function pollFeeds(env: Env) {
  const store = new CloudStore(env.DB);
  async function update(id: FeedStatus['id'], label: string, fetcher?: () => Promise<{items: {id:string}[]; routes?: Record<string, LngLat[]>}>) {
    if (!fetcher) return;
    const lastAttempt = new Date().toISOString();
    try {
      const {items, routes} = await fetcher();
      // A partial rail response can repeat a service across station boards.
      const unique = [...new Map(items.map(item => [item.id, item])).values()];
      const health: FeedStatus = {id,label,intervalMs:60000,state:'live',lastAttempt,lastSuccess:new Date().toISOString(),count:unique.length,
        message:unique.length?'Connected; refreshed every minute':'Connected; no current observations in this area'};
      await store.saveFeed(id, unique, health, routes);
    } catch {
      const previous = await store.state<FeedStatus>(id);
      await store.stateStatement(id, {id,label,intervalMs:60000,count:previous?.count??0,lastAttempt,lastSuccess:previous?.lastSuccess,
        state:previous?.lastSuccess?'stale':'unavailable',message:'Provider update failed; check credentials and Cloudflare execution limits'}).run();
    }
  }
  // Sequential provider groups keep concurrent outbound connections bounded.
  await update('buses','Buses',env.BODS_API_KEY ? async () => {
    const [rows, network] = await Promise.all([fetchBuses(env.BODS_API_KEY!), asset<BusNetwork>(env,'bus-network.json')]);
    const routes: Record<string, LngLat[]> = {};
    const items = rows.map(row => {
      const match = matchBusRoute(row,network);
      if (match.route && match.observation.tripId) routes[match.observation.tripId] = match.route;
      return match.observation;
    });
    return {items,routes};
  } : undefined);
  await update('trains','Trains',env.DARWIN_TOKEN ? async () => {
    const geo = await asset<{features: unknown[]}>(env,'railways.json');
    const rail = new RailNetwork(geo.features);
    const items = new Map<string,VehicleObservation>();
    const routes: Record<string,LngLat[]> = {};
    let successes = 0;
    for (const station of Object.keys(STATIONS)) {
      try {
        const result = estimateBoard(await fetchRailBoard(env.DARWIN_TOKEN!,station),station,rail);
        successes++;
        for (const observation of result.observations) {
          const previous = items.get(observation.id);
          if (!previous || Date.parse(observation.observedAt)>Date.parse(previous.observedAt) ||
              (observation.observedAt===previous.observedAt && observation.cancelled)) items.set(observation.id,observation);
        }
        Object.assign(routes,result.routes);
      } catch { /* Preserve usable station boards when another station fails. */ }
    }
    if (!successes) throw Error('Rail unavailable');
    return {items:[...items.values()],routes};
  } : undefined);
  await update('traffic','Road traffic',env.TRAFFIC_FEED_URL ? async () => ({items:await fetchTraffic(env.TRAFFIC_FEED_URL!,env.TRAFFIC_FEED_TOKEN)}) : undefined);
  await env.DB.prepare('DELETE FROM sns_messages WHERE received_at < ?').bind(Date.now()-7*86400000).run();
}
