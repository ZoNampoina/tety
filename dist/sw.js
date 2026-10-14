const CACHE='tety-shell-33c8d8093f1e';

const FILES=['./','./index.html','./style.css','./app.mjs','./storage.mjs','./geo.mjs','./permits.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable.png'];

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async c=>{for(const file of FILES){const r=await fetch(file,{cache:'reload'});if(!r.ok)throw new Error('Préparation incomplète '+file);await c.put(file,r);}})));

self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('tety-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));

self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();if(event.data==='OFFLINE_STATUS')event.waitUntil(caches.open(CACHE).then(async c=>{const found=await Promise.all(FILES.map(f=>c.match(f)));event.ports[0]?.postMessage({ready:found.every(Boolean),version:CACHE});}));});

self.addEventListener('fetch',event=>{

 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;

 if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(async c=>(await c.match('./index.html'))||fetch(event.request)));

 else if(FILES.some(f=>new URL(f,self.location).pathname===url.pathname))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request,{ignoreSearch:true}))||fetch(event.request)));

});

