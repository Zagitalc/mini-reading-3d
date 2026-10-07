import type {ModeId} from './modes';
// Per-mode emphasis for the base map: each mode nudges a few base colours towards the page ("ground") or towards the
// ink colour, so the layers that mode is about stand out and the rest recede. Everything is relative to the light or
// dark palette, so both themes keep their own character; a mode that needs no help leaves the palette alone.
export type ColourKey='urban'|'farm'|'green'|'water'|'casing'|'path'|'road'|'railBed'|'rail'|'footprint'|'blocks'|'label';
/** Where a colour moves to: the palette's own ground, the theme's ink, or a fixed colour per theme. */
export type Target='ground'|'ink'|{light:string;dark:string};
export interface Emphasis {
 /** How far each colour moves towards its target, 0 (not at all) to 1 (all the way). */
 mix:Partial<Record<ColourKey,{to:Target;t:number}>>;
 /** Multiplier on the rail line and rail bed widths. */
 rail:number;
}
export const INK={light:'#26302c',dark:'#dfe6e2'} as const;
const recede=(t:number)=>({to:'ground' as const,t}),stronger=(t:number)=>({to:'ink' as const,t});
export const EMPHASIS:Record<ModeId,Emphasis>={
 explore:{mix:{},rail:1},
 // Rail is the subject: darker, wider; the road casing softens so bus routes drawn over the roads read clearly.
 transport:{mix:{rail:stronger(.55),railBed:stronger(.25),casing:recede(.4)},rail:1.8},
 // Roads are the subject; the railway steps back.
 drive:{mix:{casing:stronger(.3),label:stronger(.4),rail:recede(.5),railBed:recede(.5)},rail:1},
 // Water and green space are the subject; roads, buildings and rail recede.
 environment:{mix:{water:{to:{light:'#5fa8c4',dark:'#2f7a98'},t:.65},green:{to:{light:'#6fae7e',dark:'#2d5a3e'},t:.4},
  road:recede(.35),casing:recede(.4),footprint:recede(.3),blocks:recede(.3),rail:recede(.4),railBed:recede(.4)},rail:1},
 // Food points are small, so buildings and rail step back and street names get stronger.
 eat:{mix:{footprint:recede(.3),blocks:recede(.25),label:stronger(.35),rail:recede(.4),railBed:recede(.4)},rail:1},
 lab:{mix:{},rail:1},
};
const channels=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
/** Linear mix of two #rrggbb colours: 0 gives `from`, 1 gives `to`. */
export function mixHex(from:string,to:string,t:number){
 const a=channels(from),b=channels(to);
 return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
export const resolveTarget=(to:Target,ground:string,dark:boolean)=>to==='ground'?ground:to==='ink'?INK[dark?'dark':'light']:to[dark?'dark':'light'];
