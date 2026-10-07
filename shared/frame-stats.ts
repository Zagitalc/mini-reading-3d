export type FrameStats={frames:number;seconds:number;medianMs:number;p95Ms:number;worstMs:number;slowShare:number;fps:number};
const SLOW_MS=33;
const at=(sorted:number[],q:number)=>sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];
/** Summary of the gaps between frames, in milliseconds. A "slow" frame is one that took longer than two 60 Hz frames. */
export function summariseFrames(gaps:number[]):FrameStats|undefined{
 const g=gaps.filter(x=>Number.isFinite(x)&&x>0);if(g.length<10)return undefined;
 const sorted=[...g].sort((a,b)=>a-b),total=g.reduce((a,b)=>a+b,0);
 return {frames:g.length,seconds:total/1000,medianMs:at(sorted,.5),p95Ms:at(sorted,.95),worstMs:sorted.at(-1)!,slowShare:g.filter(x=>x>SLOW_MS).length/g.length,fps:g.length*1000/total};
}
export type Verdict='smooth'|'acceptable'|'struggling';
/** Judged on the 95th percentile, not the average: a few long frames are what a person actually notices. */
export const verdict=(s:FrameStats):Verdict=>s.p95Ms<=20?'smooth':s.p95Ms<=34?'acceptable':'struggling';
export const verdictText:Record<Verdict,string>={smooth:'Smooth: nearly every frame came in under 20 ms.',acceptable:'Acceptable: some frames were slow but most kept up.',struggling:'Struggling: one frame in twenty took more than 34 ms, so movement will look jerky.'};
