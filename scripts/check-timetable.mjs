import{readFile,appendFile}from'node:fs/promises';
const metadata=JSON.parse(await readFile('public/data/gtfs-metadata.json','utf8'));
let deployed;try{const r=await fetch('https://mini-reading-3d.reading-maps.workers.dev/data/gtfs-metadata.json',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.ok)deployed=await r.json();}catch{}
const needsDeploy=deployed?.version!==metadata.version;
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`needs_deploy=${needsDeploy}\n`);
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
const day=s=>Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));
const remaining=Math.round((day(metadata.validUntil)-day(today))/86400000);
const summary=`Timetable ${metadata.validFrom}–${metadata.validUntil}; ${remaining} days remaining; production ${needsDeploy?'differs':'matches'}.`;
console.log(summary);if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
if(remaining<=3)console.log(`::warning::Timetable has ${remaining} days remaining. A newer publisher feed may be needed.`);
if(remaining<0)throw Error('Timetable has expired; publisher has not supplied current coverage.');
if(process.argv.includes('--verify')&&needsDeploy)throw Error('Production timetable does not match the validated dataset.');
