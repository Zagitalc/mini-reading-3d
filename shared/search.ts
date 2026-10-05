import type {ModeId} from './modes';
// One search box over everything the map already holds. Each layer answers for its own data; this file holds the
// shared rules: how text is compared, how well a result matches, and which groups come first in each mode.
export const SEARCH_GROUPS=['landmark','place','route','stop','food','fuel','river'] as const;
export type SearchGroup=typeof SEARCH_GROUPS[number];
export const GROUP_TITLES:Record<SearchGroup,string>={landmark:'Landmarks',place:'Places',route:'Bus routes and rail corridors',stop:'Bus stops',food:'Food premises',fuel:'Fuel forecourts',river:'River gauges'};
/** The current mode's own layers come first; the rest keep a common order. */
const LEADS:Record<ModeId,SearchGroup[]>={
 explore:['landmark','place'],transport:['route','stop'],drive:['fuel','place'],environment:['river','place'],eat:['food','place'],lab:[],
};
export function groupOrder(mode:ModeId):SearchGroup[] {const lead=LEADS[mode];return [...lead,...SEARCH_GROUPS.filter(g=>!lead.includes(g))];}
/** Lower case, accents and curly quotes folded, punctuation as spaces, so "St Mary’s" finds "St Mary's Butts". */
export function normalise(text:string){
 return text.normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[‘’`]/g,"'").toLowerCase().replace(/[^a-z0-9']+/g,' ').replace(/'/g,'').trim();
}
/** How well `fields` match a normalised query, best field first: 0 whole field, 1 field starts with it, 2 a word starts
 * with it, 3 somewhere inside, or -1 for no match. With several words, each must appear in some field, and the score is
 * the worst of them, so "oxford rd" ranks below "oxford" for "oxford". */
export function matchScore(query:string,fields:string[]):number {
 const q=normalise(query);if(!q)return -1;
 const texts=fields.map(normalise).filter(Boolean);if(!texts.length)return -1;
 const whole=texts.reduce((best,t)=>Math.min(best,t===q?0:t.startsWith(q)?1:(' '+t).includes(' '+q)?2:t.includes(q)?3:9),9);
 if(whole<9)return whole;
 const words=q.split(' ');if(words.length<2)return -1;
 let worst=0;
 for(const w of words){const s=texts.reduce((best,t)=>Math.min(best,(' '+t).includes(' '+w)?2:t.includes(w)?3:9),9);if(s===9)return -1;worst=Math.max(worst,s);}
 return worst;
}
export interface Ranked<T> {item:T;score:number;name:string}
/** Best matches first, then shorter names, then alphabetical; at most `limit`. */
export function rank<T>(items:readonly T[],query:string,fields:(item:T)=>string[],name:(item:T)=>string,limit:number):Ranked<T>[] {
 const out:Ranked<T>[]=[];
 for(const item of items){const score=matchScore(query,fields(item));if(score>=0)out.push({item,score,name:name(item)});}
 return out.sort((a,b)=>a.score-b.score||a.name.length-b.name.length||a.name.localeCompare(b.name,'en',{numeric:true})).slice(0,limit);
}
