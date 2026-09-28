// Run by .github/workflows/refresh-fuel.yml: trims the national fuel file to the map and uploads it to
// the Worker, which cannot afford to parse 3 MB itself. `--dry-run` prints the forecourts and uploads nothing.
import {fetchFuelArea,parseFuel} from '../server/providers/fuel';
const area=await fetchFuelArea(),stations=parseFuel(area);
if(!stations.length)throw Error('No forecourts in the map area; refusing to upload an empty list');
console.log(`Source snapshot ${area.source_generated_at}: ${stations.length} forecourts in the map area.`);
for(const s of stations)console.log(`  ${s.postcode.padEnd(9)} ${s.brand} · ${s.name}`);
if(process.argv.includes('--dry-run'))process.exit(0);
const url=process.env.FUEL_INGEST_URL??'https://mini-reading-3d.reading-maps.workers.dev',token=process.env.FUEL_INGEST_TOKEN;
if(!token)throw Error('Set FUEL_INGEST_TOKEN (the same value as the Worker secret)');
const r=await fetch(new URL('/api/v1/ingest/fuel',url),{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(area),signal:AbortSignal.timeout(30_000)});
const body=await r.text();if(!r.ok)throw Error(`Upload failed: HTTP ${r.status} ${body}`);
console.log(`Uploaded: ${body}`);
