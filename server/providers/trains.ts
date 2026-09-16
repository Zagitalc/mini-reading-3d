import{XMLParser}from'fast-xml-parser';import{alongLine,bearing,lineLength}from'../../shared/geo';import type{VehicleObservation,LngLat}from'../../shared/types';import{RailNetwork,STATIONS}from'../rail-network';
const arr=(v:any)=>v==null?[]:Array.isArray(v)?v:[v];const xml=(s:string)=>s.replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]!));
export type RailCredentials = {rdmKey?:string;soapToken?:string};
const RDM_ENDPOINT='https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepBoardWithDetails/';

// Normalize public JSON arrays to the internal board shape used by the SOAP adapter.
export function parseRdmBoard(value:unknown,station:string){
 const b=value as any;
 if(!b||typeof b!=='object'||b.crs!==station||typeof b.generatedAt!=='string'||!Number.isFinite(Date.parse(b.generatedAt))||
   (b.trainServices!=null&&!Array.isArray(b.trainServices)))throw Error('Rail provider returned an unrecognised response');
 const callingPoints=(groups:any)=>({callingPointList:arr(groups).filter(g=>g&&g.assocIsCancelled!==true&&g.serviceChangeRequired!==true&&(!g.serviceType||g.serviceType==='train')).map(g=>({callingPoint:arr(g.callingPoint).filter(c=>c&&c.isCancelled!==true)}))});
 return {...b,trainServices:{service:arr(b.trainServices).filter(s=>s&&(!s.serviceType||s.serviceType==='train')).map(s=>({...s,
   destination:{location:arr(s.destination)},previousCallingPoints:callingPoints(s.previousCallingPoints),subsequentCallingPoints:callingPoints(s.subsequentCallingPoints)}))}};
}

export async function fetchRailBoard(credentials:RailCredentials|string,station:string){
 if(!/^[A-Z]{3}$/.test(station))throw Error('Invalid rail station');
 const auth=typeof credentials==='string'?{soapToken:credentials}:credentials;
 if(!auth.rdmKey){if(!auth.soapToken)throw Error('Rail credentials unavailable');return fetchSoapBoard(auth.soapToken,station);}
 // Include just-departed trains; the detailed board avoids per-service API requests.
 const url=new URL(RDM_ENDPOINT+station);url.search=new URLSearchParams({numRows:'10',timeOffset:'-5',timeWindow:'120'}).toString();
 const response=await fetch(url,{headers:{'x-apikey':auth.rdmKey,Accept:'application/json','User-Agent':'MiniReading3D/1.0 (+https://github.com/Zagitalc/mini-reading-3d)'},redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error(`Rail provider returned HTTP ${response.status}`);
 let board:unknown;try{board=await response.json();}catch{throw Error('Rail provider returned an unrecognised response');}
 return parseRdmBoard(board,station);
}

export async function fetchRailSnapshot(credentials:RailCredentials,network:RailNetwork,now=Date.now()){
 const items=new Map<string,VehicleObservation>(),routes:Record<string,LngLat[]>={};
 let successes=0,lastError:unknown;
 for(const station of Object.keys(STATIONS)){
  try{
   const data=estimateBoard(await fetchRailBoard(credentials,station),station,network,now);successes++;
   for(const observation of data.observations){const previous=items.get(observation.id);
    if(!previous||Date.parse(observation.observedAt)>Date.parse(previous.observedAt)||(observation.observedAt===previous.observedAt&&observation.cancelled))items.set(observation.id,observation);
   }
   Object.assign(routes,data.routes);
  }catch(error){
   // Authentication/quota apply to the key, not the station: don't repeat failed calls eleven times.
   if(error instanceof Error&&/^Rail provider returned HTTP (401|403|429)$/.test(error.message))throw error;
   lastError=error;
  }
 }
 if(!successes)throw lastError??Error('Rail unavailable');
 return {items:[...items.values()],routes};
}

// Resolve HH:mm around a dated observation in London, including midnight and BST.
export function railTime(time:string,reference:number):number|null{if(!/^\d\d:\d\d$/.test(time))return null;const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(reference));const p=Object.fromEntries(parts.map(p=>[p.type,p.value]));const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute),offset=wall-Math.floor(reference/60000)*60000;const [h,m]=time.split(':').map(Number);let result=Date.UTC(+p.year,+p.month-1,+p.day,h,m)-offset;while(result-reference>43200000)result-=86400000;while(result-reference< -43200000)result+=86400000;return result;}
export function parseBoard(xmlText:string){const parsed=new XMLParser({removeNSPrefix:true,parseTagValue:false}).parse(xmlText);const body=parsed.Envelope?.Body;if(body?.Fault)throw Error('National Rail rejected the request');const response=body?.GetArrDepBoardWithDetailsResponse?.GetStationBoardResult;if(!response)throw Error('Unrecognised National Rail board');return response;}
export function estimateBoard(board:any,station:string,network:RailNetwork,now=Date.now()):{observations:VehicleObservation[];routes:Record<string,LngLat[]>}{const observations:VehicleObservation[]=[],routes:Record<string,LngLat[]>={};const observedAt=board.generatedAt;if(!observedAt||!Number.isFinite(Date.parse(observedAt)))return{observations,routes};for(const s of arr(board.trainServices?.service)){const id=String(s.serviceID??'');if(!id)continue;const cancelled=s.isCancelled===true||s.isCancelled==='true';if(cancelled){observations.push({id:`darwin:${id}`,kind:'train',position:STATIONS[station],observedAt,status:'estimated',cancelled:true,label:'Train',source:'National Rail Darwin'});continue;}
 const arrival=railTime(String(s.ata??(s.eta==='On time'?s.sta:s.eta)??s.sta??''),now),departure=railTime(String(s.atd??(s.etd==='On time'?s.std:s.etd)??s.std??''),now);
 if(arrival!==null&&departure!==null&&arrival<=now&&now<=departure){observations.push({id:`darwin:${id}`,kind:'train',position:STATIONS[station],observedAt,status:'estimated',stopUntil:new Date(departure).toISOString(),label:String(s.operator??'Train'),source:'National Rail Darwin'});continue;}
 const calls=[...arr(s.previousCallingPoints?.callingPointList).flatMap(l=>arr(l.callingPoint)),{crs:station,st:s.std??s.sta,et:s.etd??s.eta,at:s.atd??s.ata},...arr(s.subsequentCallingPoints?.callingPointList).flatMap(l=>arr(l.callingPoint))];
 const timed=calls.map(c=>({crs:String(c.crs),time:railTime(String(c.at&&c.at!=='On time'?c.at:c.et&&c.et!=='On time'?c.et:c.st??''),Date.parse(observedAt))})).filter(c=>c.time!==null);
 let placed=false;for(let i=1;i<timed.length;i++){const a=timed[i-1],b=timed[i];if(!STATIONS[a.crs]||!STATIONS[b.crs]||a.time!>now||b.time!<now||b.time!<=a.time!)continue;const route=network.route(a.crs,b.crs);if(!route)continue;const len=lineLength(route),t=(now-a.time!)/(b.time!-a.time!),position=alongLine(route,t*len);routes[id]=route;observations.push({id:`darwin:${id}`,kind:'train',position,observedAt,status:'estimated',tripId:id,bearing:bearing(position,alongLine(route,Math.min(len,t*len+5))),speed:len/((b.time!-a.time!)/1000),label:String(s.operator??'Train'),destination:String(arr(s.destination?.location)[0]?.locationName??''),source:'National Rail Darwin',sourceUrl:'https://www.nationalrail.co.uk/developers/darwin-data-feeds/'});placed=true;break;}
 if(!placed&&STATIONS[station]){const eta=railTime(String(s.ata??(s.eta==='On time'?s.sta:s.eta)??s.sta??''),now),etd=railTime(String(s.atd??(s.etd==='On time'?s.std:s.etd)??s.std??''),now);if(eta!==null&&etd!==null&&eta<=now&&now<=etd)observations.push({id:`darwin:${id}`,kind:'train',position:STATIONS[station],observedAt,status:'estimated',stopUntil:new Date(etd).toISOString(),label:String(s.operator??'Train'),source:'National Rail Darwin'});}
 }return{observations,routes};}
async function fetchSoapBoard(token:string,station:string){const soap=`<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2021-11-01/ldb/"><soap:Header><typ:AccessToken><typ:TokenValue>${xml(token)}</typ:TokenValue></typ:AccessToken></soap:Header><soap:Body><ldb:GetArrDepBoardWithDetailsRequest><ldb:numRows>10</ldb:numRows><ldb:crs>${station}</ldb:crs><ldb:timeOffset>0</ldb:timeOffset><ldb:timeWindow>120</ldb:timeWindow></ldb:GetArrDepBoardWithDetailsRequest></soap:Body></soap:Envelope>`;const r=await fetch('https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb12.asmx',{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'http://thalesgroup.com/RTTI/2015-05-14/ldb/GetArrDepBoardWithDetails'},body:soap,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`Rail provider returned HTTP ${r.status}`);return parseBoard(await r.text());}
