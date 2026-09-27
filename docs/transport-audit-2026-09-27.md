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

Last-departure audit (`npm run audit:last-departures`): 10 cases, all **unverified**. The operator's website was not reachable from the environment that built this release, so no reference times have been recorded yet. Each case already shows what the timetable says, so the check is a straight comparison when someone reads the board.

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
