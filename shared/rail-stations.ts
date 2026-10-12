import type {LngLat} from './types';

/** The stations whose boards are polled for train positions: where each is, and what it is called. Reading is RDG. */
export const STATION_POSITIONS:Record<string,LngLat>={RDG:[-.9723182,51.4592197],RDW:[-.9907169,51.4546483],TLH:[-1.0296647,51.4716513],TWY:[-.8631386,51.47539],WTI:[-.8918298,51.4367674],WNS:[-.8779199,51.4307527],EAR:[-.9177114,51.4410298],RGP:[-1.0013637,51.4265936],THE:[-1.074364,51.4333628],WKM:[-.8429813,51.4119036],WGV:[-.8766558,51.4985546]};
/** The ten stations around Reading that get a pin and a departure board; Reading itself is a landmark with its own. */
export const NEARBY_STATIONS:Record<string,string>={RDW:'Reading West',TLH:'Tilehurst',TWY:'Twyford',WTI:'Winnersh Triangle',WNS:'Winnersh',EAR:'Earley',RGP:'Reading Green Park',THE:'Theale',WKM:'Wokingham',WGV:'Wargrave'};
