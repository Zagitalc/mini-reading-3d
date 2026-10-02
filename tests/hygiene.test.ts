import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FOOD_CATEGORIES,RATING_FILTERS,foodCategory,foodMatches,hygieneBundle,parseAuthority,ratingGroup} from '../shared/hygiene';
import {readFileSync} from 'node:fs';
import {stationHistory,validStationId,type FuelDay} from '../shared/history';
import {BOUNDS} from '../shared/config';
// Shaped like the FSA open-data JSON read on 28 Sep 2026: Geocode is null when missing, lat/lon are strings.
const record=(id:number,extra:Record<string,unknown>={})=>({FHRSID:id,LocalAuthorityBusinessID:'142094',BusinessName:"3B's Cafe",BusinessType:'Other catering premises',BusinessTypeID:7841,AddressLine1:'735 Oxford Road',AddressLine2:'Reading',PostCode:'RG30 1JA',RatingValue:'5',RatingKey:'fhrs_5_en-GB',RatingDate:'2026-03-17',LocalAuthorityCode:'884',LocalAuthorityName:'Reading',Scores:{Hygiene:5,Structural:5,ConfidenceInManagement:5},SchemeType:'FHRS',NewRatingPending:false,Geocode:{Longitude:'-1.013856',Latitude:'51.4622131'},...extra});
const file=(list:unknown[])=>({FHRSEstablishment:{Header:{ExtractDate:'2026-09-16',ItemCount:list.length,ReturnCode:'Success'},EstablishmentCollection:list}});
test('hygiene files become compact places, counting but not mapping premises without a location',()=>{
 const types:string[]=[];
 const {info,places}=parseAuthority(file([record(1),record(2,{Geocode:null}),record(3,{Geocode:{Longitude:'-1.5',Latitude:'51.4'}}),record(4,{RatingValue:'AwaitingInspection',BusinessType:'Takeaway/sandwich shop',NewRatingPending:true,AddressLine2:undefined})]),{code:'884',name:'Reading'},BOUNDS,types);
 assert.deepEqual(info,{code:'884',name:'Reading',extractDate:'2026-09-16',total:4,mapped:3,inArea:2});
 assert.deepEqual(places[0],[1,"3B's Cafe",0,'735 Oxford Road, Reading','RG30 1JA',-1.01386,51.46221,'5','2026-03-17',0]);
 assert.deepEqual(places[1].slice(2),[1,'735 Oxford Road','RG30 1JA',-1.01386,51.46221,'AwaitingInspection','2026-03-17',1]);
 assert.deepEqual(types,['Other catering premises','Takeaway/sandwich shop']);
 assert.throws(()=>parseAuthority({},{code:'1',name:'X'},BOUNDS,[]));
 const b=hygieneBundle([{authority:{code:'884',name:'Reading'},json:file([record(9),record(1)])},{authority:{code:'887',name:'Wokingham'},json:file([record(1)])}],BOUNDS);
 assert.deepEqual(b.places.map(p=>p[0]),[1,9],'duplicates across councils appear once');assert.equal(b.authorities.length,2);
 assert.deepEqual(['5','4','3','2','0','Exempt'].map(ratingGroup),['good','good','fair','poor','poor','none']);
});
test('Food mode maps every FSA business type explicitly, and All food leaves out shops and institutions',()=>{
 const bundled=JSON.parse(readFileSync(new URL('../public/data/hygiene.json',import.meta.url),'utf8')) as {types:string[]};
 assert.deepEqual(bundled.types.filter(t=>!(t in FOOD_CATEGORIES)),[],'every type in the bundled data has a deliberate mapping');
 assert.equal(foodCategory('Restaurant/Cafe/Canteen'),'restaurant-cafe');assert.equal(foodCategory('Pub/bar/nightclub'),'pub-bar');
 assert.equal(foodCategory('School/college/university'),'excluded-institutional');assert.equal(foodCategory('A type the FSA adds later'),'excluded-institutional');
 for(const t of ['School/college/university','Hospitals/Childcare/Caring Premises','Retailers - other','Retailers - supermarkets/hypermarkets','Manufacturers/packers'])
  assert.equal(foodMatches(t,'5','all','all'),false,`All food is places to eat and drink, so ${t} is left out`);
 assert.equal(foodMatches('Mobile caterer','5','all','all'),true);assert.equal(foodMatches('Mobile caterer','5','takeaway','all'),false);
 assert.deepEqual(['5','4','3','Exempt','AwaitingInspection'].map(r=>foodMatches('Takeaway/sandwich shop',r,'takeaway','4')),[true,true,false,false,false]);
 assert.deepEqual(['5','4','Exempt'].map(r=>foodMatches('Pub/bar/nightclub',r,'pub-bar','5')),[true,false,false]);
 assert.deepEqual(['3','Exempt'].map(r=>foodMatches('Pub/bar/nightclub',r,'pub-bar','all')),[true,true]);
 assert.deepEqual(RATING_FILTERS.map(([id])=>id),['all','4','5'],'chips read All, 4+, 5 from left to right');
});
test('a forecourt price history reads one station from the daily fuel rows',()=>{
 const day=(d:string,pence:number):FuelDay=>({schema:1,day:d,recordedAt:d+'T20:00:00Z',observedAt:d+'T15:00:00Z',grades:{},stations:[{id:'a',name:'A',brand:'B',postcode:'RG1',prices:{E10:{pence,submittedAt:d+'T09:00:00Z'}}},{id:'b',name:'B',brand:'B',postcode:'RG1',prices:{}}]});
 const h=stationHistory([day('2026-09-28',175.9),day('2026-09-27',174.9)],'a');
 assert.deepEqual(h.map(x=>[x.day,x.prices.E10.pence]),[['2026-09-27',174.9],['2026-09-28',175.9]]);
 assert.deepEqual(stationHistory([day('2026-09-28',1)],'missing'),[]);
 assert.equal(validStationId('43c6fc3d'),true);assert.equal(validStationId(''),false);assert.equal(validStationId(['a']),false);assert.equal(validStationId('x'.repeat(121)),false);
});
