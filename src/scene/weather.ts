import * as T from 'three';
import type {Weather} from '../../shared/types';
import {toLocal} from '../../shared/geo';
import type {ReadingScene} from './layer';
import {CLOUD_SLOTS,PUFFS_PER_CLOUD,MAX_DROPS,viewScale,cloudPuffs,downwind,rainRate,dropCount,sightlineScale,rainCells} from './weather-layout';
const CLEAR=new T.Color('#fbfcfc'),RAINY=new T.Color('#aeb7bd'),NIGHT=new T.Color('#56606a');
// Soft round puff, so overlapping instances read as cloud rather than as spheres.
function puffTexture(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!,r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.55,'rgba(255,255,255,.75)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
export class WeatherEffects {
 group=new T.Group();enabled=true;weather?:Weather;last=0;cloud=0;rain=0;fall=0;offset:[number,number]=[0,0];centre?:[number,number];
 texture=puffTexture();
 clouds=new T.InstancedMesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:CLEAR.clone(),map:this.texture,transparent:true,opacity:.62,depthWrite:false}),CLOUD_SLOTS*PUFFS_PER_CLOUD);
 shadows=new T.InstancedMesh(this.clouds.geometry,new T.MeshBasicMaterial({color:'#1f2c36',map:this.texture,transparent:true,opacity:.1,depthWrite:false}),CLOUD_SLOTS*PUFFS_PER_CLOUD);
 geometry=new T.BufferGeometry();positions=new Float32Array(MAX_DROPS*6);drops:T.LineSegments;dummy=new T.Object3D();
 reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private scene:ReadingScene){
  for(const m of [this.clouds,this.shadows]){m.frustumCulled=false;m.count=0;}this.shadows.renderOrder=1;this.clouds.renderOrder=3;this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));this.geometry.setDrawRange(0,0);
  this.drops=new T.LineSegments(this.geometry,new T.LineBasicMaterial({color:'#5f7f96',transparent:true,opacity:.65,depthWrite:false}));this.drops.frustumCulled=false;this.drops.renderOrder=2;this.group.add(this.shadows,this.drops,this.clouds);scene.extras.add(this.group);
 }
 // The first reading is shown at once; later readings ease in so clouds do not pop every fifteen minutes.
 set(weather?:Weather){if(weather&&!this.weather){this.cloud=weather.cloudCover/100;this.rain=rainRate(weather.snowCm>0?weather.snowCm*10:weather.rainMm,weather.intervalSeconds);}this.weather=weather;this.scene.map.triggerRepaint();}
 update(now=performance.now()) {
  const w=this.weather,valid=w&&Date.now()-Date.parse(w.observedAt)<3600000;
  this.group.visible=!!valid&&this.enabled;
  if(!this.group.visible){this.scene.sun.intensity=2;this.scene.ambient.intensity=1.6;this.last=0;return false;}
  const dt=this.last?Math.min(.25,(now-this.last)/1000):0;this.last=now;
  const map=this.scene.map,canvas=map.getCanvas(),c=map.getCenter(),scale=viewScale(map.getZoom(),c.lat,canvas.clientWidth,canvas.clientHeight);
  const snow=w!.snowCm>0,targetRain=rainRate(snow?w!.snowCm*10:w!.rainMm,w!.intervalSeconds),animate=!this.reduced.matches&&!document.hidden;
  if(!animate){this.cloud=w!.cloudCover/100;this.rain=targetRain;}
  this.cloud+=(w!.cloudCover/100-this.cloud)*Math.min(1,dt*2);this.rain+=(targetRain-this.rain)*Math.min(1,dt*2);if(targetRain===0&&this.rain<.05)this.rain=0;
  this.scene.sun.intensity=(w!.isDay?2:.25)*(1-this.cloud*.7);this.scene.ambient.intensity=w!.isDay?1.6:1.0;
  // Clouds stay fixed to the ground while panning and drift with the reported wind; zooming rescales the field around the view centre.
  const centre=toLocal(c.toArray()) as [number,number];
  if(this.centre){this.offset[0]+=(centre[0]-this.centre[0])/scale.field;this.offset[1]+=(centre[1]-this.centre[1])/scale.field;}
  this.centre=centre;
  if(animate){const [dx,dy]=downwind(w!.windDirection),speed=Math.min(w!.windKph/3.6,20)*.0012*dt;this.offset[0]-=dx*speed;this.offset[1]-=dy*speed;this.fall+=dt;}
  this.offset=[this.offset[0]-Math.floor(this.offset[0]),this.offset[1]-Math.floor(this.offset[1])];
  const puffs=cloudPuffs(Math.round(this.cloud*100)/100,this.offset,centre,scale);
  (this.clouds.material as T.MeshBasicMaterial).color.copy(CLEAR).lerp(RAINY,Math.min(1,this.rain/4)).lerp(NIGHT,w!.isDay?0:.8);
  // Daytime shadows are cast away from the scene's sun, which sits to the south-west.
  const sun=this.scene.sun.position,sx=-sun.x/sun.z,sy=-sun.y/sun.z;
  const bearing=map.getBearing(),pitch=map.getPitch();
  puffs.forEach((p,i)=>{const k=sightlineScale(p,centre,bearing,pitch,scale.u);this.dummy.position.set(p.x,p.y,p.z);this.dummy.scale.set(p.radius*1.8*k,p.radius*1.4*k,1);this.dummy.updateMatrix();this.clouds.setMatrixAt(i,this.dummy.matrix);this.dummy.position.set(p.x+sx*p.z,p.y+sy*p.z,1.5);this.dummy.scale.set(p.radius*1.8,p.radius*1.4,1);this.dummy.updateMatrix();this.shadows.setMatrixAt(i,this.dummy.matrix);});
  this.clouds.count=puffs.length;this.shadows.count=w!.isDay?puffs.length:0;this.clouds.instanceMatrix.needsUpdate=true;this.shadows.instanceMatrix.needsUpdate=true;
  // Rain or snow is drawn only when the model reports precipitation, and falls from beneath the drawn clouds.
  const count=dropCount(this.rain),base=scale.cloudBase,len=scale.u*(snow?.004:.03),wind=Math.min(w!.windKph,40)/40,[ux,uy]=downwind(w!.windDirection);
  const cells=rainCells(puffs.filter((_p,i)=>i%PUFFS_PER_CLOUD===0),centre,scale.u),spread=scale.field*.045;
  for(let i=0;i<count;i++){const cell=cells.length?cells[i%cells.length]:{x:centre[0],y:centre[1]},r1=Math.sin(i*127.1)*.5+.5,r2=Math.sin(i*311.7)*.5+.5,r3=Math.sin(i*74.7)*.5+.5;
   const spreadHere=cells.length?spread:scale.field*.4,a=r1*Math.PI*2,d=Math.sqrt(r2)*spreadHere,drop=((r3+this.fall/(snow?9:1.1))%1),z=base*(1-drop),drift=drop*base*wind*.35;
   const px=cell.x+Math.cos(a)*d+ux*drift,py=cell.y+Math.sin(a)*d+uy*drift;
   this.positions.set([px,py,z,px-ux*len*wind*.5,py-uy*len*wind*.5,z+len],i*6);}
  this.geometry.setDrawRange(0,count*2);this.geometry.attributes.position.needsUpdate=true;
  return animate&&(puffs.length>0||count>0||Math.abs(this.cloud-w!.cloudCover/100)>.01);
 }
 dispose(){this.clouds.geometry.dispose();(this.clouds.material as T.Material).dispose();(this.shadows.material as T.Material).dispose();this.texture.dispose();this.geometry.dispose();(this.drops.material as T.Material).dispose();this.group.removeFromParent();}
}
