/** Adult bus fares used for the car-or-bus comparison. Fares are not in the timetable feed, so these
 * are read by hand from the operator's page; the panel shows `checkedOn` and the link beside them. */
export const BUS_FARES={
 operator:'Reading Buses',
 zone:'simplyReading (within Reading)',
 /** Cash or contactless; the app is 10p cheaper. Matches the £3 England single-fare cap. */
 single:3,
 /** Adult day ticket, cash or contactless; £5.00 in the app. */
 day:5.4,
 checkedOn:'2026-09-28',
 sourceUrl:'https://www.reading-buses.co.uk/on-the-bus-fares',
};
/** The cheaper of two singles and a day ticket, for a there-and-back trip. */
export const busReturn=(f:{single:number;day:number})=>f.day>0?Math.min(2*f.single,f.day):2*f.single;
