const {getChromium,launchOptions}=require('./browser-runtime.cjs');
const chromium=getChromium();

const fs=require('fs'),path=require('path'),assert=require('assert/strict');const {spawn}=require('child_process');

(async()=>{

 const server=spawn(process.execPath,['serve.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,TETY_PORT:'4174'},stdio:['ignore','pipe','pipe'],windowsHide:true});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.on('error',reject);});

 const browser=await chromium.launch(launchOptions(['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']));

 try{

  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true,geolocation:{latitude:-20.402707492701353,longitude:48.26675088889942,accuracy:8},permissions:['geolocation','microphone']});

  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4174');await page.getByText('Vos périmètres',{exact:true}).waitFor();

  await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.screenshot({path:'qa-home-mobile.png',fullPage:true});

  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile overflow');

  await page.getByRole('button',{name:/Nouveau point/}).first().click();await page.getByRole('textbox',{name:'Titre de l’observation'}).fill('Essai terrain 42278');await page.getByRole('button',{name:'Relever ma position'}).click();

  await page.waitForFunction(()=>document.querySelector('[name=permitId]')?.value==='42278');await page.getByRole('button',{name:'Affleurement',exact:true}).click();await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Observation de test hors ligne');

  await page.locator('#photo-input').setInputFiles(path.resolve(__dirname,'../dist/icon-192.png'));await page.getByText('icon-192.png',{exact:true}).waitFor();

  await page.reload();await page.getByRole('textbox',{name:'Titre de l’observation'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Titre de l’observation'}).inputValue(),'Essai terrain 42278');

  await page.screenshot({path:'qa-point-mobile.png',fullPage:true});await page.getByRole('button',{name:'Enregistrer le point',exact:true}).click();await page.getByRole('heading',{name:'Observations',exact:true}).waitFor();

  await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Observations',exact:true}).waitFor();assert.equal(await page.getByText('Essai terrain 42278',{exact:true}).count()>=1,true);

  const archive=await page.evaluate(async()=>await(await(await import('./storage.mjs')).exportArchive()).text());fs.writeFileSync('qa-backup.json',archive);const saved=JSON.parse(archive);assert.ok(saved);

  await page.getByRole('link',{name:'Nouveau point',exact:true}).click();await page.getByRole('textbox',{name:'Titre de l’observation'}).fill('Brouillon sans GPS');await page.getByRole('textbox',{name:'Notes',exact:true}).fill('À reprendre');await page.waitForTimeout(150);

  // Synchronous emergency recovery must win over a stale committed draft.

  await page.addInitScript(()=>{if(!sessionStorage.getItem('recovery-test')){sessionStorage.setItem('recovery-test','1');const key=Object.keys(localStorage).find(k=>k.startsWith('tety:emergency-draft:'));if(key){const e=JSON.parse(localStorage.getItem(key));e.data.notes='Dernière saisie récupérée';e.data.updatedAt='2099-01-01T00:00:00Z';localStorage.setItem(key,JSON.stringify(e));}}});

  await page.reload();await page.getByRole('textbox',{name:'Notes',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Notes',exact:true}).inputValue(),'Dernière saisie récupérée');

  await page.getByRole('button',{name:'Enregistrer le point',exact:true}).click();await page.getByRole('heading',{name:'Observations',exact:true}).waitFor();

  const importResult=await page.evaluate(async archive=>{const db=await import('./storage.mjs');const obs=await db.readAll('observations');const o=obs.find(o=>o.title==='Essai terrain 42278');await db.saveObservation({...o,notes:'Version différente conservée'});return await db.importArchive(new Blob([archive],{type:'application/json'}));},archive);assert.ok(importResult.conflicts>=1);

  assert.equal(await page.evaluate(async()=> (await(await import('./storage.mjs')).readAll('observations')).length),3);

  await context.setOffline(false);await page.goto('http://127.0.0.1:4174/#map');await page.getByRole('heading',{name:'Carte locale'}).waitFor();await page.locator('#map-permit').selectOption('42278');await page.screenshot({path:'qa-map-mobile.png',fullPage:true});

  await page.setViewportSize({width:844,height:390});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'landscape overflow');

  await page.setViewportSize({width:1280,height:900});await page.goto('http://127.0.0.1:4174/#observations');await page.getByRole('heading',{name:'Observations',exact:true}).waitFor();await page.getByRole('button',{name:'Essai terrain 42278',exact:true}).first().click();await page.screenshot({path:'qa-observations-desktop.png',fullPage:true});

  // Import the archive to another prepared browser origin storage, offline.

  const pc=await browser.newContext({viewport:{width:1280,height:900}}),other=await pc.newPage();await other.goto('http://127.0.0.1:4174');await other.getByText('Vos périmètres',{exact:true}).waitFor();await other.waitForFunction(()=>navigator.serviceWorker.controller);await pc.setOffline(true);await other.goto('http://127.0.0.1:4174/#missions');await other.getByRole('button',{name:'Importer une archive',exact:true}).click();await other.locator('#restore-input').setInputFiles(path.resolve('qa-backup.json'));await other.getByText(/Archive importée/).waitFor();await other.goto('http://127.0.0.1:4174/#observations');console.log('TRANSFER',await other.locator('#app').innerText());console.log('COUNTS',await other.evaluate(async()=>{const d=await import('./storage.mjs');return {obs:(await d.readAll('observations')).map(o=>({title:o.title,missionId:o.missionId})),settings:(await d.readAll('settings')).filter(s=>s.id.startsWith('activeMission'))};}));await other.screenshot({path:'qa-transfer.png',fullPage:true});await other.getByRole('button',{name:'Essai terrain 42278',exact:true}).click();assert.equal(await other.locator('.attachment img').count(),1);

  // Test the real MediaRecorder with a synthetic microphone, then an abrupt reload.
  await page.bringToFront();await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:'Nouveau point',exact:true}).click();await page.getByRole('textbox',{name:'Titre de l’observation'}).fill('Voix interrompue');await page.getByRole('button',{name:'Note vocale',exact:true}).click();
  await page.getByRole('button',{name:'Arrêter la note',exact:true}).waitFor();await page.waitForTimeout(2800);console.log('VOICE BEFORE',await page.evaluate(async()=>{const d=await import('./storage.mjs');return {drafts:(await d.readAll('drafts')).map(x=>({title:x.title,journal:x.voiceJournal,assetIds:x.assetIds})),assets:(await d.readAll('assets')).map(x=>({kind:x.kind,type:x.type}))};}));
  await page.reload();await page.getByRole('textbox',{name:'Titre de l’observation'}).waitFor();await page.waitForTimeout(1500);console.log('VOICE AFTER',await page.locator('#app').innerText());console.log('VOICE DB',await page.evaluate(async()=>{const d=await import('./storage.mjs');return {drafts:(await d.readAll('drafts')).map(x=>({title:x.title,journal:x.voiceJournal,assetIds:x.assetIds})),assets:(await d.readAll('assets')).map(x=>({kind:x.kind,type:x.type}))};}));assert.equal(await page.locator('.attachment audio').count(),1);assert.equal(await page.getByRole('textbox',{name:'Titre de l’observation'}).inputValue(),'Voix interrompue');
  await page.getByRole('button',{name:'Paramètres et sauvegardes'}).click();await page.locator('#theme-toggle').check();await page.goto('http://127.0.0.1:4174/#home');await page.screenshot({path:'qa-home-dark.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS mobile GPS + photo + draft reload + offline save/read/reload + emergency recovery + archive/conflict + PC offline transfer + portrait/landscape/desktop + voice-segment interruption/recovery + dark mode');

  await pc.close();await context.close();

 }finally{await browser.close();server.kill();}

})().catch(e=>{console.error(e);process.exitCode=1;});

