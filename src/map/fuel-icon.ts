// One locally drawn sprite shared by every station; no image/tile request.
const body='M6 4Q6 2 8 2H18Q20 2 20 4V27H22V30H3V27H5V4Z';
const hose='M20 11H22V22Q22 25 25 25Q28 25 28 22V12L23 6M25 8V13H28';
export function fuelPumpIcon():ImageData {
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 const ctx=canvas.getContext('2d')!;ctx.scale(2,2);
 ctx.lineCap='round';ctx.lineJoin='round';
 const pump=new Path2D(body),pipe=new Path2D(hose);
 ctx.strokeStyle='#fffdf5';ctx.lineWidth=5;ctx.stroke(pump);ctx.stroke(pipe);
 ctx.fillStyle='#e87519';ctx.fill(pump);ctx.strokeStyle='#e87519';ctx.lineWidth=2.5;ctx.stroke(pipe);
 ctx.fillStyle='#fffdf5';ctx.fillRect(8,6,9,7);
 ctx.fillRect(8,17,6,2);
 return ctx.getImageData(0,0,64,64);
}
export const fuelPumpLegend=`<svg aria-hidden="true" width="18" height="20" viewBox="0 0 32 32" style="vertical-align:middle;margin-right:6px"><path d="${body}" fill="#e87519"/><path d="${hose}" fill="none" stroke="#e87519" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 6h9v7H8z" fill="#fffdf5"/></svg>`;
