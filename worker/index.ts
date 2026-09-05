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
    ['trains','Trains',env.DARWIN_TOKEN,'OpenLDBWS SOAP token required; positions are estimates'],
    ['traffic','Road traffic',env.TRAFFIC_FEED_URL,'No verified traffic feed configured'],
  ] as const;
  const feeds: FeedStatus[] = [];
  for (const [id,label,configured,message] of definitions) {
    const saved = configured ? await store.state<FeedStatus>(id) : undefined;
    const health: FeedStatus = saved ?? {id,label,state:configured?'connecting':'unavailable',message:configured?'Waiting for first scheduled update':message,count:0,intervalMs:60000};
    if (health.lastSuccess && Date.now()-Date.parse(health.lastSuccess)>120000) {
      health.state='stale'; health.message='Scheduled updates delayed';
    }
    if (health.lastSuccess && Date.now()-Date.parse(health.lastSuccess)>300000) health.count=0;
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
      await store.accept(message.MessageId,event??undefined);
    }
    return json({accepted:true});
  }catch{return json({error:'Invalid or unverified Street Manager message'},400);}
}

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
      if(path==='/api/v1/health')return json(snapshot(await feedHealth(store,env)));
      if(path==='/api/v1/road-events')return json(snapshot(await store.active()));
      if(path==='/api/v1/traffic')return json(snapshot(env.TRAFFIC_FEED_URL?(await store.items<TrafficSegment>('traffic')).filter(fresh):[]));
      if(path==='/api/v1/vehicles') {
        const buses=env.BODS_API_KEY?await store.items<VehicleObservation>('buses'):[];
        const trains=env.DARWIN_TOKEN?await store.items<VehicleObservation>('trains'):[];
        return json(snapshot([...buses,...trains].filter(fresh)));
      }
      if(path==='/api/v1/vehicle-routes') {
        const routes: Record<string,LngLat[]>={};
        for(const feed of ['buses','trains'] as const) {
          if(!(feed==='buses'?env.BODS_API_KEY:env.DARWIN_TOKEN))continue;
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
    await pollFeeds(env);
  },
};
