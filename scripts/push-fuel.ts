// Run by .github/workflows/refresh-fuel.yml: trims the national fuel file to the map and uploads it to
// the Worker, which cannot afford to parse 3 MB itself. `--dry-run` prints the forecourts and uploads nothing.
import {fetchFuelNational,filingSummary,parseFuel,trimFuelToArea} from '../server/providers/fuel';
const national=await fetchFuelNational(),area=trimFuelToArea(national),stations=parseFuel(area),now=Date.now();
if(!stations.length)throw Error('No forecourts in the map area; refusing to upload an empty list');
const uk=filingSummary(national,now),here=filingSummary(area,now);
const days=(at:string)=>`${Math.floor((now-Date.parse(at))/86_400_000)}d`;
console.log(`Source snapshot ${area.source_generated_at}: ${stations.length} forecourts in the map area.`);
console.log(`Filed a price in the last day / week: UK ${uk.day} / ${uk.week} of ${uk.stations} (newest ${uk.newest??'none'}); map area ${here.day} / ${here.week} of ${here.stations}.`);
// A mirror that keeps republishing but has stopped taking new filings looks like this: nobody in the country filed for days.
if(!uk.newest||now-Date.parse(uk.newest)>2*86_400_000)console.log(`::warning::No UK forecourt has filed a price since ${uk.newest??'ever'}: the fuel mirror looks stuck, so prices on the map will age.`);
for(const s of stations)console.log(`  ${s.postcode.padEnd(9)} ${`${s.brand} · ${s.name}`.slice(0,48).padEnd(48)} ${Object.entries(s.prices).map(([g,p])=>`${g} ${p.pence} (${days(p.submittedAt)})`).join('  ')}`);
if(process.argv.includes('--dry-run'))process.exit(0);
const url=process.env.FUEL_INGEST_URL??'https://mini-reading-3d.reading-maps.workers.dev',token=process.env.FUEL_INGEST_TOKEN;
if(!token)throw Error('Set FUEL_INGEST_TOKEN (the same value as the Worker secret)');
const r=await fetch(new URL('/api/v1/ingest/fuel',url),{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(area),signal:AbortSignal.timeout(30_000)});
const body=await r.text();if(!r.ok)throw Error(`Upload failed: HTTP ${r.status} ${body}`);
console.log(`Uploaded: ${body}`);
