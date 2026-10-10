import type {LngLat} from './types';

/**
 * Four tall or distinctive buildings modelled by hand on top of their mapped OpenStreetMap footprints.
 * The footprints are copied from the bundled building chunks; heights and roof shapes are approximate.
 * `height` is the main roof or eave level in metres; `source` says where a figure came from, or that it is a guess.
 */
export interface SkylineLandmark {
 id:string;name:string;kind:'tower'|'church';
 /** Building id in the chunks and map tiles, without the trailing part number. */
 buildingId:string;ring:LngLat[];
 height:number;
 /** Tower: slim mast above the roof, to this height. Church: height of the west tower. */
 top?:number;
 source:string;heightSource:'cited'|'estimated';
}

export const SKYLINE:SkylineLandmark[]=[
 {id:'blade',name:'The Blade',kind:'tower',buildingId:'area/65505346',ring:[[-0.9669065,51.4556034],[-0.9668554,51.4555309],[-0.9668282,51.4555384],[-0.9667491,51.4554262],[-0.966121,51.4555981],[-0.9661787,51.45568],[-0.9661263,51.4557184],[-0.9662148,51.4557205],[-0.9663067,51.4557171],[-0.9664287,51.4557054],[-0.9665045,51.4556958],[-0.9666058,51.4556766],[-0.9666802,51.4556599],[-0.9667437,51.455643],[-0.9667466,51.4556471],[-0.9669065,51.4556034]] as LngLat[],height:59,top:86,
  source:'Roof 59 m and antenna spire 86 m, per Wikipedia (https://en.wikipedia.org/wiki/The_Blade,_Reading); footprint matched by the article coordinates 51.4556, -0.9664.',heightSource:'cited'},
 {id:'thames-tower',name:'Thames Tower',kind:'tower',buildingId:'area/77499534',ring:[[-0.9730014,51.4582066],[-0.9729882,51.458031],[-0.9729758,51.4578655],[-0.9724184,51.4578817],[-0.9724441,51.4582243],[-0.972501,51.4582225],[-0.9729676,51.4582077],[-0.9730014,51.4582066]] as LngLat[],height:55,
  source:'55 m, 15 floors, per Wikipedia (https://en.wikipedia.org/wiki/Thames_Tower); footprint chosen as the nearest to the article coordinates 51.4580, -0.9727 (17 m away; the next candidate is 40 m away).',heightSource:'cited'},
 {id:'minster',name:'Reading Minster',kind:'church',buildingId:'area/96032369',ring:[[-0.9739828,51.4544837],[-0.9739639,51.4544117],[-0.9738562,51.4544226],[-0.9738424,51.45437],[-0.9737282,51.4543816],[-0.9737205,51.4543523],[-0.9736517,51.4543593],[-0.9736581,51.4543839],[-0.9733667,51.4544136],[-0.9733826,51.4544743],[-0.9733229,51.4544804],[-0.9733408,51.4545488],[-0.9734812,51.4545344],[-0.973493,51.4545794],[-0.9734402,51.4545848],[-0.9734471,51.4546112],[-0.9734962,51.4546062],[-0.9735065,51.4546456],[-0.9735956,51.4546366],[-0.9735882,51.4546084],[-0.97368,51.4545991],[-0.9738829,51.4545784],[-0.9738644,51.4545078],[-0.9738985,51.4545043],[-0.9738954,51.4544926],[-0.9739828,51.4544837]] as LngLat[],height:11,top:22,
  source:'Footprint matched by the Historic England listing position 51.4544, -0.9736. Nave and tower heights are estimates; no height was found.',heightSource:'estimated'},
 {id:'st-laurence',name:"St Laurence's Church",kind:'church',buildingId:'area/65531449',ring:[[-0.9696562,51.4564145],[-0.9696199,51.4562776],[-0.9694946,51.4562905],[-0.9689157,51.4563501],[-0.9689519,51.4564869],[-0.9696562,51.4564145]] as LngLat[],height:11,top:24,
  source:"Footprint matched by the Historic England listing position 51.4564, -0.9693 (list entry 1113532). Nave and tower heights are estimates; the tower is placed at the west end by assumption.",heightSource:'estimated'}
];

export const SKYLINE_BUILDING_IDS=SKYLINE.map(l=>l.buildingId);
/** True for a chunk or tile building id such as `area/65505346/0` that a skyline model replaces. */
export const isSkylineBuilding=(id:string)=>SKYLINE_BUILDING_IDS.includes(id.split('/').slice(0,2).join('/'));
/** Exact tile `id` values (building id plus part number) for the map style's overview filter; none has more than a few parts. */
export const SKYLINE_TILE_IDS=SKYLINE_BUILDING_IDS.flatMap(id=>[0,1,2,3].map(n=>`${id}/${n}`));
