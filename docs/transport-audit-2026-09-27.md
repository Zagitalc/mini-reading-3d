# Transport accuracy audit — 27 September 2026

This is the repeatable part of the transport audit: two scripts, two fixtures of hand-transcribed operator times, and a record of what has and has not been checked. It gives evidence beyond "the tests pass". It does not establish that every departure is correct, and it says nothing about actual running, cancellations or delays.

## What changed

On 27 September the bundled timetable switched from the operator's own GTFS (route IDs such as `RBUS:14`) to the Bus Open Data Service copy (numeric route IDs). The existing audit looked routes up by ID and aborted on any date outside the bundle, so `npm run audit:timetable` stopped working against the new data.

- `audit:timetable` now resolves routes by their public label (14, 17, 21), in both the bundle and a `--raw` archive, and reports a dated case outside the bundle's coverage as `checked: false` instead of stopping.
- A new `audit:last-departures` script checks the last departure per stop, route and destination on a given service date, using the same `lastDepartures` function as the stop panel.

## Result against the current bundle (dataset `14449ac53b0d12b4`, 27 Sep – 25 Oct)

Route window audit (`npm run audit:timetable`): 20 cases, of which 6 fall within coverage (all Sunday 27 September).

| | Cases |
| --- | --- |
| Match the operator PDF exactly | 4 |
| Differ, with a cited later operator publication (explained) | 2 |
| Differ without explanation | 0 |
| Not checkable: date before the bundle begins | 14 |

So the BODS-derived timetable reproduces the Sunday results obtained from the operator's own feed on 26 September, including the two known PDF differences on routes 17 and 21. The Thursday, Friday and Saturday cases (24–26 September) are now in the past and can no longer be compared with this bundle. Their earlier results stand in [the 26 September audit](timetable-audit-2026-09-26.md).

Last-departure audit (`npm run audit:last-departures`): 19 cases. Six Sunday 27 September cases match the operator's boards; the other 13 are unverified (see below).

## Sunday 27 September readings

The operator's stop boards were read at 18:44 BST on Sunday 27 September from the owner's own computer (the build environment cannot reach the site) and recorded as nine dated cases.

| Stop | Route → destination | Board | Timetable | Result |
| --- | --- | --- | --- | --- |
| Kendrick Student Village (039026610001) | 21 → Lower Earley | 03:04 Mon | 03:04 Mon | Match |
| Kendrick Student Village (039026610002) | 21 → Central Reading | 02:46 Mon | 02:46 Mon | Match |
| Kendrick Student Village (039026610002) | 21 → Reading Station | 03:46 Mon | 03:46 Mon | Match |
| Blagrave Street (039028150003) | 14 → Woodley on the board | 23:00 | 23:00 | Match (time) |
| Blagrave Street (039028150003) | 13 → Woodley on the board | 22:30 | 22:30 | Match (time) |
| Blagrave Street (039028150004) | 20 → Reading University | 23:15 | 23:15 | Match |
| Blagrave Street (039028150002) | 11 → Coley Park | 22:46, board cut off at 23:42 | 22:46 | Unverified |
| Blagrave Street (039028150002) | 17 → Wokingham Road | cut off at 23:42 | 03:46 Mon | Unverified |
| Blagrave Street (039028150004) | 26 → Calcot, Sainsbury's | cut off at 00:50 | 02:50 Mon | Unverified |

Six of six readable cases match, including three after midnight on a 24-hour route. The three unverified cases are on busy stops where the board prints only 30 departures, so the end of the evening was not visible. They need reading later in the evening, when fewer departures remain.

**Destination labels differ at Blagrave Street (039028150003).** The timetable gives every route 13 and 14 trip from this stop the headsign "Reading Station", because the loop ends there. The operator's board shows "Woodley", which is where a passenger boarding here is actually going. The times agree, but the stop panel currently tells people these buses go to Reading Station. GTFS supplies no stop-level headsign for these calls, so correcting it would need a rule (for example, showing the next principal stop on loop routes); that is left as a follow-up rather than guessed at here.

## Cases to verify

The operator's stop boards (`https://www.reading-buses.co.uk/stops/<stop id>`) show only the current service day, so each case has to be read on its own date, ideally in the evening so the board still lists the last few departures.

| Date to read | Stop (id) | Route → destination | Timetable says | Why this case |
| --- | --- | --- | --- | --- |
| Thu 1 Oct | Kendrick Student Village (039026610001) | 21 → Lower Earley | 03:04 Fri | 24-hour route; also closes the open route 21 Thursday windows |
| Thu 1 Oct | Kendrick Student Village (039026610002) | 21 → Central Reading | 02:46 Fri | Opposite direction |
| Fri 2 Oct | Blagrave Street (039028150002) | 11 → Coley Park | 23:46 | Ordinary evening finish |
| Sat 3 Oct | Kendrick Student Village (039026610001) | 21 → Lower Earley | 03:04 Sun | Closes the open route 21 Saturday windows |
| Sat 3 Oct | Blagrave Street (039028150004) | 26 → Calcot, Sainsbury's | 02:50 Sun | Small-hours departure |
| Sun 4 Oct | Blagrave Street (039028150002) | 17 → Wokingham Road | 03:46 Mon | Night service after midnight |
| Sun 4 Oct | Blagrave Street (039028150003) | 14 → Reading Station | 23:00 | Sunday evening finish |
| Mon 5 Oct | Blagrave Street (039028150003) | 13 → Reading Station | 23:30 | Weekday evening finish |
| Mon 5 Oct | Cemetery Junction (039025480001) | 701 → Reading Station | 00:20 Tue | Coach service after midnight |
| Mon 5 Oct | Blagrave Street (039028150001) | 2 → Mortimer | 23:00 | Interurban weekday finish |

For routes 21 and 17 the "last departure" is where one service date hands over to the next, not the end of service; the stop panel says so when the next departure follows within 90 minutes.

## Recording a reference

1. Open the stop board on the listed date and note the last departure for that route and destination.
2. In `tests/fixtures/transport-audit/last-departures.json`, set the case's `reference` to `{"time": "27:04", "kind": "stop-board", "url": "<board URL>", "read": "<ISO time you read it>"}`. Write times after midnight in service-day form (03:04 the next morning is `27:04`).
3. Run `npm run audit:last-departures -- --markdown` and add the table to a dated follow-up section here.

Never fill a reference from GTFS or from the app. If a later dated operator publication shows the reference was wrong, add a `resolution` with its evidence and leave the reference as transcribed. Unexplained discrepancies and cases the timetable cannot answer make the script exit with status 1; unverified cases are reported but do not fail it.

## Limits

- The operator website and GTFS may share an upstream source, so agreement is corroboration rather than independent proof.
- All sampled GTFS departures carry `timepoint=0`, so minute-level agreement is not a guarantee of exact departure times.
- Not covered: public holidays, school-day variants, clock-change nights (25 October is the last date in this bundle), connections between services, and any "last journey home" calculation.
- The Reading station board is live Darwin data and is not part of this timetable audit. Its correctness depends on the provider; the app only reformats it.

## Friday 2 October reading

Read at 22:41 BST on Friday 2 October from the owner's computer. The same board read at 19:00 BST was cut off at 30 departures (last entry 21:46), so the case was left unverified; by 22:41 the board was complete (15 departures).

| Stop | Route → destination | Board | Timetable | Result |
| --- | --- | --- | --- | --- |
| Blagrave Street (039028150002) | 11 → Coley Park | 23:46 (last 11 listed, still marked Scheduled) | 23:46 | Match |

Read late in the evening, a busy board shows the whole rest of the day; read in the early evening it can hide the last departures. Boards should be read after about 22:30.

**A caution about 24-hour routes.** The Kendrick Student Village boards (route 21) also changed between 19:00 and 22:41. At 19:00 the last 21 to Lower Earley was 03:04 and to Central Reading 02:46; at 22:41 the boards listed 05:03 and 05:46 as well. Those later times may belong to Saturday's service rather than Friday's, and the board does not say which service day a time after midnight is on. No Friday Kendrick case was added, because the fixture's service-date rule cannot yet tell the two apart. The existing Saturday case (21, Sat 3 Oct) should be read the same way, late in the evening, and compared with both the 03:04 and the 05:03 times.
