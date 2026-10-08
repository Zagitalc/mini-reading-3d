# Offline use

The app saves what you have already looked at, so it still opens with no connection (a train tunnel, poor signal, flight mode). It works through a small service worker, `public/sw.js`, which only runs on the published site (HTTPS) and never in the dev server.

## What is saved
- **The app itself.** Every script and style in the build is saved the first time the worker installs, plus the page.
- **Map tiles, building chunks and timetable files** you view, as you view them. The whole map is 551 tiles (about 67 MB), so a returning visitor keeps every tile they have seen; the limits are 600 tiles, 500 building chunks and 600 timetable files, oldest removed first.
- **Fonts, and the daily data files** (stop index, features, rail corridors and so on). These are fetched from the network first and the saved copy is used when the network does not answer within six seconds.

## What is never saved
Anything under `/api/`: buses, trains, traffic, weather, fuel, rivers, history. The worker does not touch those requests at all, so a stale price can never look current. Offline, the live layers show their usual "unavailable" state and a banner says so.

## Timetables
Timetable files live in a folder named for their snapshot, so a saved file never changes under the same address. Each stop already states the dates its timetable covers ("Timetable through 25 Oct", "expired ...") using the device clock, offline or not. Saved timetables that have expired say so in the same way.

## Looking after it
- Source & freshness panel > "Saved on this device" shows what is stored and has "Clear saved map data".
- Changing the cache rules: edit `classify` in `public/sw.js`, and raise `VERSION` if old entries could be wrong (old caches are deleted on activation).
- To switch it off for everyone, publish a `sw.js` that calls `registration.unregister()` and clears the `mr-` caches. The page itself is always fetched from the network first, so a broken release cannot trap visitors on an old copy for long.
- Browsers driven by test tools skip the worker unless the address has `?sw=on`, because it would stand between the page and the test's fake responses. `npm run test:offline-browser` serves `dist/` itself, so run `npm run build` first.
