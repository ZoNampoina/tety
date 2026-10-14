import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname} from 'node:path';
const require=createRequire(import.meta.url);
const {getChromium,launchOptions}=require('./browser-runtime.cjs');

test('map persists prepared vectors offline, preserves GPS accuracy and cleans watches on revisit', {skip:process.env.TETY_BROWSER_TESTS!=='1'}, async()=>{
  const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json'};
  const html='<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/vendor/leaflet.css"><link rel="stylesheet" href="/map.css"><script src="/vendor/leaflet.js"></script><main id="app"></main>';
  const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}if(path.includes('..')){res.writeHead(400).end();return;}try{res.writeHead(200,{'Content-Type':types[extname(path)]||'text/plain'}).end(await readFile(new URL('../dist'+path,import.meta.url)));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await getChromium().launch(launchOptions());
    const context=await browser.newContext({viewport:{width:390,height:844}});
    // Do not fetch public raster tiles in automated tests.
    await context.route('https://**',route=>route.abort());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async()=>{
      const module=await import('/map.mjs');const permits=await(await fetch('/permits.json')).json();
      const originalFetch=fetch.bind(globalThis);globalThis.packRequests=0;
      globalThis.fetch=(url,options)=>{if(String(url).includes('overpass-api.de')){packRequests++;return Promise.resolve(new Response(JSON.stringify({osm3s:{timestamp_osm_base:'2026-10-14T00:00:00Z'},elements:[{type:'node',id:1,lat:-20.4,lon:48.27,tags:{place:'village',name:'Fixture localité'}},{type:'way',id:2,tags:{highway:'track'},geometry:[{lat:-20.4,lon:48.27},{lat:-20.41,lon:48.28}]}]}),{status:200}));}return originalFetch(url,options);};
      globalThis.gpsState={watches:new Map(),next:0,cleared:0,last:null};
      const position=(lat=-20.4,lng=48.27,time=Date.now())=>({timestamp:time,coords:Object.create({get latitude(){return lat},get longitude(){return lng},get accuracy(){return 37}})});
      Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:cb=>cb(position()),watchPosition:cb=>{const id=++gpsState.next;gpsState.watches.set(id,cb);cb(position());return id},clearWatch:id=>{gpsState.watches.delete(id);gpsState.cleared++}}});
      globalThis.startMap=async()=>{globalThis.controller?.destroy();document.querySelector('#app').innerHTML=module.mapMarkup({permits,mapPermit:'42278'});globalThis.controller=module.mountMap(document.querySelector('#app'),{permits,mapPermit:'42278',onPosition:p=>gpsState.last=p});await controller.ready;};
      await startMap();
    });
    assert.equal(await page.locator('.field-map').count(),1);
    await page.getByText('Préparer avant la descente',{exact:true}).click();
    await page.getByRole('button',{name:'Préparer les AERP affichés'}).click();
    await page.waitForFunction(()=>!document.querySelector('[data-map-action="prepare"]').disabled,{},{timeout:10000});
    assert.equal(await page.locator('[data-map-pack-message]').innerText(),'Extraits prêts hors ligne sur cet appareil.');
    assert.equal(await page.evaluate(()=>packRequests),1);assert.match(await page.locator('[data-map-packs]').innerText(),/Prêt hors ligne.*2 objets OSM/);
    await context.setOffline(true);await page.evaluate(()=>startMap());
    assert.equal(await page.locator('[data-map-base]').inputValue(),'local');assert.match(await page.locator('[data-map-packs]').textContent(),/Prêt hors ligne/);
    assert.match(await page.locator('.leaflet-tooltip').allTextContents().then(v=>v.join(' ')),/Fixture localité/);
    await page.getByText('Trace de marche GPS',{exact:true}).click();await page.getByRole('button',{name:'Démarrer',exact:true}).click();
    assert.equal(await page.evaluate(()=>gpsState.watches.size),1);assert.equal(await page.evaluate(()=>gpsState.last.accuracy),37);
    await page.evaluate(()=>controller.destroy());assert.equal(await page.evaluate(()=>gpsState.watches.size),0);assert.equal(await page.evaluate(()=>gpsState.cleared),1);
    await page.evaluate(()=>startMap());await page.getByText('Trace de marche GPS',{exact:true}).click();
    assert.match(await page.locator('[data-map-track-status]').innerText(),/En pause.*1 positions/);
    await page.getByRole('button',{name:'Reprendre',exact:true}).click();assert.equal(await page.evaluate(()=>gpsState.watches.size),1);
    await page.getByRole('button',{name:'Terminer',exact:true}).click();assert.equal(await page.evaluate(()=>gpsState.watches.size),0);
    await page.evaluate(()=>controller.destroy());assert.deepEqual(errors,[]);
    await context.close();
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
