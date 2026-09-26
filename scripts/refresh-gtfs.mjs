import {readFile,writeFile,mkdir,rm,cp,appendFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {gtfsContentHash} from './gtfs-validation.ts';
const dest='public/data',staging='raw/gtfs-staging';
const current=await readFile(`${dest}/gtfs-metadata.json`,'utf8').then(JSON.parse).catch(()=>undefined);
const run=(script,env={},args=[])=>{const r=spawnSync(process.execPath,['--import','tsx',script,...args],{stdio:'inherit',env:{...process.env,...env}});if(r.status!==0)throw Error(`${script} failed`);};
if(!process.argv.includes('--from-local'))run('scripts/download-data.mjs',{},['--gtfs-only']);
const archive=unzipSync(new Uint8Array(await readFile('raw/reading-gtfs.zip'))),hash=gtfsContentHash(archive);
const changed=hash!==current?.contentHash;
if(changed){
 await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});
 run('scripts/build-gtfs.ts',{GTFS_OUTPUT:staging});
 run('scripts/build-routes.ts',{GEOGRAPHY_OUTPUT:staging,BUS_NETWORK_INPUT:`${staging}/bus-network.json`},['--bus-only']);
 // Promotion only happens after validation. Keep the preceding version for already-open stop panels.
 const metadata=JSON.parse(await readFile(`${staging}/gtfs-metadata.json`,'utf8'));
 const oldVersion=current?.version??JSON.parse(await readFile(`${dest}/bus-stops.json`,'utf8')).stops.find(s=>s.timetableUrl)?.timetableUrl.split('/')[3];
 await mkdir(`${dest}/timetables`,{recursive:true});await cp(`${staging}/timetables`,`${dest}/timetables`,{recursive:true});
 for(const dir of await readdir(`${dest}/timetables`))if(dir!==metadata.version&&dir!==oldVersion)await rm(`${dest}/timetables/${dir}`,{recursive:true,force:true});
 for(const file of ['bus-network.json','bus-stops.json','bus-routes.json','gtfs-metadata.json'])await cp(`${staging}/${file}`,`${dest}/${file}`);
 console.log(`GTFS updated: service dates ${metadata.validFrom}–${metadata.validUntil}`);
}else console.log('GTFS content unchanged; no rebuild needed.');
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`changed=${changed}\n`);
