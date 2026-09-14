// Reads this app's cached endpoints only; never calls providers directly or prints keys.
const base=process.env.APP_URL??'http://127.0.0.1:8787';
const get=async path=>{const r=await fetch(new URL('/api/v1/'+path,base),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();};
const [health,usage,vehicles]=await Promise.all(['health','usage','vehicle-state'].map(get));
console.table(health.data.map(f=>({feed:f.id,status:f.state,items:f.count,intervalSeconds:f.intervalMs/1000,lastSuccess:f.lastSuccess??'none',message:f.message})));
console.log(JSON.stringify({traffic:{period:usage.period,requests:usage.trafficTileRequests,cap:usage.trafficTileLimit},vehicles:{visibleCandidates:vehicles.data.length,matchedBusLines:vehicles.data.filter(v=>v.kind==='bus'&&v.routeGroupId).length,geometryPaths:Object.keys(vehicles.routes).length},streetManager:usage.streetManager},null,2));
