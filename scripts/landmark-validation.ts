import {createHash} from 'node:crypto';
import type {FeatureCollection} from 'geojson';
import {LANDMARKS} from '../shared/config';
import {STATION_BUILDINGS,STATION_PLATFORMS,ORACLE_BUILDINGS} from '../shared/landmark-components';
export const expectedLandmarkIds=[...new Set([...LANDMARKS.flatMap(l=>l.footprintIds),...STATION_BUILDINGS,...STATION_PLATFORMS,...ORACLE_BUILDINGS,'way/215630983'])].sort();
export function landmarkFingerprints(input:FeatureCollection) {
 const output:Record<string,string>={};
 for(const id of expectedLandmarkIds){const features=input.features.filter(f=>String(f.properties?.osm_id)===id);if(features.length!==1)throw Error(`Landmark ${id}: expected one source footprint, found ${features.length}`);
  const f=features[0];if(!f.geometry||!['Polygon','MultiPolygon','LineString'].includes(f.geometry.type))throw Error(`Invalid landmark geometry: ${id}`);
  output[id]=createHash('sha256').update(JSON.stringify({geometry:f.geometry,building:f.properties?.building,railway:f.properties?.railway})).digest('hex');
 }return output;
}
export function validateLandmarks(input:FeatureCollection,reviewed:Record<string,string>){const actual=landmarkFingerprints(input);for(const id of new Set([...Object.keys(actual),...Object.keys(reviewed)]))if(actual[id]!==reviewed[id])throw Error(`Landmark footprint changed: ${id}. Review source geometry and replacement IDs before updating scripts/landmark-footprints.json.`);}
