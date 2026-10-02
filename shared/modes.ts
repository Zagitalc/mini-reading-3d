// Map modes: each one is a set of default layer switches. The switches stay in the panel, so a viewer
// can still change any layer after picking a mode. Weather is left out on purpose: it is context for
// every mode, so its switch keeps whatever the viewer chose.
export const MODE_LAYERS=['buildings','buses','trains','stops','roadworks','traffic','signs','cameras','fuel','rivers','hygiene'] as const;
export type ModeLayer=typeof MODE_LAYERS[number];
export const MODE_IDS=['explore','transport','drive','environment','eat','lab'] as const;
export type ModeId=typeof MODE_IDS[number];
export type Mode={id:ModeId;icon:string;label:string;summary:string;layers:Record<ModeLayer,boolean>};
const only=(...on:ModeLayer[])=>Object.fromEntries(MODE_LAYERS.map(l=>[l,on.includes(l)])) as Record<ModeLayer,boolean>;
export const MODES:Record<ModeId,Mode>={
 explore:{id:'explore',icon:'◇',label:'Explore',summary:'The 3D town and its landmarks, without live traffic or vehicles.',layers:only('buildings')},
 transport:{id:'transport',icon:'▰',label:'Transport',summary:'Live buses and trains, bus stops with departures, and roadworks.',layers:only('buildings','buses','trains','stops','roadworks')},
 drive:{id:'drive',icon:'≋',label:'Drive',summary:'Traffic, roadworks, speed limits, cameras and fuel prices.',layers:only('buildings','traffic','roadworks','signs','cameras','fuel')},
 environment:{id:'environment',icon:'≈',label:'Environment',summary:'Thames and Kennet levels and flood warnings.',layers:only('buildings','rivers')},
 // "eat" internally, so links shared before the rename still open it; "food" is accepted too.
 eat:{id:'eat',icon:'✚',label:'Food',summary:'Restaurants, cafés, takeaways and pubs with their food hygiene ratings. Ratings only: no opening hours, and premises without a mapped location are not shown.',layers:only('buildings','hygiene')},
 // "lab" internally, so future experimental layers have somewhere to live without reaching ordinary visitors.
 lab:{id:'lab',icon:'✱',label:'Everything',summary:'Every layer the other modes use, all at once. This uses more data and more of the shared feeds.',layers:only(...MODE_LAYERS)},
};
/** Transport is the default because bus history in Reading over time is recorded only while someone has buses on. */
export const DEFAULT_MODE:ModeId='transport';
/** Accepts a mode id from the address bar or storage; anything else gives undefined. "everything" is an alias for lab, "food" for eat. */
export function parseMode(value:string|null|undefined):ModeId|undefined{
 const v=value?.trim().toLowerCase();if(!v)return undefined;if(v==='everything')return 'lab';if(v==='food')return 'eat';
 return (MODE_IDS as readonly string[]).includes(v)?v as ModeId:undefined;
}
/** The address wins over the remembered mode, so a shared link opens in the view it was shared from. */
export function initialMode(search:string,remembered:string|null|undefined):ModeId{
 return parseMode(new URLSearchParams(search).get('mode'))??parseMode(remembered)??DEFAULT_MODE;
}
/** Vehicle positions are worth requesting only while a layer shows them or something else asked for them. */
export const wantsVehicles=(layers:Pick<Record<ModeLayer,boolean>,'buses'|'trains'>,otherDemand:boolean)=>layers.buses||layers.trains||otherDemand;
