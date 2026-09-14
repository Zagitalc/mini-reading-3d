import * as T from 'three';
import type {Weather} from '../../shared/types';
import {toLocal} from '../../shared/geo';
import type {ReadingScene} from './layer';
export class WeatherEffects {
 group=new T.Group();enabled=true;weather?:Weather;last=0;phase=0;cloud=0;rain=0;
 clouds=new T.InstancedMesh(new T.SphereGeometry(1,12,8),new T.MeshLambertMaterial({color:'#dde2e4',transparent:true,opacity:.38,depthWrite:false}),36);
 geometry=new T.BufferGeometry();positions=new Float32Array(800*6);drops:T.LineSegments;dummy=new T.Object3D();
 reduced=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private scene:ReadingScene){
  this.clouds.frustumCulled=false;this.clouds.count=0;this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));this.geometry.setDrawRange(0,0);
  this.drops=new T.LineSegments(this.geometry,new T.LineBasicMaterial({color:'#a7c6dd',transparent:true,opacity:.5,depthWrite:false}));this.drops.frustumCulled=false;this.group.add(this.clouds,this.drops);scene.extras.add(this.group);
 }
 set(weather?:Weather){this.weather=weather;this.scene.map.triggerRepaint();}
 update(now=performance.now()) {
  const w=this.weather,valid=w&&Date.now()-Date.parse(w.observedAt)<3600000;
  this.group.visible=!!valid&&this.enabled;
  if(!this.group.visible){this.scene.sun.intensity=2;this.scene.ambient.intensity=1.6;return false;}
  const dt=Math.min(.05,(now-this.last)/1000||0);this.last=now;
  const targetRain=w!.rainMm*3600/w!.intervalSeconds;
  if(this.reduced.matches){this.cloud=w!.cloudCover/100;this.rain=targetRain;}
  this.cloud+=(w!.cloudCover/100-this.cloud)*Math.min(1,dt*2);this.rain+=(targetRain-this.rain)*Math.min(1,dt*2);
  this.scene.sun.intensity=(w!.isDay?2:.25)*(1-this.cloud*.7);this.scene.ambient.intensity=w!.isDay?1.6:1.0;
  const [x,y]=toLocal(this.scene.map.getCenter().toArray());this.group.position.set(x,y,0);
  if(!this.reduced.matches&&!document.hidden)this.phase+=dt;
  this.clouds.count=Math.round(this.cloud*8)*3;
  for(let i=0;i<this.clouds.count;i++){const c=Math.floor(i/3),a=c*2.4,drift=this.phase*Math.min(w!.windKph/3.6,18);this.dummy.position.set(Math.sin(a)*850+(i%3-1)*45+Math.sin(w!.windDirection*Math.PI/180)*drift%400,Math.cos(a)*700+Math.cos(w!.windDirection*Math.PI/180)*drift%400,360+c%3*50);this.dummy.scale.set(70,55,32+i%3*12);this.dummy.updateMatrix();this.clouds.setMatrixAt(i,this.dummy.matrix);}this.clouds.instanceMatrix.needsUpdate=true;
  // No rain probability inference. Accumulated precipitation is normalized by its interval.
  const snow=w!.snowCm>0,count=this.reduced.matches?0:Math.min(800,Math.round((snow?w!.snowCm*20:this.rain)*100));
  const wind=Math.min(w!.windKph,40),angle=w!.windDirection*Math.PI/180;
  for(let i=0;i<count;i++){const px=Math.sin(i*127.1)*650,py=Math.cos(i*311.7)*650,z=30+((i*47.3-this.phase*(snow?12:130))%350+350)%350,o=i*6;this.positions.set([px,py,z,px+Math.sin(angle)*wind*.15,py+Math.cos(angle)*wind*.15,z+(snow?2:12)],o);}
  this.geometry.setDrawRange(0,count*2);this.geometry.attributes.position.needsUpdate=true;
  return !document.hidden&&!this.reduced.matches&&(this.clouds.count>0||count>0||Math.abs(this.cloud-w!.cloudCover/100)>.01);
 }
 dispose(){this.clouds.geometry.dispose();(this.clouds.material as T.Material).dispose();this.geometry.dispose();(this.drops.material as T.Material).dispose();this.group.removeFromParent();}
}
