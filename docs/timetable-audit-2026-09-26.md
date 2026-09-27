# Reading Buses timetable audit — 26 September 2026

The supplied route 14, 17 and 21 PDFs were compared with Mini Reading's bundled timetable calculation. **14 of 20 sampled stop/date/time windows match exactly; six contain differences of two or three minutes.** All 20 windows agree with the original GTFS archive. This sample found source disagreements, not an application conversion error. It does not establish which source matches actual operation.

## Scope and evidence

- Bundled GTFS version: `0c89b6b084c9669f`, coverage 19 September–25 October 2026.
- Content SHA-256: `0c89b6b084c9669f7337581305934fcd0be6f9a986fecf9f98393e72544d8300`.
- Dates sampled: Thursday 24, Friday 25, Saturday 26 and Sunday 27 September 2026. Not every route uses every date.
- 132 expected departures across 20 windows; these are not 132 independent journeys or a whole-network accuracy percentage.
- PDF expectations were manually transcribed from rendered pages, including colour-coded night columns. They were not generated from GTFS.
- [Reference fixture](../tests/fixtures/timetable-audit/reading-2026-09-26.json) records PDF filenames, SHA-256 hashes, page numbers, stop IDs and each expected time. PDFs remain outside the repository.
- [Detailed results](timetable-audit-2026-09-26.json) preserve every comparison and raw-source agreement result.

| Route | Sample | Exact matching windows |
| --- | --- | --- |
| 14 | Blagrave Street EM, clockwise; early and late weekday/Saturday/Sunday | 6/6 |
| 17 | Blagrave Street EO eastbound and Cheapside CW westbound; Thursday/Friday/Saturday/Sunday nights | 7/8 |
| 21 | Kendrick Student Village, both directions; Thursday/Saturday/Sunday nights | 1/6 |

The route 14 file contains routes **13 and 14**. Only its route 14 pages (4–6) are used. Route 17 pages 1 and 4 distinguish Monday–Thursday and Friday night services by colour. Calls that terminate at a stop without onward travel are excluded from boarding departures.

All 132 GTFS departures in this sample carry `timepoint=0` and therefore remain labelled approximate in the application's timetable model. A minute-level source comparison is useful for detecting differences, but must not be presented as a guarantee of exact departure times.

## Discrepancies

Times after midnight below refer to the following civil date, while remaining attached to the listed service day. For example, Sunday 27 September's 00:46 overnight departure is on Monday 28 September. The fixture writes it as `24:46`.

| Service day / stop / direction | Supplied PDF | GTFS and Mini Reading |
| --- | --- | --- |
| Sunday, 17, Blagrave Street EO → Wokingham Road | 00:49, 01:49, 02:49, 03:49 | 00:46, 01:46, 02:46, 03:46 |
| Thursday and Saturday, 21, Kendrick → Lower Earley | 22:02, 22:32, 23:02, 23:32, then 00:02–03:02 hourly | Each is two minutes later: 22:04, 22:34, 23:04, 23:34, then 00:04–03:04 |
| Sunday, 21, Kendrick → Lower Earley | Overnight 00:02–03:02 hourly | Overnight 00:04–03:04; earlier sampled departures agree |
| Thursday and Saturday, 21, Kendrick → Central Reading | 22:16, 22:46, 23:16 | 22:19, 22:49, 23:19; later sampled departures agree |

These four rows describe six discrepant windows. They are differences in published times, not evidence of missing physical services or bus delays.

## Operator website cross-check

Retrieved on 26 September 2026:

- The [route 17 timetable for Sunday 27 September, towards Wokingham Road](https://www.reading-buses.co.uk/services/RBUS/17?date=2026-09-27&direction=inbound) lists Blagrave Street `00:46`, `01:46`, `02:46`, `03:46`, agreeing with GTFS. It also lists a terminating `00:11` call with no College Road/Three Tuns continuation, which is not a boarding departure for this direction.
- The [route 21 timetable for Saturday 26 September, towards Lower Earley](https://www.reading-buses.co.uk/services/RBUS/21?date=2026-09-26&direction=outbound) does not include Kendrick Student Village in its displayed principal-stop rows. It cannot resolve the sampled route 21 differences.
- The operator's route pages still link the supplied [route 17 PDF filename](https://passenger-line-assets.s3.eu-west-1.amazonaws.com/readingbuses/RBUS/17-timetable-20260901-b93a75d4.pdf) and [route 21 PDF filename](https://passenger-line-assets.s3.eu-west-1.amazonaws.com/readingbuses/RBUS/21-timetable-20250901-6b3c0712.pdf). This confirms the linked filenames, not that the downloaded bytes were hash-compared or that the PDFs override GTFS.

Effective dates were not established from the document contents. In particular, the `20250901` filename is insufficient evidence to dismiss route 21's PDF as obsolete. The web timetable and GTFS may share an upstream source, so their agreement is corroboration rather than independent proof of operational correctness.

## Follow-up — 27 September 2026

Two of the six discrepant windows are now resolved in favour of GTFS, using operator publications for the same stop and service day. The PDF expectations are unchanged; each resolved case carries a `resolution` with its evidence in the fixture, and the audit reports it as `explained` rather than failing.

| Case | Evidence | Status |
| --- | --- | --- |
| Sunday, 17, Blagrave Street EO | The operator's dated route 17 web timetable for 27 September lists 00:46–03:46, as recorded above. | Resolved: PDF superseded |
| Sunday, 21, Kendrick → Lower Earley | The operator's live [stop board for Kendrick Student Village (adj)](https://www.reading-buses.co.uk/stops/039026610001), read on Sunday 27 September, lists 23:02, 23:32, then 00:04–03:04 hourly. That matches GTFS and contradicts the PDF's 00:02–03:02. | Resolved: PDF superseded |
| Thursday and Saturday, 21, both directions (four windows) | Not yet checked on a matching day. The stop board accepts no date and shows only the current service day. | Open |

Supporting context for the four open windows, which is not enough to close them on its own:

- The operator's route 21 page now labels the supplied PDF "PDF Timetable claret 21 (From Mon 1st Sep 2025)". It is last year's edition, not merely a file with 2025 in its name.
- The dated route 21 web timetable for Thursday 1 October 2026, towards Lower Earley, agrees with GTFS at every principal stop after 21:30 (for example St Mary's Butts 21:55, Reading Station 22:00, UoR Whiteknights House 22:11, Marefield 22:22). Kendrick Student Village is not a principal stop there, so this does not test its time directly.
- The inbound web timetable could not be read, because the page returned the outbound direction.

To close them, read the two Kendrick stop boards (`039026610001` towards Lower Earley, `039026610002` towards Central Reading) during a Thursday or Saturday and add a `resolution` to the matching cases only if the board agrees with GTFS. The operator's web pages and GTFS may share an upstream source, so agreement is corroboration rather than independent proof.

## Repeating the check

```sh
npm run audit:timetable -- --raw raw/reading-gtfs.zip
```

The script compares PDF expectations with the same `scheduledDepartures` function used by the application. With `--raw`, it also verifies the archive content hash and independently selects raw GTFS trips using calendars, exceptions, stop sequences and boarding restrictions. It compares trip IDs, sequences and service-day seconds against the bundled results.

For machine-readable output without npm's command banner:

```sh
node --import tsx scripts/audit-timetable.ts --raw raw/reading-gtfs.zip > audit-results.json
```

**Exit status 1 is expected for this snapshot**, because four PDF comparisons remain discrepant without a cited resolution. Resolved cases are still listed under `discrepant` and counted as `explained`. This is an explicit source audit, separate from the passing application test suite. Omitting `--raw` performs only the PDF-versus-bundle comparison. Dates outside a replacement bundle's coverage are rejected; update the dated fixture and verify its reference sources before auditing a new period. Do not regenerate expected times from GTFS to make this check pass.

## Release implications and remaining checks

1. Keep the source discrepancies visible in the audit. Do not hard-code PDF times over GTFS. Resolve route 21 through a dated official stop timetable or operator clarification before claiming that sample is verified.
2. Use **late/night scheduled departures** for overnight routes such as 17 and 21. A finite search window's final result does not establish the last bus of the night. Show the selected window, destination, service date and approximate/scheduled status.
3. Expand coverage before a last-departure release: additional stops and branches, calendar exceptions, school-day distinctions, clock-change boundaries, and cases where the first call after midnight belongs to the previous service day. Existing automated edge-case tests are useful but are not independent operator-reference checks.

This audit did not validate actual running, cancellations, live predictions, all routes/stops, public-holiday operation, walking connections or a last viable journey home. No production timetable or application behaviour was changed.
