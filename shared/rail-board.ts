/** Stations whose full departure board is kept from the shared rail refresh. */
export const BOARD_STATIONS={RDG:'Reading'} as const;
export type BoardStation=keyof typeof BOARD_STATIONS;
import {NEARBY_STATIONS} from './rail-stations';
/** The station a request asks for: Reading when none is named, a nearby station by its code, otherwise null. */
export const boardStation=(code:string|null|undefined):string|null=>!code?'RDG':code==='RDG'||Object.hasOwn(NEARBY_STATIONS,code)?code:null;
/** Departures kept per nearby station: the refresh already fetches every board, and only the next few are worth a pin. */
export const NEARBY_BOARD_SERVICES=8;
export interface RailDeparture {
 id:string;
 /** Timetabled departure, HH:mm London time. */
 scheduled:string;
 /** Darwin's estimate: "On time", "Delayed", "Cancelled" or an HH:mm time. */
 expected:string;
 destination:string;
 via?:string;
 /** Only present when Darwin publishes a platform; platforms can change. */
 platform?:string;
 operator:string;
 cancelled:boolean;
 reason?:string;
}
export interface StationBoard {schema:1;station:string;name:string;generatedAt:string;services:RailDeparture[];messages:string[];source:string;sourceUrl:string}
/** The boards of the stations around Reading, by station code, saved as one record from the same refresh. */
export type NearbyBoards=Record<string,StationBoard>;
export interface RailBoardResponse {version:1;configured:boolean;board:StationBoard|null}
/** A board older than this is shown as out of date; the shared refresh runs once a minute. */
export const BOARD_STALE_MS=5*60_000;
