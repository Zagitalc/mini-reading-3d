// One provider cadence shared by Node, Workers and the browser.
export const CADENCE = {buses:60_000,trains:60_000,traffic:300_000,roadworks:300_000,weather:900_000,fuel:21_600_000} as const;
export function freshObservation(item:{observedAt:string},now=Date.now()) {
 const age=now-Date.parse(item.observedAt);return Number.isFinite(age)&&age>=-60_000&&age<300_000;
}
export function retryDelay(interval:number,failures:number) {return interval * 2 ** Math.min(failures,4);}
export function due(lastAttempt:string|undefined,interval:number,failures=0,now=Date.now()) {
 return !lastAttempt || now-Date.parse(lastAttempt)>=retryDelay(interval,failures);
}
