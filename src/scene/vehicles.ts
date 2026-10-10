import * as T from'three';import{toLocal}from'../../shared/geo';import type{VehiclePose}from'../movement/tracker';
import {RENDER_BUDGET} from '../../shared/layer-zoom';
import {CAR_LENGTH} from '../../shared/train-cars';
export class VehicleMeshes{
 group=new T.Group();parts:{mesh:T.InstancedMesh;kind:'bus'|'train';offset:[number,number,number];scale:[number,number,number];colour?:boolean}[]=[];dummy=new T.Object3D();colour=new T.Color();enabled={bus:true,train:true};
 constructor(){for(const kind of ['bus','train']as const){const length=kind==='bus'?11:CAR_LENGTH,capacity=kind==='bus'?RENDER_BUDGET.vehiclesPerKind:RENDER_BUDGET.trainCars,width=kind==='bus'?2.6:3.1,height=kind==='bus'?4.2:4.1;const add=(offset:[number,number,number],scale:[number,number,number],colour:string,tint=false)=>{const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshLambertMaterial({color:colour}),capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;this.group.add(mesh);this.parts.push({mesh,kind,offset,scale,colour:tint});};
 add([0,0,height/2+.5],[width,length,height],'#ffffff',true);add([0,0,height+.55],[width*.96,length*.98,.22],'#e5e9df');add([0,0,height*.73],[width*1.015,length*.91,height*.25],'#304b53');add([0,length*.48,height*.47],[width*.77,.08,height*.5],'#9aaf9e');for(const y of [-length*.3,length*.3])add([0,y,.75],[width*1.04,1.3,1.2],'#303b38');}
 }
 /** One drawn body per bus, and one per car of each train: the cars keep their spacing from the lead car as the view zooms. */
 update(poses:VehiclePose[],zoom:number){
  const visualScale=Math.min(2,Math.max(1,1+(16-zoom)*.25));
  const slots={bus:[] as {pose:VehiclePose;position:[number,number];bearing:number}[],train:[] as {pose:VehiclePose;position:[number,number];bearing:number}[]};
  for(const pose of poses){
   const kind=pose.observation.kind,list=slots[kind];
   if(kind==='bus'){if(list.length<RENDER_BUDGET.vehiclesPerKind)list.push({pose,position:toLocal(pose.position) as [number,number],bearing:pose.bearing});continue;}
   const lead=toLocal(pose.position);
   if(!pose.cars){if(list.length<RENDER_BUDGET.trainCars)list.push({pose,position:lead as [number,number],bearing:pose.bearing});continue;}
   for(const car of pose.cars){
    if(list.length>=RENDER_BUDGET.trainCars)break;
    const [cx,cy]=toLocal(car.position);
    list.push({pose,position:[lead[0]+(cx-lead[0])*visualScale,lead[1]+(cy-lead[1])*visualScale],bearing:car.bearing});
   }
  }
  for(const part of this.parts){
   const list=this.enabled[part.kind]?slots[part.kind]:[];part.mesh.count=list.length;
   for(let i=0;i<list.length;i++){
    const {pose:p,position:[x,y],bearing}=list[i],angle=-bearing*Math.PI/180,[ox,oy,oz]=part.offset;
    this.dummy.position.set(x+(ox*Math.cos(angle)-oy*Math.sin(angle))*visualScale,y+(ox*Math.sin(angle)+oy*Math.cos(angle))*visualScale,(p.observation.elevation??0)+oz*visualScale);
    this.dummy.rotation.set(0,0,angle);this.dummy.scale.set(...part.scale.map(v=>v*visualScale)as[number,number,number]);this.dummy.updateMatrix();part.mesh.setMatrixAt(i,this.dummy.matrix);
    if(part.colour){const hash=[...p.observation.label].reduce((h,c)=>h+c.charCodeAt(0),0);this.colour.set(p.stale?'#a4a79b':part.kind==='train'?'#41756a':p.observation.routeColour??['#b97155','#718659','#548390','#92709c','#c1a254'][hash%5]);part.mesh.setColorAt(i,this.colour);}
   }
   part.mesh.instanceMatrix.needsUpdate=true;if(part.mesh.instanceColor)part.mesh.instanceColor.needsUpdate=true;
  }
 }
}
