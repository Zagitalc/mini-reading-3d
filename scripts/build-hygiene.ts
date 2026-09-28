// Downloads each council's food hygiene open-data file and writes the map bundle public/data/hygiene.json.
// The FSA files carry no CORS header, so the browser cannot read them directly.
import {writeFile} from 'node:fs/promises';
import {BOUNDS} from '../shared/config';
import {HYGIENE_AUTHORITIES,hygieneBundle,hygieneFileUrl} from '../shared/hygiene';
const headers={'User-Agent':'MiniReading3D/0.1 (+https://github.com/Zagitalc/mini-reading-3d)','Accept':'application/json'};
const files=[];
for(const authority of HYGIENE_AUTHORITIES){
 const r=await fetch(hygieneFileUrl(authority.code),{headers,signal:AbortSignal.timeout(120_000)});
 if(!r.ok)throw Error(`${authority.name} hygiene file: HTTP ${r.status}`);
 files.push({authority,json:await r.json()});
}
const bundle=hygieneBundle(files,BOUNDS);
await writeFile('public/data/hygiene.json',JSON.stringify(bundle));
for(const a of bundle.authorities)console.log(`${a.name}: ${a.total} premises, ${a.mapped} with a location, ${a.inArea} on the map (extract ${a.extractDate})`);
console.log(`Wrote public/data/hygiene.json with ${bundle.places.length} places.`);
