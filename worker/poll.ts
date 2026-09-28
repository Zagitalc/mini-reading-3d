import {CADENCE,due} from '../shared/feed-policy';
import {feedFailureReason} from '../shared/feed-errors';
import {fetchWeather} from '../server/providers/weather';
import {fetchFuel} from '../server/providers/fuel';
import {fetchRivers} from '../server/providers/rivers';
import { fetchBuses } from '../server/providers/buses';
import { fetchRailSnapshot } from '../server/providers/trains';
import { fetchTraffic } from '../server/providers/traffic';
import { RailNetwork } from '../server/rail-network';
import { matchBusRoute, type BusNetwork } from '../server/route-matcher';
import type { FeedStatus, LngLat, RiverFeedItem, VehicleObservation } from '../shared/types';
import type { Env } from './env';
import { CloudStore } from './store';

const assets=new Map<string,unknown>();
async function asset<T>(env: Env, name: string): Promise<T> {
  if(assets.has(name))return assets.get(name) as T;
  const response = await env.ASSETS.fetch(`https://assets.internal/data/${name}`);
  if (!response.ok) throw Error('Bundled network unavailable');
  const data=await response.json();assets.set(name,data);return data as T;
}

export async function pollFeeds(env: Env, feeds:FeedStatus['id'][]=['buses','trains','traffic','weather','fuel','rivers']) {
  const store = new CloudStore(env.DB);
  async function update(id: FeedStatus['id'], label: string, fetcher?: () => Promise<{items: {id:string}[]; routes?: Record<string, LngLat[]>; states?: Record<string, unknown>}>) {
    if (!fetcher || !feeds.includes(id)) return;
    const previous=await store.state<FeedStatus>(id);
    const intervalMs=CADENCE[id];
    if(!due(previous?.lastAttempt,intervalMs,previous?.failures))return;
    // Atomic lease prevents overlapping cron invocations from calling a provider twice.
    const now=Date.now();
    const lease=await env.DB.prepare("INSERT INTO state VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE CAST(state.body AS INTEGER)<=? RETURNING body")
      .bind(`poll-lease:${id}`,String(now+intervalMs),now).first();
    if(!lease)return;
    const lastAttempt = new Date().toISOString();
    // Slow feeds note the attempt before calling the provider: a run cut short (for example by the
    // CPU limit) then shows on /health instead of leaving the last success looking like the last try.
    if(intervalMs>=900_000)await store.stateStatement(id,{...(previous??{count:0,state:'connecting'}),id,label,intervalMs,lastAttempt,
      message:'Refresh started; no result saved yet'}).run();
    try {
      const {items, routes, states} = await fetcher();
      // A partial rail response can repeat a service across station boards.
      const unique = [...new Map(items.map(item => [item.id, item])).values()];
      const health: FeedStatus = {id,label,intervalMs,state:'live',lastAttempt,lastSuccess:new Date().toISOString(),count:unique.length,
        message:unique.length?(id==='buses'?'Connected; shared refresh at most once per minute while the map is open':`Connected; refresh interval ${intervalMs/60000} minutes`):'Connected; no current observations in this area'};
      await store.saveFeed(id, unique, health, routes, states);
    } catch (error) {
      const reason=feedFailureReason(error);
      console.warn('Feed update failed', {feed:id,reason});
      await store.stateStatement(id, {id,label,intervalMs,count:previous?.count??0,failures:(previous?.failures??0)+1,lastAttempt,lastSuccess:previous?.lastSuccess,
        state:previous?.lastSuccess?'stale':'unavailable',message:reason}).run();
    }
  }
  // Sequential provider groups keep concurrent outbound connections bounded.
  // Fuel runs first: it is due only every six hours, so it must not be the step a long run loses.
  // With the GitHub refresh configured, the cron only steps in once uploads have stopped for 13 hours.
  const uploaded=env.FUEL_INGEST_TOKEN&&feeds.includes('fuel')?await store.state<FeedStatus>('fuel'):undefined;
  const uploadRecent=!!uploaded?.lastSuccess&&Date.now()-Date.parse(uploaded.lastSuccess)<13*3_600_000;
  await update('fuel','Fuel prices (snapshot)',env.FUEL_ENABLED==='true'&&!uploadRecent?async()=>({items:await fetchFuel()}):undefined);
  await update('buses','Buses',env.BODS_API_KEY ? async () => {
    const rows=await fetchBuses(env.BODS_API_KEY!);
    const previous=new Map((await store.items<VehicleObservation>('buses')).map(o=>[o.id,o]));
    // Preserve actual observations BEFORE optional geometry work. Asset/matching failures
    // (including Worker CPU termination) must not prevent the next map read seeing buses.
    const time=new Date().toISOString();
    await store.saveFeed('buses',rows,{id:'buses',label:'Buses',intervalMs:CADENCE.buses,state:'live',lastAttempt:time,lastSuccess:time,count:rows.length,message:'GPS observations available; route matching pending'});
    let network:BusNetwork;
    try{network=await asset<BusNetwork>(env,'bus-network.json');}catch{return {items:rows};}
    const routes: Record<string, LngLat[]> = {};
    const items = rows.map(row => {
      let match;try{match=matchBusRoute(row,network,previous.get(row.id));}catch{return row;}
      if (match.route && match.observation.tripId) routes[match.observation.tripId] = match.route;
      return match.observation;
    });
    return {items,routes};
  } : undefined);
  await update('trains','Trains',(env.RDM_API_KEY||env.DARWIN_TOKEN) ? async () => {
    const geo = await asset<{features: unknown[]}>(env,'railways.json');
    const rail = new RailNetwork(geo.features);
    const {items,routes,boards}=await fetchRailSnapshot({rdmKey:env.RDM_API_KEY,soapToken:env.DARWIN_TOKEN},rail);
    return {items,routes,states:Object.fromEntries(Object.entries(boards).map(([station,board])=>[`rail-board:${station}`,board]))};
  } : undefined);
  await update('traffic','Road traffic',!env.TOMTOM_API_KEY&&env.TRAFFIC_FEED_URL ? async () => ({items:await fetchTraffic(env.TRAFFIC_FEED_URL!,env.TRAFFIC_FEED_TOKEN)}) : undefined);
  await update('weather','Estimated weather',env.WEATHER_ENABLED==='true'?async()=>({items:await fetchWeather()}):undefined);
  // Previous outlines are reused, so a standing warning costs one polygon request in total.
  await update('rivers','River levels & flood warnings',env.RIVERS_ENABLED==='true'?async()=>({items:await fetchRivers(await store.items<RiverFeedItem>('rivers'))}):undefined);
  if(feeds.includes('fuel')&&new Date().getUTCHours()===0&&new Date().getUTCMinutes()===0)await env.DB.prepare('DELETE FROM sns_messages WHERE received_at < ?').bind(Date.now()-7*86400000).run();
}
