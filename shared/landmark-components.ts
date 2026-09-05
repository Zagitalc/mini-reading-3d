import type {LngLat} from './types';
export interface LandmarkComponent {id:string;landmark:string;label:string;rings:LngLat[][];base:number;height:number;kind:'building'|'canopy'|'platform'|'concourse';tags:Record<string,string>}
// Reviewed IDs, not a radius exclusion. Platforms remain separate from buildings.
export const STATION_BUILDINGS=['1317469523','1317473095','1317686800','1317686801','1317686802','1318125642','1318125643','1318127040','1318131288','1318131289','1318132142','1318138341','1318152027'].map(id=>`area/${id}`);
export const STATION_PLATFORMS=['138505148','138505151','201105315','201105317','201105318','201105319','201105320','215630980','215630988','294201825','294201827','294201833','294201835','294201837','1317399081'].map(id=>`area/${id}`);
export const ORACLE_BUILDINGS=['68649176','68649193','95856048','96032345','1447229422','1447229423'].map(id=>`area/${id}`);
export function replacementLandmark(id:string){return STATION_BUILDINGS.includes(id)?'station':ORACLE_BUILDINGS.includes(id)?'oracle':undefined;}
