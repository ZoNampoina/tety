const CACHE='tety-shell-222a32a010c9';

const FILES=["./","./app.mjs","./fieldwork.css","./fieldwork.mjs","./geo.mjs","./icon-192.png","./icon-512.png","./icon-maskable.png","./icon.svg","./index.html","./interview-export.mjs","./interview-library.mjs","./interview-ui.mjs","./interviews.css","./interviews.mjs","./logo.svg","./manifest.webmanifest","./map.css","./map.mjs","./permits.json","./storage.mjs","./style.css","./terrain-tools.css","./terrain-tools.mjs","./vendor/leaflet-LICENSE.txt","./vendor/leaflet.css","./vendor/leaflet.js","./word-report.mjs"];

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async c=>{for(const file of FILES){const r=await fetch(file,{cache:'reload'});if(!r.ok)throw new Error('Préparation incomplète '+file);await c.put(file,r);}})));

self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('tety-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));

self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();if(event.data==='OFFLINE_STATUS')event.waitUntil(caches.open(CACHE).then(async c=>{const found=await Promise.all(FILES.map(f=>c.match(f)));event.ports[0]?.postMessage({ready:found.every(Boolean),version:CACHE});}));});

self.addEventListener('fetch',event=>{

 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;

 if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(async c=>(await c.match('./index.html'))||fetch(event.request)));

 else if(FILES.some(f=>new URL(f,self.location).pathname===url.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request,{ignoreSearch:true}))||fetch(event.request)));

});

