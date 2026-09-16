import{test}from'node:test';import assert from'node:assert/strict';import{parseStreetManager,parseWkt}from'../server/providers/roadworks';import{RoadEventStore}from'../server/store';import{allowedSnsUrl,canonicalSns,validateSns}from'../server/providers/sns';import{eventDuration,eventIsVisible,formatDate}from'../shared/road-events';import type{RoadEvent}from'../shared/types';
const raw={object_type:'PERMIT',object_reference:'abc-01',event_type:'WORK_START',event_time:'2026-09-05T08:00:00Z',version:1,object_data:{work_reference_number:'abc',works_location_coordinates:'POINT(471500 173500)',street_name:'Test street',traffic_management_type:'Road closure',actual_start_date_time:'2026-09-05T08:00:00Z'}};
test('future permits stay hidden until their start; confirmed early starts override plans',()=>{
 const now=Date.parse('2026-09-16T12:00:00Z'),base={...parseStreetManager(raw)!,status:'planned' as const,actualStart:undefined,plannedStart:'2026-09-23T07:00:00Z'};
 assert.equal(eventIsVisible(base,now),false);
 assert.equal(eventIsVisible(base,Date.parse(base.plannedStart)),true);
 assert.equal(eventIsVisible({...base,actualStart:'2026-09-16T09:00:00Z'},now),true);
 assert.equal(eventIsVisible({...base,status:'active'},now),true);
 assert.equal(eventIsVisible({...base,status:'active',actualStart:'2026-09-23T07:00:00Z'},now),false);
 assert.equal(eventIsVisible({...base,plannedStart:undefined},now),false);
 assert.equal(eventIsVisible({...base,plannedStart:'2026-09-17'},Date.parse('2026-09-16T22:59:59Z')),false);
 assert.equal(eventIsVisible({...base,plannedStart:'2026-09-17'},Date.parse('2026-09-16T23:00:00Z')),true);
 const db=new RoadEventStore(':memory:');try{db.upsert(base);assert.equal(db.active(now).length,0);assert.equal(db.active(Date.parse(base.plannedStart)).length,1);}finally{db.close();}
});
test('point-only closure stays a point with unknown end',()=>{const e=parseStreetManager(raw)!;assert.ok(e);assert.equal(e.kind,'closure');assert.equal(e.geometry.type,'Point');assert.equal(e.plannedEnd,undefined);assert.equal(eventDuration(e),null);});
test('ordinary works do not become closures',()=>{assert.equal(parseStreetManager({...raw,object_data:{...raw.object_data,traffic_management_type:'Two-way signals'}})?.kind,'works');});
test('cancellation and completion remove current event',()=>{for(const kind of ['PERMIT_CANCELLED','WORK_STOP']){const e=parseStreetManager({...raw,event_type:kind})!;assert.equal(eventIsVisible(e),false);}});
test('event version cannot override a newer timestamp',()=>{const db=new RoadEventStore(':memory:'),e=parseStreetManager(raw)!;assert.equal(db.upsert(e),true);assert.equal(db.upsert({...e,version:99,observedAt:'2026-09-04T08:00:00Z'}),false);assert.equal(db.upsert({...e,version:2}),true);assert.equal(db.active().length,1);db.close();});
test('updated cancellation persists and suppresses previous closure',()=>{const db=new RoadEventStore(':memory:'),e=parseStreetManager(raw)!;db.upsert(e);db.upsert({...e,status:'cancelled',observedAt:'2026-09-05T08:01:00Z'});assert.equal(db.active().length,0);db.close();});
test('invalid and out-of-area roadworks are rejected',()=>{assert.equal(parseWkt('POLYGON((1 2,3 4,1 2))'),null);assert.equal(parseStreetManager({...raw,object_data:{...raw.object_data,works_location_coordinates:'POINT(530000 180000)'}}),null);});
test('London dates honour daylight saving and duration uses real instants',()=>{assert.match(formatDate('2026-07-05T10:00:00Z'),/11:00/);assert.match(formatDate('2026-01-05T10:00:00Z'),/10:00/);const e={...parseStreetManager(raw)!,actualStart:'2026-10-25T00:30:00Z',actualEnd:'2026-10-25T02:30:00Z'};assert.equal(eventDuration(e),7200000);assert.equal(formatDate(undefined),'Unknown');});
test('SNS does not accept arbitrary certificate hosts or unsigned notifications',async()=>{assert.equal(allowedSnsUrl('https://sns.eu-west-2.amazonaws.com.evil.test/SimpleNotificationService-x.pem',true),false);assert.equal(allowedSnsUrl('http://sns.eu-west-2.amazonaws.com/SimpleNotificationService-x.pem',true),false);assert.equal(allowedSnsUrl('https://sns.eu-west-2.amazonaws.com/SimpleNotificationService-a123.pem',true),true);await assert.rejects(validateSns({Type:'Notification',TopicArn:'untrusted'}));});
