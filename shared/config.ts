import type { Bounds, LngLat } from './types';
export const BOUNDS:Bounds=[-1.08,51.39,-0.84,51.50];
export const ORIGIN:LngLat=[-0.9717,51.4584];
export const INITIAL_VIEW={center:ORIGIN,zoom:15.5,pitch:58,bearing:-24};
export const LANDMARKS=[
 {id:'station',name:'Reading station',position:[-0.9718,51.4589] as LngLat,kind:'Transport',radius:160,footprintIds:['area/1317686802','area/1317686800']},
 {id:'town-hall',name:'Reading Town Hall',position:[-0.96968395,51.45681955] as LngLat,kind:'Landmark',radius:44,footprintIds:['area/96173955']},
 {id:'abbey',name:'Reading Abbey',position:[-0.9648458,51.4559257] as LngLat,kind:'Landmark',radius:45,footprintIds:[]},
 {id:'oracle',name:'The Oracle',position:[-0.97120925,51.45389075] as LngLat,kind:'Shopping',radius:82,footprintIds:['area/68649176']},
 {id:'university',name:'University of Reading',position:[-0.94496,51.4400117] as LngLat,kind:'University',radius:65,footprintIds:['area/477837455']},
 {id:'stadium',name:'Reading stadium',position:[-0.9827,51.42235] as LngLat,kind:'Stadium',radius:95,footprintIds:['area/256756003','area/256756007','area/256756006','area/256756008']}
];
