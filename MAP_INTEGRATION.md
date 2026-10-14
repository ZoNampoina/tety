# Tety map controller

Include `vendor/leaflet.css`, `map.css`, and `vendor/leaflet.js` in index.html. The script must precede the app module. Cache those files plus map.mjs in the app shell. No remote raster basemap belongs in the service-worker cache.

```js
import {mapMarkup,mountMap} from './map.mjs';
app.innerHTML = mapMarkup({permits,observations,missionId,mapPermit,position});
mapController = mountMap(app, {
  permits, observations, missionId, mapPermit, position,
  readSetting: id => state.settings.find(s=>s.id===id)?.value,
  readSettings: () => state.settings,
  saveSetting: async (id,value) => { await db.put('settings',{id,value}); },
  onSelectPermit: id => { state.mapPermit=id; },
  onPermit: id => { /* route to permit fiche */ },
  onObservation: id => { /* route to observation, including photos */ },
  onNewPoint: ({lat,lng,source,accuracy}) => { /* create draft manual map point */ },
  onPosition: position => { state.position=position; },
  notify
});
```

Call `mapController.destroy()` BEFORE rerendering or leaving the map. It clears geolocation watch, all UI and global event listeners, map handlers and renderer, aborts a pending pack request, and preserves a paused track. Await `mapController.ready` in UI tests. `updatePosition(position, true)` or `updatePosition(position,{center:true})` updates the GPS accuracy circle and recenters.

The map includes its own `#map-permit` selector. Do not create another one in app.mjs. Its change stops propagation and `onSelectPermit` only needs to persist the app's selection; no rerender is required. Requests for GPS are explicit. Traces pause when the document becomes hidden and require manual resume.

Tracks and map packs use the existing exportable `settings` store. Tracks restore by their `missionId`, including after an archive import has remapped a conflicting mission without changing the setting key. The current mission's merged tracks save to `map-tracks:<missionId>`. GPX separates resumed segments and direct distances do not join a pause gap.

## Basemaps and attribution

- Plan: interactive visible tiles from [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/), with required attribution and Referer. No prefetch or tile pack.
- Satellite: the public [NASA GIBS WMTS](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`, mosaic year **2000**, source Landsat 30 m, WebMercator max native level12 (~38m/pixel at equator). Its date remains prominent in the selector and status; it is not current high resolution imagery. The endpoint/date/matrix are from GIBS WMTS capabilities. [Primary WELD guide](https://lpdaac.usgs.gov/documents/2086/GWELD_User_Guide_V32.pdf).
- Relief: interactive [OpenTopoMap](https://opentopomap.org/about), OpenStreetMap + SRTM with CC-BY-SA attribution. No prefetch or offline tile export.

Esri World Imagery was excluded: [Esri's current summary](https://goto.arcgis.com/termsofuse/viewsummary) requires Esri software or an ArcGIS Online subscription. Tety does not add accounts or subscriptions.

## Offline preparation

The explicit preparation button downloads vector OSM data for each visible permit plus roughly2km margin through [Overpass](https://overpass-api.de/). One sequential bounded request per AERP,30s server timeout,40s client deadline,8MiB client maximum and15000 features. [Public-instance usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). Data include roads, water, places and tagged protected boundary ways/relation members. No place, road, or area is inferred from permit metadata. Incomplete protected relation parts are lines and are not assembled into invented polygons.

Pack records preserve extraction date, source date if supplied, bounding box, OSM identifiers and [ODbL1.0](https://opendatacommons.org/licenses/odbl/1-0/) attribution/license. They work offline after local preparation, independently of remote tiles. Their bounded geographic coverage is drawn as a dashed rectangle. Missing OSM objects remain missing; prepared coverage does not certify completeness. Protected OSM objects are explicitly not an official BCMM protected-area overlay.

Meaningful tests: `node --test tests/map.test.mjs`. They cover real42278hole, OSMlon normalization, bounded extraction, incomplete/oversized/aborted response rejection, malformed pack validation, GPX segments and conflicted mission track restoration. Root should add this suite to package.json and retain browser tests for destroy/revisit, offline prepared packs, and simulated GPS.

Live service verification on2026-10-14: the main Overpass status endpoint responded200, but data requests produced406, transportEOF or timeout; the listed Private.coffee instance timed out and VKMaps returned504. No usable actual vector extract was obtained or bundled. The browser persistence test verifies prepared OSM fixtures only. Preparation fails with a French explanation while preserving old packs and observations; users must obtain a successful response before a sector becomes ready offline. Tety always retains its local indicative permit geometry. No paid account or undocumented proxy was added.
