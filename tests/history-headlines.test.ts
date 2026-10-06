import test from 'node:test';
import assert from 'node:assert/strict';
import {fuelHeadlines,historyHeadlines,railHeadline} from '../shared/history-headlines';
import type {HistoryResponse,HourSummary} from '../shared/history';
const hour=(iso:string,departures:number,late:number,cancelled=0,minutes=60):HourSummary=>({hour:iso,minutes,buses:null,trains:null,rail:{departures,onTime:departures-late-cancelled,late,cancelled,worstDelay:0},feeds:{}});
// 15:00 London on Tue 6 Oct 2026 is 14:00Z (BST). Complete hours so far today: 06:00 to 14:00 London.
const now=Date.parse('2026-10-06T14:20:00Z');
const day=(date:string,bad:number)=>Array.from({length:9},(_,i)=>hour(`${date}T${String(5+i).padStart(2,'0')}:00Z`,6,i<bad?1:0));
const base=(hours:HourSummary[],fuel:HistoryResponse['fuel']=[]):HistoryResponse=>({version:1,generatedAt:'',from:'',recordingSince:null,hours,fuel});
test('rail compares the same London hours on both days',()=>{
 const r=railHeadline(base([...day('2026-10-05',2),...day('2026-10-06',4)]),now);
 assert.match(r.headline!.text,/7% of departures late or cancelled so far today \(4 of 54\), against 4% at the same hours yesterday \(2 of 54\)/);
 assert.match(r.headline!.note!,/9 hours recorded on both days, from 06:00 to 15:00/);
});
test('rail leaves out hours not recorded on both days, and partial hours',()=>{
 const today=day('2026-10-06',3),yesterday=day('2026-10-05',1).slice(2);
 const r=railHeadline(base([...yesterday,...today]),now);assert.match(r.headline!.note!,/7 hours/);
 const partial=day('2026-10-06',3).map((h,i)=>i<3?{...h,minutes:20}:h);
 assert.match(railHeadline(base([...day('2026-10-05',1),...partial]),now).headline!.note!,/6 hours/);
});
test('rail says what is missing instead of guessing',()=>{
 assert.match(railHeadline(base(day('2026-10-06',1)),now).missing!,/six hours/);
 const thin=(d:string)=>Array.from({length:8},(_,i)=>hour(`${d}T${String(6+i).padStart(2,'0')}:00Z`,1,0));
 assert.match(railHeadline(base([...thin('2026-10-05'),...thin('2026-10-06')]),now).missing!,/Too few/);
});
const fuelDay=(d:string,median:number,stations=30)=>({schema:1 as const,day:d,recordedAt:'',observedAt:'',grades:{E10:{stations,cheapest:median-4,median,dearest:median+6,cheapestIds:[]},B7S:{stations,cheapest:median+8,median:median+10,dearest:median+16,cheapestIds:[]}}});
test('fuel compares with a week ago, or the nearest earlier day, and calls tiny moves unchanged',()=>{
 let f=fuelHeadlines(base([],[fuelDay('2026-09-29',135.9),fuelDay('2026-10-06',133.9,33)]));
 assert.equal(f.headlines.length,2);assert.match(f.headlines[0].text,/Petrol E10: median 133.9p a litre, down 2.0p since a week ago\. Cheapest 129.9p/);
 assert.match(f.headlines[0].note!,/33 stations reporting \(30 on Tue 29 Sept?\)/);
 f=fuelHeadlines(base([],[fuelDay('2026-10-02',130),fuelDay('2026-10-06',130.1)]));assert.match(f.headlines[0].text,/unchanged since Fri 2 Oct/);
 f=fuelHeadlines(base([],[fuelDay('2026-10-05',130),fuelDay('2026-10-06',131)]));assert.equal(f.headlines.length,0);assert.match(f.missing!,/three or more days/);
 assert.match(fuelHeadlines(base([])).missing!,/No fuel prices/);
});
test('with a month of fuel days the comparison day is the one nearest a week back',()=>{
 const f=fuelHeadlines(base([],[fuelDay('2026-09-10',120),fuelDay('2026-10-01',132),fuelDay('2026-10-06',133)]));
 assert.match(f.headlines[0].text,/up 1\.0p since Thu 1 Oct/);
});
test('headlines combine both and list what is missing',()=>{
 const h=historyHeadlines(base(day('2026-10-06',1),[fuelDay('2026-09-29',135),fuelDay('2026-10-06',134)]),now);
 assert.equal(h.items.length,2);assert.equal(h.missing.length,1);assert.ok(h.items.every(i=>i.kind==='fuel'));
});
