# Verification — 5 September 2026

## Automated checks

28 tests passed. TypeScript strict compilation and Vite production build passed. npm audit reported no vulnerabilities after removing an unnecessary OSM parser (the actual PBF pipeline uses Python osmium).

Covered behaviours: SIRI parsing; labelled rail position estimation on connected geometry; station dwell; invalid/future/old observations; duplicate and cancellation replay; out-of-bounds removal/re-entry; five-minute expiry; geographic transforms/intersections; closure versus works; point geometry; event cancellation/completion; unknown dates; DST presentation; persistent upsert ordering; SNS URL/signature rejection; disconnected API responses; and full MapLibre style validation.

## Browser checks performed

Used the Codex in-app browser at the local Vite URL. Confirmed:

- Loaded the real vector basemap, Three.js buildings and landmarks.
- Corrected a zoom-expression validation error and explicitly bundled the MapLibre worker; regression test added.
- Searched for Caversham and navigated to it.
- Toggled buildings/cameras and verified visible controls and WebMCP read-back agree.
- Opened the data panel and verified every unconfigured feed is labelled unavailable, with no fabricated live activity.
- Checked a 390 × 844 mobile viewport: search and controls remain usable, layers start collapsed, map remains visible. Restored the normal viewport afterward.
- Navigated among Reading station, Caversham, the university and stadium. The sampled renderer counters showed 12–20 loaded chunks, no failed chunks, and roughly 89–107 resident geometries during these short checks. Chunk counts fell on leaving larger views.
- Short navigation telemetry reported roughly 111–122 FPS on this host. This is **not** a sustained benchmark, a real-mobile measurement or verification of the 45/30 FPS targets across devices.
- Validated all three WebMCP registrations, read-back and navigation/layer actions. Invalid layer input failed without changing map state.

## Not yet verified

Authenticated BODS or National Rail responses, subscription delivery from Street Manager, an authorised traffic bridge, the accuracy of inferred heights, exact landmark architecture, per-vehicle bridge/tunnel elevation, and a sustained loaded-vehicle memory/performance soak. These require external access or further representative hardware/data tests. The current app correctly reports disconnected feeds rather than claiming these checks passed.

A reusable optional Chromium smoke test is included as `npm run test:browser`; run `npx playwright install chromium` first, or set `BROWSER_EXECUTABLE` to an installed Chromium executable. Delivery-time UI validation used CUA instead of this optional script.
