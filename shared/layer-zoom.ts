// One place for the zoom level at which each kind of thing appears, and for the hard limits on how much is drawn at
// once. The map allows zoom 11 (the whole area) to 19. Anything that is only readable close up starts later; things
// that matter across town (routes, buses, fuel, gauges, flood areas, roadworks) are available from the start.
// A value here is a rule that other code reads, so changing one changes the map; tests/layer-zoom.test.ts keeps the
// table consistent (labels never start before the points they label).
export const LAYER_ZOOM={
 /** Vector basemap: 3D building outlines are drawn by MapLibre below this, by Three.js at and above it. */
 buildings3d:14,
 roadLabels:15,
 busLabels:13,
 routeLabels:13,
 riverGaugeLabels:13.5,
 busStops:15,
 busStopLabels:17,
 /** Food premises: individual points, then their rating numbers. Below `foodPoints` the layer is not drawn. */
 foodPoints:12,
 foodLabels:16,
 cameras:15,
 /** Speed-limit badges (DOM), thinned to one per 32 px cell, then the 3D sign posts a little closer in. */
 signBadges:15.7,
 signs3d:16,
 /** Below this, only road closures get a pin; ordinary works are small and would crowd the town-wide view. */
 roadworksAllKinds:13,
} as const;
/** Hard limits that keep one frame's work bounded whatever the feeds return. */
export const RENDER_BUDGET={
 /** DOM markers (roadwork pins, sign badges, cameras) on screen at once. */
 domMarkers:160,
 /** Three.js buildings are cut into chunks; this many stay loaded. */
 buildingChunks:80,
 /** Instanced buses, and separately trains, drawn at once. */
 vehiclesPerKind:512,
 /** Instanced train cars drawn at once (a train is several cars). */
 trainCars:1024,
} as const;
/** Pairs where the first (a label) must not appear before the second (the point it labels). */
export const LABEL_AFTER_POINT:[keyof typeof LAYER_ZOOM,keyof typeof LAYER_ZOOM][]=[['busStopLabels','busStops'],['foodLabels','foodPoints'],['signs3d','signBadges']];
