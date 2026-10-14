import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {convertOverpass,packBounds,containsBounds,groupContours,overpassQuery,fetchOfflinePack,validatePack,MAX_PACK_BYTES,distanceAlong,trackGPX,mapMarkup,restoreTracks,mapErrorMessage} from '../dist/map.mjs';
const permits=JSON.parse(await readFile(new URL('../dist/permits.json',import.meta.url),'utf8'));
const fixture={osm3s:{timestamp_osm_base:'2026-10-14T10:00:00Z'},elements:[
  {type:'node',id:1,lat:-20.4,lon:48.27,tags:{place:'village',name:'Test village'}},
  {type:'way',id:2,tags:{highway:'track'},geometry:[{lat:-20.4,lon:48.27},{lat:-20.41,lon:48.28}]},
  {type:'way',id:3,tags:{natural:'water'},geometry:[{lat:-20.4,lon:48.27},{lat:-20.41,lon:48.28},{lat:-20.42,lon:48.27},{lat:-20.4,lon:48.27}]},
  {type:'relation',id:4,tags:{boundary:'protected_area'},members:[{type:'way',geometry:[{lat:-20.4,lon:48.27},{lat:-20.41,lon:48.28}]}]}
]};
test('OSM places normalize lon and retain real geometry without filling incomplete boundaries',()=>{
  const converted=convertOverpass(fixture);
  assert.equal(converted.features.length,4);
  assert.deepEqual(converted.features[0].geometry,{type:'Point',coordinates:[48.27,-20.4]});
  assert.equal(converted.features[2].geometry.type,'Polygon');
  assert.equal(converted.features[3].geometry.type,'LineString');
  assert.throws(()=>convertOverpass({...fixture,remark:'Query timed out'}),/complet/);
});
test('corrected 42278 keeps its hole and separate outer contours stay separate',()=>{
  const groups=groupContours(permits.find(p=>p.id==='42278'));
  assert.equal(groups.length,1);assert.equal(groups[0].length,2);
  const square=(lat,lng)=>[{lat,lng},{lat:lat+1,lng},{lat:lat+1,lng:lng+1},{lat,lng:lng+1},{lat,lng}];
  assert.equal(groupContours({contours:[square(0,0),square(5,5)],contourKinds:['outer','outer']}).length,2);
});
test('offline bounds are bounded, invalid geometry is rejected, query includes only needed features',()=>{
  const bounds=packBounds(permits[3]);
  assert(containsBounds(bounds,{lat:-20.4,lng:48.27}));
  assert(!containsBounds(bounds,{lat:0,lng:0}));
  assert.throws(()=>packBounds({bounds:{minLat:0,maxLat:2,minLng:0,maxLng:2}}),/vaste/);
  assert.match(overpassQuery(bounds),/timeout:30/);assert.match(overpassQuery(bounds),/node\["place"\]/);
  assert.doesNotMatch(overpassQuery(bounds),/tile|imagery/);
});
test('prepared OSM pack records source, date, license and rejects malformed imported data',async()=>{
  let request;
  const pack=await fetchOfflinePack(permits[3],{fetchImpl:async(url,options)=>{request={url,options};return new Response(JSON.stringify(fixture),{status:200});}});
  assert.equal(request.options.method,'POST');assert.match(request.url,/overpass-api/);
  assert.equal(pack.license,'ODbL 1.0');assert.equal(pack.sourceDate,fixture.osm3s.timestamp_osm_base);
  assert(validatePack(pack,'42278'));assert(!validatePack(pack,'41914'));
  const corrupted=structuredClone(pack);corrupted.data.features[0].geometry.coordinates=[999,0];assert(!validatePack(corrupted,'42278'));
});
test('oversized and aborted downloads do not produce a ready pack',async()=>{
  await assert.rejects(fetchOfflinePack(permits[3],{fetchImpl:async()=>new Response('{}',{headers:{'content-length':String(MAX_PACK_BYTES+1)}})}),/volumineux/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(fetchOfflinePack(permits[3],{signal:abort.signal,fetchImpl:async(_url,{signal})=>{signal.throwIfAborted();}}),e=>e.name==='AbortError');
});
test('measurement and GPX export keep finite original positions and escape names',()=>{
  const points=[{lat:0,lng:0,at:'2026-10-14T00:00:00Z'},{lat:0,lng:0.01,at:'2026-10-14T00:01:00Z'}];
  assert(Math.abs(distanceAlong(points)-1111.95)<1);
  const gpx=trackGPX({name:'A & B <test>',points});assert.match(gpx,/A &amp; B &lt;test&gt;/);assert.match(gpx,/lon="0.01"/);
  assert.doesNotMatch(trackGPX({points:[{lat:NaN,lng:0}]}),/NaN/);
  const split=points.map((p,i)=>({...p,segment:i}));assert.equal(distanceAlong(split),0);assert.match(trackGPX({points:split}),/<\/trkseg><trkseg>/);
  assert.match(mapMarkup({permits}),/Préparer les AERP affichés/);
});
test('tracks imported under conflicting mission setting keys restore by actual missionId and deduplicate',()=>{
  const point={lat:-20.4,lng:48.27};
  const a={id:'walk1',missionId:'mission-imported',points:[point],state:'paused',startedAt:'2026-10-14T00:00:00Z'};
  const settings=[{id:'map-tracks:original-mission',value:{version:1,tracks:[a]}},{id:'map-tracks:mission-imported',value:{version:1,tracks:[{...a,points:[point,point],state:'complete'},{...a,id:'walk2',missionId:'another-mission'}]}}];
  const restored=restoreTracks(settings,'mission-imported');assert.equal(restored.length,1);assert.equal(restored[0].points.length,2);assert.equal(restored[0].state,'complete');
});
test('network failures explain retry and preservation in French',()=>{assert.match(mapErrorMessage(new TypeError('network error')),/service cartographique ne répond pas/);assert.match(mapErrorMessage(new TypeError('Failed to fetch')),/conservés/);});
test('a nonresponding map server times out and removes its cancellation listener',async()=>{
  const controller=new AbortController();let added=0,removed=0;
  const add=controller.signal.addEventListener.bind(controller.signal),remove=controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener=(...args)=>{added++;return add(...args);};controller.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
  await assert.rejects(fetchOfflinePack(permits[3],{signal:controller.signal,timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}),e=>e.name==='TimeoutError');
  assert.equal(added,1);assert.equal(removed,1);
});
