import {haversine, daysRemaining} from './geo.mjs';
import * as db from './storage.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const MAX_PACK_BYTES = 8 * 1024 * 1024;
export const MAX_PACK_FEATURES = 15000;
export const MAX_TRACK_POINTS = 10000;
export const PERMIT_COLORS = ['#087e70', '#b75f1f', '#6355b5', '#ce3e65'];
const PACK_PREFIX = 'map-pack:';
const attribution = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a>';
export const BASEMAPS = Object.freeze({
  plan: {label:'Plan', url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxNativeZoom:19, attribution},
  satellite: {label:'Satellite · Landsat 2000', url:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/GoogleMapsCompatible_Level12/{z}/{y}/{x}.jpeg', maxNativeZoom:12, attribution:'<a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noopener">NASA GIBS · Landsat/WELD · mosaïque annuelle 2000 · résolution source 30 m</a>'},
  relief: {label:'Relief', url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', maxNativeZoom:17, attribution:attribution+' · SRTM · <a href="https://opentopomap.org/about" target="_blank" rel="noopener">OpenTopoMap (CC-BY-SA)</a>'}
});

export function packBounds(permit, margin = 0.02) {
  const b = permit?.bounds;
  if (!b || !['minLat','maxLat','minLng','maxLng'].every(k => Number.isFinite(b[k])) || b.minLat > b.maxLat || b.minLng > b.maxLng) throw new Error('Périmètre sans coordonnées valides.');
  const result = {minLat:b.minLat-margin,maxLat:b.maxLat+margin,minLng:b.minLng-margin,maxLng:b.maxLng+margin};
  if (result.maxLat-result.minLat > 1 || result.maxLng-result.minLng > 1 || result.minLat < -85 || result.maxLat > 85 || result.minLng < -180 || result.maxLng > 180) throw new Error('Secteur trop vaste : préparez un permis à la fois.');
  return result;
}
export function containsBounds(bounds, point) {
  return Boolean(bounds && validPosition(point) && point.lat >= bounds.minLat && point.lat <= bounds.maxLat && point.lng >= bounds.minLng && point.lng <= bounds.maxLng);
}
export function validPosition(p) {return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180;}
export function distanceAlong(points = []) {return points.slice(1).reduce((sum, p, i) => sum + (validPosition(p) && validPosition(points[i]) && (p.segment??0)===(points[i].segment??0) ? haversine(points[i].lat,points[i].lng,p.lat,p.lng) : 0), 0);}
function insideRing(p, ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if ((a.lat>p.lat)!==(b.lat>p.lat) && p.lng < (b.lng-a.lng)*(p.lat-a.lat)/(b.lat-a.lat)+a.lng) inside=!inside;
  }
  return inside;
}
/** Preserve separate blocks and genuine holes when rendering indicative contours. */
export function groupContours(permit) {
  const rings = (permit.contours || []).filter(r=>r.length>=4 && r.every(validPosition));
  const kinds = permit.contourKinds || [];
  if (!kinds.length) return rings.map(r=>[r]);
  const groups = rings.map((ring,i)=>({ring,kind:kinds[i]})).filter(r=>r.kind!=='hole').map(r=>[r.ring]);
  rings.forEach((ring,i)=>{if(kinds[i]==='hole'){const owner=groups.find(g=>insideRing(ring[0],g[0]));if(owner)owner.push(ring);}});
  return groups;
}
export function overpassQuery(bounds) {
  const bb = [bounds.minLat,bounds.minLng,bounds.maxLat,bounds.maxLng].map(n=>Number(n).toFixed(6)).join(',');
  return `[out:json][timeout:30][maxsize:33554432];(node["place"](${bb});way["highway"](${bb});way["waterway"](${bb});way["natural"="water"](${bb});way["boundary"="protected_area"](${bb});way["leisure"="nature_reserve"](${bb});relation["boundary"="protected_area"](${bb}););out geom;`;
}
function classify(tags={}) {return tags.highway?'roads':tags.waterway||tags.natural==='water'?'water':tags.boundary==='protected_area'||tags.leisure==='nature_reserve'?'protected':tags.place?'places':null;}
export function convertOverpass(data) {
  if (!data || !Array.isArray(data.elements) || data.remark) throw new Error('Le serveur n’a pas renvoyé un extrait complet. Réessayez plus tard.');
  const features=[];
  for(const el of data.elements) {
    const kind=classify(el.tags); if(!kind)continue;
    const properties={kind, name:String(el.tags?.name||'').slice(0,160), osmId:`${el.type}/${el.id}`};
    if(el.type==='node' && validPosition({lat:el.lat,lng:el.lon}))features.push({type:'Feature',properties,geometry:{type:'Point',coordinates:[el.lon,el.lat]}});
    const geometries=el.type==='way'?[el.geometry]:(el.members||[]).map(m=>m.geometry);
    for(const geometry of geometries) {
      if(!Array.isArray(geometry)||geometry.length<2)continue;
      const coords=geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180).map(p=>[p.lon,p.lat]);
      // Only explicit closed OSM water ways are filled; incomplete relation members remain lines.
      const closed=coords.length>=4 && coords[0][0]===coords.at(-1)[0] && coords[0][1]===coords.at(-1)[1];
      if(coords.length>=2)features.push({type:'Feature',properties,geometry:kind==='water'&&closed?{type:'Polygon',coordinates:[coords]}:{type:'LineString',coordinates:coords}});
    }
    if(features.length>MAX_PACK_FEATURES)throw new Error('Extrait trop volumineux pour le téléphone.');
  }
  return {type:'FeatureCollection',features};
}
export function validatePack(pack, permitId) {
  if (!pack || pack.version!==1 || String(pack.permitId)!==String(permitId) || typeof pack.preparedAt!=='string' || !Number.isFinite(Date.parse(pack.preparedAt)) || !pack.bounds || !Array.isArray(pack.data?.features) || pack.data.features.length>MAX_PACK_FEATURES) return false;
  try {packBounds({bounds:pack.bounds},0);} catch {return false;}
  if(new TextEncoder().encode(JSON.stringify(pack)).length>MAX_PACK_BYTES)return false;
  let coordinateCount=0;
  const coord=p=>{coordinateCount++;return coordinateCount<=150000 && Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;};
  return pack.data.type==='FeatureCollection'&&pack.data.features.every(f=>{
    if(f.type!=='Feature'||!['roads','water','places','protected'].includes(f.properties?.kind)||typeof f.properties.name!=='string'||f.properties.name.length>160)return false;
    const g=f.geometry;
    if(g?.type==='Point')return coord(g.coordinates);
    if(g?.type==='LineString')return Array.isArray(g.coordinates)&&g.coordinates.length>=2&&g.coordinates.every(coord);
    if(g?.type==='Polygon')return Array.isArray(g.coordinates)&&g.coordinates.length>0&&g.coordinates.every(r=>Array.isArray(r)&&r.length>=4&&r.every(coord)&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]);
    return false;
  });
}
export async function fetchOfflinePack(permit, {fetchImpl=globalThis.fetch,signal,timeoutMs=40000}={}) {
  const bounds=packBounds(permit);
  const request=new AbortController();let timedOut=false;
  const cancel=()=>request.abort(signal?.reason);
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;request.abort();},Math.min(45000,Math.max(1,Number(timeoutMs)||40000)));
  try{
  const response=await fetchImpl('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:overpassQuery(bounds)}),signal:request.signal});
  if(!response.ok)throw new Error(`Préparation indisponible (${response.status}). Le schéma local reste utilisable.`);
  const declared=Number(response.headers?.get?.('content-length'));
  if(declared>MAX_PACK_BYTES)throw new Error('Extrait trop volumineux pour le téléphone.');
  let text='';
  if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_PACK_BYTES){await reader.cancel();throw new Error('Extrait trop volumineux pour le téléphone.');}chunks.push(value);}}finally{reader.releaseLock();}
    const joined=new Uint8Array(bytes);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.byteLength;}text=new TextDecoder().decode(joined);
  }else{text=await response.text();if(new TextEncoder().encode(text).length>MAX_PACK_BYTES)throw new Error('Extrait trop volumineux pour le téléphone.');}
  const raw=JSON.parse(text),data=convertOverpass(raw);
  const pack={version:1,permitId:String(permit.id),bounds,preparedAt:new Date().toISOString(),sourceDate:raw.osm3s?.timestamp_osm_base||null,source:'OpenStreetMap / Overpass',license:'ODbL 1.0',licenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',data};
  if(!validatePack(pack,permit.id))throw new Error('Extrait cartographique invalide.');
  return pack;
  }catch(error){if(timedOut){const failure=new Error('Le service cartographique met trop de temps à répondre. Réessayez plus tard.');failure.name='TimeoutError';throw failure;}throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export function trackGPX(track) {
  let previous=null;
  const points=(track.points||[]).filter(validPosition).map(p=>{const segment=p.segment??0,separator=previous!==null&&previous!==segment?'</trkseg><trkseg>':'';previous=segment;return separator+`<trkpt lat="${p.lat}" lon="${p.lng}">${p.at?`<time>${esc(p.at)}</time>`:''}</trkpt>`;}).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Tety" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(track.name||'Trace Tety')}</name><trkseg>${points}</trkseg></trk></gpx>`;
}
/** Imported mission conflicts may change missionId inside tracks but leave setting keys intact. */
export function restoreTracks(settings=[],missionId=null) {
  const byId=new Map();
  for(const setting of settings){
    if(!setting?.id?.startsWith('map-tracks:')||setting.value?.version!==1||!Array.isArray(setting.value.tracks))continue;
    for(const track of setting.value.tracks){
      if((track?.missionId??null)!==(missionId??null)||typeof track.id!=='string'||!Array.isArray(track.points)||track.points.length>MAX_TRACK_POINTS||!track.points.every(validPosition))continue;
      const existing=byId.get(track.id);
      if(!existing||track.points.length>existing.points.length||track.state==='complete'&&existing.state!=='complete')byId.set(track.id,track);
    }
  }
  return [...byId.values()].sort((a,b)=>String(a.startedAt||'').localeCompare(String(b.startedAt||'')));
}
const distanceText=n=>n>=1000?`${(n/1000).toFixed(2)} km`:`${Math.round(n)} m`;
const bytesText=n=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} Mo`:`${Math.ceil(n/1024)} Ko`;
export function mapErrorMessage(error){
  if(error?.name==='TypeError'||/network|fetch|internet|connection/i.test(error?.message||''))return 'Le service cartographique ne répond pas. Vérifiez la connexion puis réessayez. Les extraits déjà préparés et vos observations sont conservés.';
  if(error?.name==='TimeoutError')return 'Le service cartographique met trop de temps à répondre. Réessayez plus tard. Les extraits précédents sont conservés.';
  return error?.message||'Préparation interrompue. Les extraits précédents sont conservés.';
}

export function mapMarkup({permits=[], mapPermit='',missionId}={}) {
  return `<section class="field-map" aria-label="Carte de reconnaissance"><div class="field-map-heading"><div><h1>Carte de terrain</h1><p>Périmètres indicatifs et observations${missionId?' de la mission':''}.</p></div></div>
  <div class="field-map-selection"><label>AERP<select id="map-permit"><option value="">Les quatre AERP</option>${permits.map(p=>`<option value="${esc(p.id)}" ${String(mapPermit)===String(p.id)?'selected':''}>AERP ${esc(p.id)}</option>`).join('')}</select></label><label>Fond de carte<select data-map-base><option value="local">Local hors ligne</option><option value="plan">Plan</option><option value="satellite">Satellite · Landsat 2000</option><option value="relief">Relief</option></select></label><button type="button" data-map-action="gps">Me situer</button><button type="button" data-map-action="fullscreen">Plein écran</button></div>
  <div class="field-map-shell"><div class="field-map-canvas" data-field-map tabindex="0" aria-label="Carte tactile : déplacer et zoomer"></div><div class="field-map-status" role="status" data-map-status>Schéma local disponible</div><div class="field-map-detail" data-map-detail hidden></div></div>
  <div class="field-map-tools"><button type="button" data-map-action="recenter">Recentrer</button><button type="button" data-map-action="new">Placer un point</button><button type="button" data-map-action="measure">Mesurer</button><button type="button" data-map-action="clear-measure" hidden>Effacer la mesure</button></div>
  <details class="field-map-layers"><summary>Couches et lisibilité</summary><div class="field-map-checkboxes">${[['permits','Périmètres',true],['cells','Carrés',false],['observations','Observations',true],['roads','Routes et pistes',true],['water','Rivières et eau',true],['places','Localités',true],['protected','Zones protégées OSM',false]].map(([key,label,checked])=>`<label><input type="checkbox" data-map-layer="${key}" ${checked?'checked':''}>${label}</label>`).join('')}</div><label>Transparence des permis <input type="range" data-map-opacity min="0" max="0.5" value="0.12" step="0.02"></label><p>Les couches routes, eau, localités et zones protégées s’affichent dans les extraits préparés. Les zones OSM ne remplacent pas les données officielles BCMM.</p></details>
  <details class="field-map-packs"><summary>Préparer avant la descente</summary><p>Extrait vectoriel du permis et de ses environs : routes, eau et localités OSM. Les images satellite et les fonds en ligne ne sont pas téléchargés.</p><div data-map-packs></div><button type="button" data-map-action="prepare">Préparer les AERP affichés</button><p data-map-pack-message role="status"></p><p>Une carte préparée peut omettre des pistes ou localités non cartographiées. Aucune indication d’accès ou d’autorisation n’est déduite.</p></details>
  <details class="field-map-tracking"><summary>Trace de marche GPS</summary><p>Enregistre uniquement après « Démarrer ». Gardez Tety ouvert : l’enregistrement peut s’interrompre en veille.</p><div class="field-map-tools"><button type="button" data-map-action="track-start">Démarrer</button><button type="button" data-map-action="track-pause" disabled>Pause</button><button type="button" data-map-action="track-stop" disabled>Terminer</button><button type="button" data-map-action="track-export" disabled>Exporter GPX</button></div><p data-map-track-status role="status">Aucune trace enregistrée.</p></details>
  <p class="field-map-warning">Contours reconstruits des CSV : projection et datum non précisés. Le GPS et les limites restent indicatifs. Les mesures sont des distances directes, sans calcul d’itinéraire.</p></section>`;
}

/** Root owns application navigation. This controller owns only this map DOM. */
export function mountMap(container, options={}) {
  const root=container.querySelector('.field-map')||container;
  const L=globalThis.L;
  if(!L){root.querySelector('[data-map-status]').textContent='Le moteur cartographique n’est pas chargé. Rechargez Tety avec le réseau.';return {destroy(){},updatePosition(){}};}
  const permits=options.permits||[],obs=(options.observations||[]).filter(o=>!options.missionId||o.missionId===options.missionId);
  const selected=()=>permits.filter(p=>!String(options.mapPermit||'')||String(p.id)===String(options.mapPermit));
  const colors=new Map(permits.map((p,i)=>[String(p.id),PERMIT_COLORS[i%PERMIT_COLORS.length]]));
  const notify=options.notify||(()=>{}),packs=new Map(),abort=new AbortController(),listeners=[];
  const map=L.map(root.querySelector('[data-field-map]'),{zoomControl:true,attributionControl:true,preferCanvas:false,maxZoom:20,minZoom:3,tap:true}).setView([-21.4,48.1],8);
  L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  const groups=Object.fromEntries(['permits','cells','observations','roads','water','places','protected','gps','measure','track','coverage'].map(k=>[k,L.layerGroup().addTo(map)]));
  let destroyed=false,base='local',tiles=null,mode='',measurePoints=[],track=null,watchId=null,lastPosition=options.position||null,follow=false,trackSaving=Promise.resolve(),preparing=false;
  const trackKey=`map-tracks:${options.missionId||'general'}`;
  let tracks=[];
  const read=options.readSetting||(async id=>(await db.readAll('settings')).find(s=>s.id===id)?.value);
  const save=options.saveSetting||((id,value)=>db.put('settings',{id,value}));
  const bind=(element,event,handler)=>{if(element){element.addEventListener(event,handler);listeners.push(()=>element.removeEventListener(event,handler));}};
  const query=selector=>root.querySelector(selector);
  const setStatus=text=>{if(!destroyed)query('[data-map-status]').textContent=text;};
  const chosen=selected();
  function recenter(){const b=L.latLngBounds([]);selected().forEach(p=>(p.contours||[]).flat().filter(validPosition).forEach(point=>b.extend([point.lat,point.lng])));if(b.isValid())map.fitBounds(b,{padding:[25,25],maxZoom:14});}
  function closeDetail(){query('[data-map-detail]').hidden=true;}
  function detail(html){const el=query('[data-map-detail]');el.innerHTML=html+'<button type="button" data-map-close>Fermer</button>';el.hidden=false;el.querySelector('[data-map-close]').onclick=closeDetail;}
  function permitDetail(p){
    const remaining=daysRemaining(p.expiry),communes=(p.communes||[]).map(c=>c.name).join(', ');
    detail(`<strong>AERP ${esc(p.id)}</strong><p>${esc(p.region||'Région non renseignée')} · ${esc(communes||'Communes non renseignées')}</p><p>${esc(p.count??p.cells?.length??'—')} carrés · validité : ${esc(p.expiry||'non renseignée')}${remaining!==null?` · ${remaining<0?'échue':remaining+' jours'}`:''}</p><p>Limites indicatives. Statut administratif à vérifier.</p><button type="button" data-open-permit>Voir la fiche</button>`);
    query('[data-open-permit]').onclick=()=>options.onPermit?.(String(p.id));
  }
  function observationDetail(o){detail(`<strong>${esc(o.title||'Observation sans titre')}</strong><p>${esc(o.category||'Catégorie non renseignée')} · ${esc(o.permitId?'AERP '+o.permitId:'AERP non renseigné')}</p><p>${esc((o.notes||'').slice(0,160))}</p><p>${o.assetIds?.length||0} pièce(s) jointe(s)</p><button type="button" data-open-observation>Ouvrir les notes et photos</button>`);query('[data-open-observation]').onclick=()=>options.onObservation?.(o.id);}
  function drawPermits(){
    groups.permits.clearLayers();groups.cells.clearLayers();
    for(const p of selected()){
      const color=colors.get(String(p.id)),opacity=Number(query('[data-map-opacity]').value);
      for(const polygon of groupContours(p))L.polygon(polygon.map(r=>r.map(pt=>[pt.lat,pt.lng])),{color,weight:3,fillOpacity:opacity,fillRule:'evenodd'}).bindTooltip(`AERP ${esc(p.id)}`,{permanent:true,direction:'center',className:'field-map-permit-label'}).on('click',()=>{if(!mode)permitDetail(p);}).addTo(groups.permits);
      for(const cell of p.cells||[])if(Array.isArray(cell.polygon)&&cell.polygon.every(validPosition))L.polygon(cell.polygon.map(pt=>[pt.lat,pt.lng]),{color,weight:0.65,fillOpacity:0,interactive:false}).addTo(groups.cells);
    }
  }
  function drawObservations(){groups.observations.clearLayers();for(const o of obs)if(validPosition(o))L.circleMarker([o.lat,o.lng],{radius:7,color:'#fff',weight:2,fillColor:colors.get(String(o.permitId))||'#24342b',fillOpacity:1}).bindTooltip(esc(o.title||'Observation')).on('click',()=>{if(!mode)observationDetail(o);}).addTo(groups.observations);}
  function drawVectors(){
    for(const kind of ['roads','water','places','protected','coverage'])groups[kind].clearLayers();
    for(const p of selected()){
      const pack=packs.get(String(p.id));if(!pack)continue;
      const b=pack.bounds;L.rectangle([[b.minLat,b.minLng],[b.maxLat,b.maxLng]],{color:'#637461',weight:1,dashArray:'5 7',fill:false,interactive:false}).addTo(groups.coverage);
      for(const kind of ['roads','water','places','protected']){
        const features=pack.data.features.filter(f=>f.properties.kind===kind);
        L.geoJSON({type:'FeatureCollection',features},{style:f=>({color:kind==='roads'?'#a76e39':kind==='water'?'#367eab':'#548852',weight:kind==='roads'?2.5:1.7,opacity:.85,fillOpacity:kind==='water'?.12:0,dashArray:kind==='protected'?'5 4':null}),pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:3,color:'#586350',fillOpacity:1}),onEachFeature:(f,l)=>{if(f.properties.name)l.bindTooltip(esc(f.properties.name),kind==='places'?{permanent:true,direction:'right',className:'field-map-place-label'}:{});}}).addTo(groups[kind]);
      }
    }
    if(base==='local')setStatus(selected().every(p=>packs.has(String(p.id)))?'Extraits OSM préparés · hors ligne':'Schéma local · préparez les extraits pour voir routes et localités');
  }
  function packList(){query('[data-map-packs]').innerHTML=selected().map(p=>{const pack=packs.get(String(p.id));return `<div class="field-map-pack"><strong>AERP ${esc(p.id)}</strong><span>${pack?`Prêt hors ligne · ${bytesText(new TextEncoder().encode(JSON.stringify(pack)).length)} · ${new Date(pack.preparedAt).toLocaleDateString('fr-FR')} · ${pack.data.features.length} objets OSM`:'Non préparé'}</span>${pack?`<button type="button" data-pack-delete="${esc(p.id)}">Retirer cet extrait</button>`:''}</div>`;}).join('');query('[data-map-packs]').querySelectorAll('[data-pack-delete]').forEach(button=>button.onclick=async()=>{await save(PACK_PREFIX+button.dataset.packDelete,null);packs.delete(button.dataset.packDelete);drawVectors();packList();});}
  function changeBase(next){
    base=next;if(tiles){map.removeLayer(tiles);tiles=null;}
    query('[data-map-base]').value=base;
    if(next==='local'){map.attributionControl.addAttribution(attribution);drawVectors();return;}
    map.attributionControl.removeAttribution(attribution);
    if(globalThis.navigator?.onLine===false){base='local';query('[data-map-base]').value=base;map.attributionControl.addAttribution(attribution);drawVectors();notify('Sans réseau : affichage du fond local préparé.');return;}
    const provider=BASEMAPS[next];if(!provider)return;
    tiles=L.tileLayer(provider.url,{attribution:provider.attribution,maxNativeZoom:provider.maxNativeZoom,maxZoom:20,subdomains:'abc',keepBuffer:1,referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);
    tiles.on('tileerror',()=>setStatus(`${provider.label} indisponible ici · le fond local reste disponible`));
    setStatus(`${provider.label} · réseau requis · images non téléchargées`);
  }
  function updatePosition(position,centering={}){
    const center=typeof centering==='boolean'?centering:Boolean(centering.center);
    if(destroyed||!validPosition(position))return;lastPosition=position;groups.gps.clearLayers();
    const accuracy=typeof position.accuracy==='number'&&Number.isFinite(position.accuracy)&&position.accuracy>0?position.accuracy:NaN;
    if(Number.isFinite(accuracy)&&accuracy>0)L.circle([position.lat,position.lng],{radius:Math.min(accuracy,100000),color:'#246fd1',weight:1,fillOpacity:.08,interactive:false}).addTo(groups.gps);
    L.circleMarker([position.lat,position.lng],{radius:6,color:'#fff',weight:2,fillColor:'#246fd1',fillOpacity:1}).bindTooltip(`GPS${Number.isFinite(accuracy)?' ± '+Math.round(accuracy)+' m':''}`).addTo(groups.gps);
    if(center||follow)map.setView([position.lat,position.lng],Math.max(map.getZoom(),14));
    options.onPosition?.(position);
  }
  const gpsError=error=>notify(error.code===1?'Accès GPS refusé. Vous pouvez placer un point sur la carte.':'Position GPS indisponible. Réessayez à ciel ouvert.');
  function gps(){if(!navigator.geolocation){notify('GPS indisponible sur cet appareil.');return;}navigator.geolocation.getCurrentPosition(p=>{if(!destroyed)updatePosition({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,at:new Date(p.timestamp).toISOString()},{center:true});},gpsError,{enableHighAccuracy:true,timeout:15000,maximumAge:10000});}
  function modeSet(next){mode=mode===next?'':next;closeDetail();query('[data-map-action="new"]').setAttribute('aria-pressed',String(mode==='new'));query('[data-map-action="measure"]').setAttribute('aria-pressed',String(mode==='measure'));setStatus(mode==='new'?'Touchez la carte pour placer le point. Position choisie sur carte, sans mesure GPS.':mode==='measure'?'Touchez plusieurs positions pour mesurer une distance directe.':base==='local'?'Fond local · contours indicatifs':BASEMAPS[base].label+' · réseau requis');}
  function mapClick(event){
    if(mode==='new'){const point={lat:event.latlng.lat,lng:event.latlng.lng,source:'map',accuracy:null};detail(`<strong>Point choisi sur la carte</strong><p>${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</p><p>Position manuelle ; précision GPS non mesurée.</p><button type="button" data-confirm-point>Créer l’observation ici</button>`);query('[data-confirm-point]').onclick=()=>options.onNewPoint?.(point);modeSet('');query('[data-map-detail]').hidden=false;}
    if(mode==='measure'){measurePoints.push({lat:event.latlng.lat,lng:event.latlng.lng});groups.measure.clearLayers();L.polyline(measurePoints.map(p=>[p.lat,p.lng]),{color:'#bb4537',weight:3,dashArray:'6 5'}).addTo(groups.measure);measurePoints.forEach(p=>L.circleMarker([p.lat,p.lng],{radius:4,color:'#bb4537'}).addTo(groups.measure));setStatus(`Distance directe : ${distanceText(distanceAlong(measurePoints))}`);query('[data-map-action="clear-measure"]').hidden=false;}
  }
  function trackState(){
    const current=track||tracks.at(-1);query('[data-map-track-status]').textContent=current?`${track?.state==='recording'?'Enregistrement en cours':track?.state==='paused'?'En pause':'Dernière trace'} · ${current.points.length} positions · ${distanceText(distanceAlong(current.points))}`:'Aucune trace enregistrée.';
    query('[data-map-action="track-start"]').disabled=track?.state==='recording';query('[data-map-action="track-start"]').textContent=track?.state==='paused'?'Reprendre':'Démarrer';query('[data-map-action="track-pause"]').disabled=track?.state!=='recording';query('[data-map-action="track-stop"]').disabled=!track;query('[data-map-action="track-export"]').disabled=!current?.points?.length;
    groups.track.clearLayers();if(current?.points?.length){const segments=[];let previous=null;for(const p of current.points){if(previous!==(p.segment??0)){segments.push([]);previous=p.segment??0;}segments.at(-1).push([p.lat,p.lng]);}L.polyline(segments,{color:'#2849a0',weight:3}).addTo(groups.track);}
  }
  function persistTrack(){const snapshot={version:1,tracks:[...tracks, ...(track?[{...track,state:'paused'}]:[])]};trackSaving=trackSaving.then(()=>save(trackKey,snapshot)).catch(e=>notify(e.message||'La trace n’a pas été sauvegardée.'));return trackSaving;}
  function stopWatch(){if(watchId!==null){navigator.geolocation?.clearWatch(watchId);watchId=null;}follow=false;}
  function appendPosition(position){
    if(!track||track.state!=='recording'||!validPosition(position))return;
    const last=track.points.at(-1);if(last&&Date.parse(position.at)-Date.parse(last.at)<5000)return;
    if(last&&haversine(last.lat,last.lng,position.lat,position.lng)<3)return;
    if(track.points.length>=MAX_TRACK_POINTS){pauseTrack();notify('Limite de la trace atteinte : terminez et démarrez une nouvelle trace.');return;}
    track.points.push({lat:position.lat,lng:position.lng,accuracy:Number.isFinite(position.accuracy)?position.accuracy:null,at:position.at,segment:track.segment||0});persistTrack();trackState();
  }
  function startTrack(){
    if(!navigator.geolocation){notify('GPS indisponible sur cet appareil.');return;}
    if(!track)track={id:crypto.randomUUID(),name:`Marche ${new Date().toLocaleString('fr-FR')}`,missionId:options.missionId||null,startedAt:new Date().toISOString(),points:[],segment:0};
    else track.segment=(track.segment||0)+1;
    stopWatch();track.state='recording';follow=true;
    watchId=navigator.geolocation.watchPosition(p=>{if(destroyed)return;const position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,at:new Date(p.timestamp).toISOString()};updatePosition(position);appendPosition(position);},e=>{pauseTrack();gpsError(e);},{enableHighAccuracy:true,timeout:20000,maximumAge:5000});persistTrack();trackState();
  }
  function pauseTrack(){stopWatch();if(track){track.state='paused';persistTrack();trackState();}}
  function stopTrack(){stopWatch();if(track){track.endedAt=new Date().toISOString();track.state='complete';tracks.push(track);track=null;persistTrack();trackState();}}
  function exportTrack(){const current=track||tracks.at(-1);if(!current)return;const url=URL.createObjectURL(new Blob([trackGPX(current)],{type:'application/gpx+xml'}));const a=document.createElement('a');a.href=url;a.download=`Tety-trace-${current.startedAt?.slice(0,10)||'GPS'}.gpx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function prepare(){
    if(preparing)return;if(navigator.onLine===false){notify('Reconnectez-vous pour préparer les extraits.');return;}
    preparing=true;const button=query('[data-map-action="prepare"]');button.disabled=true;const message=query('[data-map-pack-message]');
    try{for(const p of selected()){message.textContent=`Préparation AERP ${p.id}…`;const pack=await fetchOfflinePack(p,{signal:abort.signal});if(destroyed)return;await save(PACK_PREFIX+String(p.id),pack);packs.set(String(p.id),pack);packList();drawVectors();}message.textContent='Extraits prêts hors ligne sur cet appareil.';changeBase('local');}catch(e){if(e.name!=='AbortError')message.textContent=mapErrorMessage(e);}finally{preparing=false;if(!destroyed)button.disabled=false;}
  }
  function offline(){changeBase('local');}
  const actions={gps,recenter,new:()=>modeSet('new'),measure:()=>modeSet('measure'),'clear-measure':()=>{measurePoints=[];groups.measure.clearLayers();query('[data-map-action="clear-measure"]').hidden=true;modeSet('');},prepare,'track-start':startTrack,'track-pause':pauseTrack,'track-stop':stopTrack,'track-export':exportTrack,fullscreen:()=>{root.classList.toggle('field-map-expanded');query('[data-map-action="fullscreen"]').textContent=root.classList.contains('field-map-expanded')?'Quitter le plein écran':'Plein écran';setTimeout(()=>{if(!destroyed)map.invalidateSize();},0);}};
  root.querySelectorAll('[data-map-action]').forEach(button=>bind(button,'click',()=>actions[button.dataset.mapAction]?.()));
  bind(query('[data-map-base]'),'change',event=>changeBase(event.target.value));
  bind(query('#map-permit'),'change',event=>{event.stopPropagation();options.mapPermit=event.target.value;options.onSelectPermit?.(event.target.value);closeDetail();drawPermits();drawVectors();packList();recenter();});
  bind(query('[data-map-opacity]'),'input',drawPermits);
  root.querySelectorAll('[data-map-layer]').forEach(input=>{const apply=()=>input.checked?groups[input.dataset.mapLayer].addTo(map):map.removeLayer(groups[input.dataset.mapLayer]);apply();bind(input,'change',apply);});
  bind(window,'offline',offline);bind(document,'visibilitychange',()=>{if(document.hidden&&track?.state==='recording')pauseTrack();});
  map.on('click',mapClick);map.on('dragstart',()=>{follow=false;});
  map.on('moveend',()=>{if(base==='local'&&packs.size){const center=map.getCenter();if(!selected().some(p=>containsBounds(packs.get(String(p.id))?.bounds,{lat:center.lat,lng:center.lng})))setStatus('Hors des secteurs préparés · périmètres seuls');}});
  drawPermits();drawObservations();recenter();changeBase(navigator.onLine===false?'local':'plan');if(lastPosition)updatePosition(lastPosition);
  const ready=(async()=>{
    for(const p of permits){const pack=await read(PACK_PREFIX+String(p.id));if(destroyed)return;if(validatePack(pack,p.id))packs.set(String(p.id),pack);}
    const settings=options.readSettings?await options.readSettings():await db.readAll('settings');if(destroyed)return;tracks=restoreTracks(settings,options.missionId||null);const pending=tracks.findLast(t=>t.state==='paused');if(pending){track={...pending,state:'paused'};tracks=tracks.filter(t=>t.id!==pending.id);}
    drawVectors();packList();trackState();
  })().catch(e=>notify(e.message||'Impossible de charger les extraits locaux.'));
  return {ready,updatePosition,destroy(){if(destroyed)return;pauseTrack();destroyed=true;abort.abort();stopWatch();listeners.forEach(remove=>remove());map.off();map.remove();root.classList.remove('field-map-expanded');}};
}
