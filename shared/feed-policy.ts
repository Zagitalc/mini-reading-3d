// One provider cadence shared by Node, Workers and the browser.
export const CADENCE = {buses:60_000,trains:60_000,traffic:300_000,roadworks:300_000,weather:900_000,fuel:21_600_000,rivers:900_000} as const;
export function freshObservation(item:{observedAt:string},now=Date.now()) {
 const age=now-Date.parse(item.observedAt);return Number.isFinite(age)&&age>=-60_000&&age<300_000;
}
export function retryDelay(interval:number,failures:number) {return interval * 2 ** Math.min(failures,4);}
export function due(lastAttempt:string|undefined,interval:number,failures=0,now=Date.now()) {
 return !lastAttempt || now-Date.parse(lastAttempt)>=retryDelay(interval,failures);
}
/** River gauges stay visible for six hours after the last good refresh (each shows its own reading time);
 * flood warnings only for one hour, so a lifted warning is never shown as current for long. */
export function riverSnapshot<T extends {kind:'gauge'|'warning'}>(items:T[],lastSuccess:string|undefined,now=Date.now()):{data:T[];warningsCurrent:boolean} {
 const age=lastSuccess?now-Date.parse(lastSuccess):Infinity,warningsCurrent=age<3_600_000;
 // warningsCurrent tells the map whether "no warnings" is an answer or merely missing data.
 return {data:items.filter(i=>i.kind==='gauge'?age<6*3_600_000:warningsCurrent),warningsCurrent};
}
