import type { RoadEvent } from './types';
const londonDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
export function eventIsVisible(event:RoadEvent,now=Date.now()){
 if(event.status==='cancelled'||event.status==='completed')return false;
 // A confirmed start overrides the original schedule, including works that start early.
 if(event.actualStart){if(!Number.isFinite(Date.parse(event.actualStart))||Date.parse(event.actualStart)>now)return false;}
 else if(event.status!=='active'){
  const start=event.plannedStart;
  if(!start||!Number.isFinite(Date.parse(start)))return false;
  // Date-only permits begin on their London calendar date, not at UTC midnight.
  if(/^\d{4}-\d{2}-\d{2}$/.test(start)?start>londonDay.format(now):Date.parse(start)>now)return false;
 }
 const end=event.actualEnd||event.plannedEnd;return !end||Date.parse(end)>=now;
}
export function eventDuration(event:RoadEvent){const start=event.actualStart||event.plannedStart,end=event.actualEnd||event.plannedEnd;if(!start||!end)return null;const ms=Date.parse(end)-Date.parse(start);return Number.isFinite(ms)&&ms>=0?ms:null;}
export function formatDate(value?:string,dateOnly=false){if(!value)return 'Unknown';const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'Unknown';return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',year:'numeric',...(!dateOnly?{hour:'2-digit',minute:'2-digit'} as const:{})}).format(d);}
