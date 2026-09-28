// Locally drawn gauge markers, one per range state; distinct from the round bus-stop dots.
export const GAUGE_COLOUR={high:'#c5673f',normal:'#2f6f98',low:'#8fb0c4',unknown:'#5b7f96'} as const;
export function gaugeIcon(fill:string):ImageData {
 const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
 const ctx=canvas.getContext('2d')!;ctx.scale(2,2);
 ctx.beginPath();ctx.roundRect(2,2,20,20,5);ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#ffffff';ctx.stroke();
 ctx.strokeStyle='#ffffff';ctx.lineWidth=1.8;ctx.lineCap='round';
 for(const y of [9.5,15]){ctx.beginPath();ctx.moveTo(6,y);ctx.bezierCurveTo(8.5,y-2.5,9.5,y-2.5,12,y);ctx.bezierCurveTo(14.5,y+2.5,15.5,y+2.5,18,y);ctx.stroke();}
 return ctx.getImageData(0,0,48,48);
}
