import {CADENCE} from '../shared/feed-policy';
import {TrafficTiles,trafficBudget,trafficPeriod} from '../server/providers/tomtom';
import type {Weather,FuelStation} from '../shared/types';
import type {CacheStorage as CFCacheStorage} from '@cloudflare/workers-types';
import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { FeedStatus, LngLat, TrafficSegment, VehicleObservation } from '../shared/types';
import { validateSns, confirmSns } from '../server/providers/sns';
import { parseStreetManager } from '../server/providers/roadworks';
import type { Env } from './env';
import { CloudStore } from './store';
import { pollFeeds } from './poll';

const json = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const snapshot = (data: unknown[]) => ({version:1,generatedAt:new Date().toISOString(),data});
const fresh = (item: {observedAt:string}) => {
  const age = Date.now()-Date.parse(item.observedAt);
  return Number.isFinite(age) && age>=-60000 && age<300000;
};

export async function feedHealth(store: CloudStore, env: Env): Promise<FeedStatus[]> {
  const definitions = [
    ['buses','Buses',env.BODS_API_KEY,'BODS registration required'],
    ['trains','Trains',env.RDM_API_KEY||env.DARWIN_TOKEN,'RDM API key required; train positions are estimates'],
    ['traffic','Road traffic',env.TOMTOM_API_KEY||env.TRAFFIC_FEED_URL,'No verified traffic feed configured'],
    ['weather','Estimated weather',env.WEATHER_ENABLED==='true','Weather disabled'],
    ['fuel','Fuel prices (snapshot)',env.FUEL_ENABLED==='true','Fuel prices disabled'],
  ] as const;
  const feeds: FeedStatus[] = [];
  for (const [id,label,configured,message] of definitions) {
    const saved = configured ? await store.state<FeedStatus>(id) : undefined;
    const health: FeedStatus = saved ?? {id,label,state:configured?'connecting':'unavailable',message:configured?(id==='buses'?'Waiting for first map refresh':'Waiting for first scheduled update'):message,count:0,intervalMs:CADENCE[id]};
    if (health.lastSuccess && Date.now()-Date.parse(health.lastSuccess)>CADENCE[id]*2) {
      health.state='stale'; if(!health.failures)health.message=id==='buses'?'No recent map-triggered bus refresh':'Scheduled updates delayed';
    }
    if (health.lastSuccess && Date.now()-Date.parse(health.lastSuccess)>(id==='weather'?3600000:id==='fuel'?48*3600000:300000)) health.count=0;
    if(id==='traffic'&&env.TOMTOM_API_KEY){health.state='connecting';health.message='Tiles load on demand; five-minute cache and monthly request cap';}
    feeds.push(health);
  }
  const road = await store.state<{confirmed:boolean;lastSuccess:string}>('roadworks');
  const enabled = env.STREET_MANAGER_ENABLED==='true';
  feeds.splice(2,0,{id:'roadworks',label:'Roadworks & closures',intervalMs:0,count:(await store.active()).length,
    state:enabled&&road?.confirmed?'live':road?'stale':'unavailable',lastSuccess:road?.lastSuccess,
    message:enabled&&road?.confirmed?'Subscription confirmed; coverage begins at subscription, delivery is not continuously monitored':'Street Manager subscription and public HTTPS receiver required'});
  return feeds;
}

async function ingest(request: Request, env: Env, store: CloudStore) {
  if (env.STREET_MANAGER_ENABLED!=='true') return json({error:'Receiver disabled'},503);
  // Bound actual streamed bytes as well as Content-Length before parsing untrusted JSON.
  const reader=request.body?.getReader();
  if (!reader) return json({error:'Missing SNS message'},400);
  const chunks: Uint8Array[]=[]; let size=0;
  for (;;) {
    const {done,value}=await reader.read(); if(done)break;
    size+=value.byteLength;
    if(size>1048576){await reader.cancel();return json({error:'Message too large'},413);}
    chunks.push(value);
  }
  try {
    const bytes=new Uint8Array(size); let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const message=JSON.parse(new TextDecoder().decode(bytes));
    await validateSns(message);
    if(await store.seen(message.MessageId))return json({duplicate:true});
    if(message.Type==='SubscriptionConfirmation'){
      await confirmSns(message);
      await store.accept(message.MessageId);
    }else{
      const event=parseStreetManager(JSON.parse(message.Message));
      // Verified but irrelevant nationwide deliveries need an ACK, not D1 writes.
      // There is no local side effect to deduplicate for these messages.
      if(!event)return json({accepted:true,ignored:true});
      await store.accept(message.MessageId,event);
    }
    return json({accepted:true});
  }catch{return json({error:'Invalid or unverified Street Manager message'},400);}
}

const tileServices=new WeakMap<object,TrafficTiles>();
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/api/')) return env.ASSETS.fetch(request as never) as unknown as Promise<Response>;
    const store=new CloudStore(env.DB);
    try {
      if(path==='/api/v1/ingest/street-manager') {
        if(request.method==='POST')return ingest(request,env,store);
        return json({error:'Use POST for signed Street Manager notifications'},405);
      }
      if(request.method!=='GET')return json({error:'Method not allowed'},405);
      if(path==='/api/v1/config')return json({tomtom:!!env.TOMTOM_API_KEY,trafficRefreshMs:CADENCE.traffic,weather:env.WEATHER_ENABLED==='true',fuel:env.FUEL_ENABLED==='true'});
      if(path.startsWith('/api/v1/traffic-tiles/')){
        const match=path.match(/^\/api\/v1\/traffic-tiles\/(\d+)\/(\d+)\/(\d+)$/);if(!match)return json({error:'Invalid tile'},404);
        let service=tileServices.get(env.DB);
        if(!service){const cache=(caches as unknown as CFCacheStorage).default;service=new TrafficTiles({match:async key=>(await cache.match(key)) as unknown as Response|undefined,put:async(key,response)=>cache.put(key,response as never)},async()=>!!await env.DB.prepare("INSERT INTO state VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=json_set(state.body,'$.count',json_extract(state.body,'$.count')+1) WHERE json_extract(state.body,'$.count')<? RETURNING body").bind('traffic-usage:'+trafficPeriod(),'{"count":1}',trafficBudget(env.TOMTOM_MONTHLY_TILE_LIMIT)).first());tileServices.set(env.DB,service);}
        return service.get(env.TOMTOM_API_KEY,Number(match[1]),Number(match[2]),Number(match[3]));
      }
      if(path==='/api/v1/weather')return json(snapshot(env.WEATHER_ENABLED==='true'?(await store.items<Weather>('weather')).filter(w=>Date.now()-Date.parse(w.observedAt)<3600000):[]));
      if(path==='/api/v1/fuel')return json(snapshot(env.FUEL_ENABLED==='true'?(await store.items<FuelStation>('fuel')).filter(f=>Date.now()-Date.parse(f.observedAt)<48*3600000):[]));
      if(path==='/api/v1/usage')return json({period:trafficPeriod(),trafficTileRequests:(await store.state<{count:number}>('traffic-usage:'+trafficPeriod()))?.count??0,trafficTileLimit:trafficBudget(env.TOMTOM_MONTHLY_TILE_LIMIT),providerIntervalsMs:CADENCE,busRefreshMode:'shared-on-demand',streetManager:'push only; no polling'});
      if(path==='/api/v1/health')return json(snapshot(await feedHealth(store,env)));
      if(path==='/api/v1/road-events')return json(snapshot(await store.active()));
      if(path==='/api/v1/traffic')return json(snapshot(env.TRAFFIC_FEED_URL?(await store.items<TrafficSegment>('traffic')).filter(fresh):[]));
      if(path==='/api/v1/vehicles'||path==='/api/v1/vehicle-state') {
        // BODS rejects some countries used by global cron execution. Fetch handlers
        // use London placement; the shared D1 lease keeps all viewers to one refresh.
        await pollFeeds(env,['buses']);
        const buses=env.BODS_API_KEY?await store.items<VehicleObservation>('buses'):[];
        const trains=(env.RDM_API_KEY||env.DARWIN_TOKEN)?await store.items<VehicleObservation>('trains'):[];
        const data=snapshot([...buses,...trains].filter(fresh));
        if(path==='/api/v1/vehicles')return json(data);
        const routes:Record<string,LngLat[]>={};
        for(const feed of ['buses','trains'] as const){if(!(feed==='buses'?env.BODS_API_KEY:(env.RDM_API_KEY||env.DARWIN_TOKEN)))continue;for(const row of await store.items<{id:string;route:LngLat[]}>(`${feed}:routes`))routes[row.id]=row.route;}
        return json({...data,routes});
      }
      if(path==='/api/v1/vehicle-routes') {
        const routes: Record<string,LngLat[]>={};
        for(const feed of ['buses','trains'] as const) {
          if(!(feed==='buses'?env.BODS_API_KEY:(env.RDM_API_KEY||env.DARWIN_TOKEN)))continue;
          const health=await store.state<FeedStatus>(feed);
          if(!health?.lastSuccess||Date.now()-Date.parse(health.lastSuccess)>300000)continue;
          for(const row of await store.items<{id:string;route:LngLat[]}>(`${feed}:routes`))routes[row.id]=row.route;
        }
        return json({version:1,routes});
      }
      return json({error:'Unknown API endpoint'},404);
    }catch{return json({error:'Data service unavailable'},503);}
  },
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await pollFeeds(env,['trains','traffic','weather','fuel']);
  },
};
