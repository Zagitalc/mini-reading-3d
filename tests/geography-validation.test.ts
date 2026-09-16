import test from 'node:test';
import assert from 'node:assert/strict';
import type {FeatureCollection} from 'geojson';
import {speedLimit,roadSpeedLimit} from '../shared/speed-limits';
import {expectedLandmarkIds,landmarkFingerprints,validateLandmarks} from '../scripts/landmark-validation';
test('speed normalization supports GB zones and explicit NSL without inferring from numeric speeds',()=>{
 for(const [tag,value] of [['20','20'],['20 mph','20'],[' 40 MPH ','40'],['50','50'],['GB:zone20','20'],['gb:zone30','30'],['GB:nsl_single','NSL'],[' GB:NSL_DUAL ','NSL'],['60','60'],['70 mph','70']])assert.equal(speedLimit(tag),value);
 assert.equal(speedLimit('20 km/h'),undefined);assert.equal(speedLimit('GB:urban'),undefined);
});
test('conflicting, incomplete and conditional limits retain detail rather than assert one speed',()=>{
 assert.deepEqual(roadSpeedLimit({maxspeed:'40'}),{limit:'40'});
 assert.deepEqual(roadSpeedLimit({maxspeed:'60','maxspeed:type':'GB:nsl_single'}),{limit:'NSL'});
 assert.deepEqual(roadSpeedLimit({'maxspeed:forward':'40','maxspeed:backward':'40 mph'}),{limit:'40'});
 for(const tags of [{'maxspeed:forward':'30','maxspeed:backward':'40'},{'maxspeed:forward':'40'},{maxspeed:'40','maxspeed:type':'GB:zone30'},{maxspeed:'signals','maxspeed:type':'GB:nsl_single'},{maxspeed:'30','maxspeed:backward':'signals'},{maxspeed:'50','maxspeed:conditional':'30 @ (Mo-Fr 08:00-09:00)'}]){const value=roadSpeedLimit(tags);assert.equal(value?.limit,'↔');assert.deepEqual(value?.speedDetails,tags);}
 assert.equal(roadSpeedLimit({}),undefined);
});
const fixture=():FeatureCollection=>({type:'FeatureCollection',features:expectedLandmarkIds.map(osm_id=>({type:'Feature',properties:{osm_id,building:'yes'},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}}))});
test('landmark checks reject missing, duplicate, changed and newly configured footprints',()=>{
 const original=fixture(),reviewed=landmarkFingerprints(original);validateLandmarks(original,reviewed);
 const missing=fixture();missing.features.pop();assert.throws(()=>validateLandmarks(missing,reviewed),/expected one/);
 const duplicate=fixture();duplicate.features.push(duplicate.features[0]);assert.throws(()=>validateLandmarks(duplicate,reviewed),/found 2/);
 const moved=fixture();moved.features[0].geometry={type:'Point',coordinates:[1,1]};assert.throws(()=>validateLandmarks(moved,reviewed),/Invalid landmark geometry/);
 const changed=fixture();changed.features[0].properties!.building='roof';assert.throws(()=>validateLandmarks(changed,reviewed),/footprint changed/);
 const shape=fixture();(shape.features[0].geometry as GeoJSON.Polygon).coordinates[0][0][0]=.5;assert.throws(()=>validateLandmarks(shape,reviewed),/footprint changed/);
 assert.throws(()=>validateLandmarks(original,{}),/footprint changed/);
});
