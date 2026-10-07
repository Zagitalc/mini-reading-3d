import type {Map} from 'maplibre-gl';
import {detail,escape,toolSlot} from '../ui/shell';
import type {ReadingScene} from '../scene/layer';
import {summariseFrames,verdict,verdictText,type FrameStats} from '../../shared/frame-stats';
// The same camera as the desktop benchmark in docs/timetables-and-validation.md, so phone and desktop numbers compare.
const VIEW={center:[-.9718,51.4589] as [number,number],zoom:17,pitch:60,bearing:-24};
const TEST_SECONDS=10,SPIN_DEGREES_PER_SECOND=12;
const ms=(n:number)=>`${n.toFixed(1)} ms`;
function gpu(scene:ReadingScene){
 try{const gl=scene.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'hidden by the browser';}catch{return 'unknown';}
}
function device(map:Map,scene:ReadingScene){
 const nav=navigator as Navigator&{deviceMemory?:number},canvas=map.getCanvas();
 return [
  ['Screen',`${screen.width} × ${screen.height}, pixel ratio ${window.devicePixelRatio}`],
  ['Map canvas',`${canvas.width} × ${canvas.height} pixels (${(canvas.width*canvas.height/1e6).toFixed(1)} million)`],
  ['Processor cores',String(nav.hardwareConcurrency??'unknown')],
  ['Memory',nav.deviceMemory?`${nav.deviceMemory} GB or more (the browser rounds this)`:'not reported'],
  ['Graphics chip',gpu(scene)],
  ['Browser',navigator.userAgent.replace(/^Mozilla\/5\.0 /,'').slice(0,90)]
 ] as [string,string][];
}
function report(map:Map,scene:ReadingScene,stats:FrameStats){
 const lines=[`Mini Reading graphics test, ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC`,...device(map,scene).map(([k,v])=>`${k}: ${v}`),
  `Scene: ${scene.chunks.size} building chunks, ${scene.renderer.info.render.calls} draw calls, ${scene.renderer.info.memory.geometries} geometries`,
  `Result: ${verdict(stats)}`,`Frames: ${stats.frames} in ${stats.seconds.toFixed(1)} s (${stats.fps.toFixed(0)} per second)`,
  `Frame time: median ${ms(stats.medianMs)}, 95th percentile ${ms(stats.p95Ms)}, worst ${ms(stats.worstMs)}`,`Slow frames (over 33 ms): ${(stats.slowShare*100).toFixed(1)}%`];
 return lines.join('\n');
}
/** Tools > "Graphics test": ten seconds of spinning round the station, with the device and frame times written out so they can be sent back. */
export function connectGraphicsTest(map:Map,scene:ReadingScene){
 const section=document.createElement('section');section.className='route-control graphics-control';
 section.innerHTML='<button type="button" class="layer-row graphics-open"><span><i>◔</i>Graphics test<small>Frame rate on this device</small></span><span aria-hidden="true">↗</span></button>';
 toolSlot('graphics').append(section);
 let running=false,cancel=()=>{};
 const view=()=>document.querySelector<HTMLElement>('#graphics-view');
 const intro=()=>{const el=view();if(!el)return;
  el.innerHTML=`<p class="explorer-note">The map turns slowly for ${TEST_SECONDS} seconds above Reading station while the frame times are recorded. Close other apps first, and keep the screen on. It does not change any setting.</p><dl class="graphics-device">${device(map,scene).map(([k,v])=>`<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join('')}</dl><button type="button" class="status-button" id="graphics-run">Run the ${TEST_SECONDS}-second test</button><div id="graphics-result" aria-live="polite"></div>`;
  el.querySelector('#graphics-run')!.addEventListener('click',()=>void run());};
 const waitForChunks=async()=>{const until=performance.now()+8000;while(performance.now()<until&&(scene.pending.size||!scene.chunks.size))await new Promise(r=>setTimeout(r,200));};
 async function run(){
  if(running)return;running=true;
  const out=view()!.querySelector<HTMLElement>('#graphics-result')!,button=view()!.querySelector<HTMLButtonElement>('#graphics-run')!;button.disabled=true;
  const before={center:map.getCenter().toArray() as [number,number],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};
  out.innerHTML='<p>Moving to the station and loading buildings…</p>';
  map.jumpTo(VIEW);await waitForChunks();await new Promise(r=>setTimeout(r,1000));
  out.innerHTML=`<p>Recording… <span id="graphics-left">${TEST_SECONDS}</span> s left. Please leave the map alone.</p>`;
  const gaps:number[]=[];let last=0,start=0,frame=0,stopped=false;
  const finish=(aborted:boolean)=>{
   cancelAnimationFrame(frame);map.off('dragstart',abort);map.off('wheel',abort);running=false;cancel=()=>{};map.jumpTo(before);
   const open=view();if(!open)return;const result=open.querySelector<HTMLElement>('#graphics-result')!;open.querySelector<HTMLButtonElement>('#graphics-run')!.disabled=false;
   const stats=aborted?undefined:summariseFrames(gaps);
   if(!stats){result.innerHTML=`<p>${aborted?'The test was interrupted, so there is no result.':'Too few frames were drawn to measure. Is the tab in the background?'}</p>`;return;}
   const text=report(map,scene,stats);
   result.innerHTML=`<p class="graphics-verdict" data-verdict="${verdict(stats)}"><strong>${escape(verdictText[verdict(stats)])}</strong></p><dl class="graphics-device"><dt>Frames per second</dt><dd>${stats.fps.toFixed(0)}</dd><dt>Median frame</dt><dd>${ms(stats.medianMs)}</dd><dt>95th percentile</dt><dd>${ms(stats.p95Ms)}</dd><dt>Worst frame</dt><dd>${ms(stats.worstMs)}</dd><dt>Slow frames</dt><dd>${(stats.slowShare*100).toFixed(1)}%</dd></dl><p class="explorer-note">For comparison, the desktop benchmark gives a 16.7 ms median. A phone with a 120 Hz screen can legitimately show about 8 ms.</p><textarea class="graphics-report" readonly rows="9" aria-label="Test report">${escape(text)}</textarea><button type="button" class="status-button" id="graphics-copy">Copy the report</button>`;
   const area=result.querySelector<HTMLTextAreaElement>('textarea')!,copy=result.querySelector<HTMLButtonElement>('#graphics-copy')!;
   copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='Copied';}catch{area.select();copy.textContent='Select and copy the text above';}});
  };
  const abort=()=>{stopped=true;finish(true);};
  cancel=abort;map.on('dragstart',abort);map.on('wheel',abort);
  const step=(now:number)=>{
   if(stopped)return;if(!start)start=now;
   if(last)gaps.push(now-last);last=now;
   const elapsed=(now-start)/1000;map.jumpTo({bearing:VIEW.bearing+elapsed*SPIN_DEGREES_PER_SECOND});
   const left=view()?.querySelector('#graphics-left');if(left)left.textContent=String(Math.max(0,Math.ceil(TEST_SECONDS-elapsed)));
   if(elapsed>=TEST_SECONDS){finish(false);return;}frame=requestAnimationFrame(step);
  };
  frame=requestAnimationFrame(step);
 }
 section.querySelector('button')!.addEventListener('click',()=>{if(running)cancel();detail('<span class="pill">This device</span><h2>Graphics test</h2><div id="graphics-view"></div>');intro();});
}
