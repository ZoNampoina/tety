import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {getChromium,launchOptions}=require('./browser-runtime.cjs');
const enabled=process.env.TETY_BROWSER_TESTS==='1';
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const qa=new URL('../work/qa/',import.meta.url);

async function withBrowser(run){
  const server=createServer(async(request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/tety/__blank'){response.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Réception Entretiens</title>');return;}
    if(!pathname.startsWith('/tety/')||pathname.includes('..')){response.writeHead(404).end();return;}
    const name=pathname.slice('/tety/'.length)||'index.html';
    try{response.writeHead(200,{'Content-Type':types[extname(name)]||'application/octet-stream','Cache-Control':'no-cache'}).end(await readFile(new URL('../dist/'+name,import.meta.url)));}
    catch{response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{browser=await getChromium().launch(launchOptions());await run(browser,`http://127.0.0.1:${server.address().port}/tety/`);}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}

test('interviews migrate a real v1 database without changing legacy records, recover interrupted writes and transfer every relation',{skip:!enabled,timeout:120000},async()=>withBrowser(async(browser,base)=>{
  const context=await browser.newContext(),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'__blank');
  const legacy=await page.evaluate(async()=>{
    const records={
      missions:[{id:'legacy-mission',name:'Mission antérieure',notes:'Ne pas modifier',date:'2026-10-14'}],
      assets:[{id:'legacy-photo',name:'ancienne-photo.jpg',kind:'photo',type:'image/jpeg',blob:new Blob([Uint8Array.of(0,255,37,65)],{type:'image/jpeg'})}],
      observations:[{id:'legacy-point',missionId:'legacy-mission',title:'Point antérieur',notes:'Contenu antérieur exact',lat:-20.4,lng:48.27,assetIds:['legacy-photo'],questionnaire:{source:'Source antérieure'},status:'incomplete'}],
      drafts:[{id:'legacy-draft',missionId:'legacy-mission',title:'Brouillon antérieur',notes:'À conserver',lat:null,lng:null,assetIds:[]}],
      settings:[{id:'theme',value:'light'},{id:'activeMission',value:'legacy-mission'}]
    };
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('tety-field-data',1);
      request.onupgradeneeded=()=>Object.keys(records).forEach(name=>request.result.createObjectStore(name,{keyPath:'id'}));
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const database=request.result,transaction=database.transaction(Object.keys(records),'readwrite');for(const [name,items]of Object.entries(records))for(const item of items)transaction.objectStore(name).put(item);transaction.oncomplete=()=>{database.close();resolve();};transaction.onerror=()=>reject(transaction.error);};
    });
    return {observation:records.observations[0],mission:records.missions[0],draft:records.drafts[0],settings:records.settings,bytes:[0,255,37,65]};
  });
  const collected=await page.evaluate(async()=>{
    const db=await import('./storage.mjs'),model=await import('./interviews.mjs'),library=await import('./interview-library.mjs');
    const database=await db.openStore(),question=id=>library.QUESTIONS.find(q=>q.id===id);
    const mayor=model.createPerson({name:'Maire témoin',role:'Maire',district:'Mananjary',commune:'Marosangy'});
    const chief=model.createPerson({name:'Chef témoin',role:'Chef de district',district:'Mananjary'});
    const meeting=model.createMeeting({title:'Réunion commune',date:'2026-10-15',permitIds:['39985','40378']});
    await db.put('interviewPeople',mayor);await db.put('interviewPeople',chief);await db.put('interviewMeetings',meeting);
    let first=model.createInterview({person:mayor,meetingId:meeting.id,permitIds:['39985','40378'],mode:'quick',date:'2026-10-15'});
    first=model.writeAnswer(first,question('D1'),{value:'Oui',scope:{type:'permits',permitIds:['40378']},quality:'confirmed',provenance:'declaration'});
    first=model.writeAnswer(first,question('D2'),{value:{lat:-20.4,lng:48.27,accuracy:12},complement:'Deux secteurs signalés',assetIds:['interview-document'],observationIds:['legacy-point']});
    first=await db.saveInterview(first,[{id:'interview-document',name:'preuve.txt',type:'text/plain',blob:new Blob(['Document présenté'],{type:'text/plain'})}]);
    const conditionalBefore=library.isQuestionVisible(question('D2'),first.answers);
    first=model.writeAnswer(first,question('D1'),{value:'Non'});
    const conditionalAfter=library.isQuestionVisible(question('D2'),first.answers);
    first=model.writeAnswer(first,question('D1'),{value:'Oui'});
    await db.saveInterviewDraft(first);
    let repeated=model.createInterview({person:mayor,meetingId:meeting.id,permitIds:['40378'],date:'2026-10-16'});
    repeated=model.writeAnswer(repeated,question('D1'),{value:'Non'});await db.saveInterviewDraft(repeated);
    let another=model.createInterview({person:chief,meetingId:meeting.id,permitIds:['39985','40378'],date:'2026-10-15'});
    another=model.writeAnswer(another,question('D1'),{status:'unknown'});await db.saveInterviewDraft(another);
    // An aborted IndexedDB commit must leave the synchronous recovery record usable.
    const originalTransaction=database.transaction.bind(database);
    database.transaction=(...args)=>{const tx=originalTransaction(...args);if(args[1]==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='interviews')store.put=()=>{tx.abort();throw new DOMException('Interruption simulée','AbortError');};return store;};}return tx;};
    const interrupted=model.updateInterview(first,{notes:'Dernière note récupérée après interruption'});
    let rejected=false;try{await db.saveInterviewDraft(interrupted);}catch{rejected=true;}
    database.transaction=originalTransaction;
    return {version:database.version,stores:[...database.objectStoreNames],ids:[first.id,repeated.id,another.id],mayor:mayor.id,meeting:meeting.id,conditionalBefore,conditionalAfter,rejected,recovery:!!localStorage.getItem('tety:emergency-draft:interview:'+first.id)};
  });
  assert.equal(collected.version,2);assert.equal(collected.stores.length,8);
  assert.equal(collected.conditionalBefore,true);assert.equal(collected.conditionalAfter,false);
  assert.equal(collected.rejected,true);assert.equal(collected.recovery,true);
  await page.reload();
  const saved=await page.evaluate(async ids=>{
    const db=await import('./storage.mjs'),records=await db.readInterviews(),first=records.find(record=>record.id===ids[0]);
    await db.saveInterviewDraft(first);
    const photo=await db.get('assets','legacy-photo');
    return {records,observation:await db.get('observations','legacy-point'),mission:await db.get('missions','legacy-mission'),draft:await db.get('drafts','legacy-draft'),settings:await db.readAll('settings'),bytes:[...new Uint8Array(await photo.blob.arrayBuffer())],archive:await(await db.exportArchive()).text()};
  },collected.ids);
  assert.deepEqual(saved.observation,legacy.observation);assert.deepEqual(saved.mission,legacy.mission);assert.deepEqual(saved.draft,legacy.draft);assert.deepEqual(saved.settings,legacy.settings.toSorted((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(saved.bytes,legacy.bytes);
  assert.equal(saved.records.length,3);assert.equal(saved.records.filter(record=>record.personId===collected.mayor).length,2);
  const first=saved.records.find(record=>record.id===collected.ids[0]);
  assert.equal(first.notes,'Dernière note récupérée après interruption');
  assert.equal(first.answers.D2.complement,'Deux secteurs signalés');assert.deepEqual(first.answers.D2.observationIds,['legacy-point']);
  assert.equal(first.answers.D1.quality,'to-confirm');assert.equal(first.answers.D1.provenance,'declaration');assert.ok(first.history.length>=4);
  const transfer=await browser.newContext(),other=await transfer.newPage();await other.goto(base+'__blank');
  const restored=await other.evaluate(async({archive,id})=>{
    const db=await import('./storage.mjs'),model=await import('./interviews.mjs');
    const initial=await db.importArchive(new Blob([archive],{type:'application/json'}));
    const again=await db.importArchive(new Blob([archive],{type:'application/json'}));
    const original=await db.get('interviews',id);
    const database=await db.openStore(),originalTransaction=database.transaction.bind(database);
    database.transaction=(...args)=>{const tx=originalTransaction(...args);if(args[1]==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='interviews')store.put=()=>{tx.abort();throw new DOMException('Interruption simulée','AbortError');};return store;};}return tx;};
    let interrupted=false;try{await db.saveInterviewDraft(model.updateInterview(original,{notes:'Modification locale à préserver'}));}catch{interrupted=true;}
    database.transaction=originalTransaction;
    const pendingArchive=await(await db.exportArchive()).text();
    const pendingIncluded=JSON.parse(pendingArchive).stores.interviews.find(record=>record.id===id).notes==='Modification locale à préserver';
    const conflict=await db.importArchive(new Blob([archive],{type:'application/json'}));
    const identicalRecovery=await db.importArchive(new Blob([pendingArchive],{type:'application/json'}));
    const interviews=await db.readInterviews(),document=await db.get('assets','interview-document');
    return {initial,again,conflict,interrupted,pendingIncluded,identicalRecovery,count:interviews.length,notes:interviews.filter(record=>record.personId===original.personId).map(record=>record.notes),text:await document.blob.text(),people:(await db.readAll('interviewPeople')).length,meetings:(await db.readAll('interviewMeetings')).length,old:await db.get('observations','legacy-point')};
  },{archive:saved.archive,id:first.id});
  assert.equal(restored.again.added,0);assert.equal(restored.again.conflicts,0);assert.equal(restored.count,4);assert.ok(restored.conflict.conflicts>=1);
  assert.equal(restored.interrupted,true);assert.equal(restored.pendingIncluded,true);assert.equal(restored.identicalRecovery.added,0);assert.equal(restored.identicalRecovery.conflicts,0);
  assert.ok(restored.notes.includes('Modification locale à préserver'));assert.ok(restored.notes.includes(first.notes));
  assert.equal(restored.text,'Document présenté');assert.equal(restored.people,2);assert.equal(restored.meetings,1);assert.deepEqual(restored.old,legacy.observation);
  assert.deepEqual(errors,[]);await transfer.close();await context.close();
}));

test('Android interview collection stays offline, resumes, keeps separate witnesses and produces sourced exports',{skip:!enabled,timeout:180000},async()=>withBrowser(async(browser,base)=>{
  await mkdir(qa,{recursive:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true,geolocation:{latitude:-20.4,longitude:48.27,accuracy:9},permissions:['geolocation']});
  let page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByText('Vos périmètres',{exact:true}).waitFor();
  await page.waitForFunction(()=>navigator.serviceWorker.controller&&document.querySelector('.notice')?.textContent.includes('Application préparée hors ligne'));
  await page.getByRole('link',{name:'Entretiens',exact:true}).click();
  await page.getByRole('heading',{name:'Entretiens',exact:true}).waitFor();
  const seededPermits=await page.evaluate(async()=>(await(await import('./storage.mjs')).get('settings','permits')).value);
  const initialPermits=JSON.parse(await readFile(new URL('../dist/permits.json',import.meta.url),'utf8'));
  for(const original of initialPermits)assert.deepEqual(seededPermits.find(item=>item.id===original.id),original,'existing permit changed');
  for(const [id,count]of [['39985',64],['40378',145],['40466',73]]){const permit=seededPermits.find(item=>item.id===id);assert.equal(permit.status,null);assert.equal(permit.count,0);assert.equal(permit.declaredCount,count);assert.deepEqual(permit.cells,[]);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Android list overflows');
  await page.locator('[data-iv-action="meeting"]').click();
  await page.getByRole('textbox',{name:'Titre de la réunion',exact:true}).fill('Réunion de Marosangy');
  await page.getByRole('textbox',{name:'Lieu',exact:true}).fill('Mairie');
  await page.locator('#iv-meeting [name="permitIds"][value="39985"]').check();
  await page.locator('#iv-meeting [name="permitIds"][value="40378"]').check();
  await page.getByRole('button',{name:'Enregistrer la réunion',exact:true}).click();
  await page.getByRole('heading',{name:'Entretiens',exact:true}).waitFor();
  const meetingId=await page.evaluate(async()=>(await(await import('./storage.mjs')).readAll('interviewMeetings'))[0].id);
  async function start({name,role,personId,manual=false,permitIds=['40378']}){
    await page.locator('[data-iv-action="new"]').click();
    if(personId)await page.locator('#iv-create [name="personId"]').selectOption(personId);
    else{
      await page.getByRole('textbox',{name:'Nom et prénom',exact:true}).fill(name);
      await page.locator('#iv-create [name="role"]').fill(role);
      await page.getByRole('textbox',{name:'District',exact:true}).fill('Mananjary');
      await page.getByRole('textbox',{name:'Commune',exact:true}).fill('Marosangy');
    }
    await page.locator('#iv-create [name="meetingId"]').selectOption(meetingId);
    await page.getByRole('textbox',{name:'Lieu de l’entretien',exact:true}).fill('Mairie de Marosangy');
    for(const id of permitIds)await page.locator(`#iv-create [name="permitIds"][value="${id}"]`).check();
    if(manual){await page.getByText('Ajouter un numéro de permis',{exact:true}).click();await page.getByRole('textbox',{name:'Nouveau numéro de permis',exact:true}).fill('99999');}
    await page.getByRole('button',{name:'Démarrer l’entretien',exact:true}).click();
    await page.locator('.iv-question').waitFor();
    return new URLSearchParams((await page.evaluate(()=>location.hash)).split('?')[1]).get('id');
  }
  async function openNavigation(){if(!await page.locator('[name="iv-theme"]').isVisible())await page.getByText('Thèmes, recherche et navigation',{exact:true}).click();}
  async function themeSelect(value){await openNavigation();await page.locator('[name="iv-theme"]').selectOption(value);}
  async function choose(value,action='choice'){await page.locator(`.iv-question [data-iv-action="${action}"][data-value="${value}"]`).click();await page.waitForFunction(({value,action})=>[...document.querySelectorAll('.iv-question [data-iv-action]')].some(button=>button.dataset.ivAction===action&&button.dataset.value===value&&button.getAttribute('aria-pressed')==='true'),{value,action});}
  async function jump(label){await openNavigation();const selector=page.locator('[name="iv-jump"]');const value=await selector.locator('option').evaluateAll((options,label)=>options.find(option=>option.textContent.includes(label))?.value,label);assert.notEqual(value,undefined,'question unavailable: '+label);await selector.selectOption(value);}
  async function close(){await page.locator('[data-iv-action="list"]').first().click();await page.getByRole('heading',{name:'Entretiens',exact:true}).waitFor();}
  const firstId=await start({name:'Rasoa témoin',role:'Maire',manual:true,permitIds:['39985','40378']});
  await page.screenshot({path:fileURLToPath(new URL('interviews-quick-android.png',qa))});
  await themeSelect('D');
  await choose('Oui');
  await page.getByRole('textbox',{name:'Complément / notes de cette réponse',exact:true}).fill('Deux secteurs signalés par le maire');
  await page.getByText('Portée, source et fiabilité',{exact:true}).click();
  await page.locator('[name="iv-scope"]').selectOption('permits');
  await page.locator('[name="answerPermits"][value="39985"]').waitFor({state:'attached'});
  if(!await page.locator('[name="answerPermits"][value="39985"]').isVisible())await page.getByText('Portée, source et fiabilité',{exact:true}).click();
  await page.locator('[name="answerPermits"][value="39985"]').uncheck();
  await page.locator('[name="answerPermits"][value="99999"]').uncheck();
  await page.locator('[name="iv-quality"]').selectOption('confirmed');
  await jump('Où sont situés les sites');
  await page.locator('[data-iv-action="gps"]').click();
  await page.waitForFunction(()=>document.querySelector('[name="iv-lat"]')?.value==='-20.4');
  await page.locator('[data-iv-action="attach-question"]').click();
  await page.locator('#iv-files').setInputFiles(fileURLToPath(new URL('../dist/icon-192.png',import.meta.url)));
  await page.getByRole('textbox',{name:'Légende icon-192.png',exact:true}).first().fill('Site déclaré à confirmer');
  await page.locator('[data-iv-action="note"]').click();
  await page.getByRole('textbox',{name:'Bloc-notes indépendant',exact:true}).fill('Note générale hors questionnaire');
  await page.getByRole('textbox',{name:'Ajouter une note horodatée',exact:true}).fill('Vérifier la localisation avec le fokontany');
  await page.getByRole('button',{name:'Ajouter la note',exact:true}).click();
  await page.locator('[data-iv-action="mode"]').click();
  await page.locator('.iv-question[data-question="D1"]').waitFor();
  await choose('Non');
  assert.equal(await page.locator('[name="iv-jump"] option').evaluateAll(options=>options.some(option=>option.textContent.includes('Où sont situés les sites'))),false);
  await choose('Oui');
  await jump('Où sont situés les sites');
  assert.equal(await page.locator('[name="iv-lat"]').inputValue(),'-20.4');
  assert.equal(await page.getByRole('textbox',{name:'Légende icon-192.png',exact:true}).first().inputValue(),'Site déclaré à confirmer');
  await page.waitForFunction(()=>document.querySelector('#iv-save-status')?.textContent==='Conservé sur cet appareil');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Android editor overflows');
  await page.screenshot({path:fileURLToPath(new URL('interviews-android.png',qa)),fullPage:true});
  const mayorId=await page.evaluate(async id=>(await(await import('./storage.mjs')).get('interviews',id)).personId,firstId);
  // Close the actual page with the network disabled, then reopen the prepared PWA.
  await context.setOffline(true);await page.close();
  const reopened=await context.newPage();reopened.on('pageerror',error=>errors.push(error.message));
  await reopened.goto(base+'#interviews?id='+firstId);
  await reopened.getByRole('heading',{name:'Rasoa témoin',exact:true}).waitFor();
  const offline=await reopened.evaluate(async id=>{
    const db=await import('./storage.mjs'),record=await db.get('interviews',id),asset=await db.get('assets',record.answers.D2.assetIds[0]);
    return {record,bytes:asset.blob.size,manual:(await db.get('settings','permits')).value.find(permit=>permit.id==='99999')};
  },firstId);
  assert.equal(offline.record.notes,'Note générale hors questionnaire');assert.equal(offline.record.noteEntries.length,1);assert.equal(offline.record.answers.D1.value,'Oui');assert.deepEqual(offline.record.answers.D1.scope.permitIds,['40378']);assert.ok(offline.bytes>0);assert.equal(offline.manual.status,null);assert.deepEqual(offline.manual.cells,[]);
  const editedQuestion=await reopened.locator('.iv-question h2').innerText();
  await reopened.getByRole('textbox',{name:'Complément / notes de cette réponse',exact:true}).fill('Dernière réponse modifiée entièrement hors ligne');
  await reopened.waitForFunction(()=>document.querySelector('#iv-save-status')?.textContent==='Conservé sur cet appareil');
  await reopened.reload();await reopened.getByRole('heading',{name:'Rasoa témoin',exact:true}).waitFor();
  if(!await reopened.locator('[name="iv-jump"]').isVisible())await reopened.getByText('Thèmes, recherche et navigation',{exact:true}).click();
  const editedIndex=await reopened.locator('[name="iv-jump"] option').evaluateAll((options,label)=>options.find(option=>option.textContent.includes(label))?.value,editedQuestion);
  assert.notEqual(editedIndex,undefined);await reopened.locator('[name="iv-jump"]').selectOption(editedIndex);
  assert.equal(await reopened.getByRole('textbox',{name:'Complément / notes de cette réponse',exact:true}).inputValue(),'Dernière réponse modifiée entièrement hors ligne');
  await context.setOffline(false);await reopened.close();
  // Continue with one page so the creation helpers follow the same user-visible session.
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'#interviews');
  await page.getByRole('heading',{name:'Entretiens',exact:true}).waitFor();
  const repeatedId=await start({personId:mayorId});
  await themeSelect('D');
  await choose('Non');
  await page.locator('[data-iv-action="finish"]').click();await close();
  const chiefId=await start({name:'Rakoto chef de district',role:'Chef de district',permitIds:['39985','40378']});
  await themeSelect('D');
  await choose('unknown','special');await close();
  const fokontanyId=await start({name:'Rabe chef de fokontany',role:'Chef de fokontany'});
  await themeSelect('D');
  await choose('Non');await close();
  const count=await page.evaluate(async()=>{const db=await import('./storage.mjs'),records=await db.readInterviews();return {people:(await db.readAll('interviewPeople')).length,interviews:records.length,meetings:new Set(records.map(item=>item.meetingId)).size};});
  assert.deepEqual(count,{people:3,interviews:4,meetings:1});assert.equal(new Set([firstId,repeatedId,chiefId,fokontanyId]).size,4);
  // Each permit filter locates the same first interview, without creating a second record.
  await page.locator('[name="iv-filter-permit"]').selectOption('39985');assert.equal(await page.locator(`a[href="#interviews?id=${firstId}"]`).count(),1);
  await page.locator('[name="iv-filter-permit"]').selectOption('40378');assert.equal(await page.locator(`a[href="#interviews?id=${firstId}"]`).count(),1);
  await page.locator('[data-iv-action="compare"]').click();
  await page.locator('[name="filter-permit"]').selectOption('40378');await page.locator('[name="filter-theme"]').selectOption('D');
  const comparison=await page.locator('.iv-report').innerText();
  assert.match(comparison,/Rasoa témoin/);assert.match(comparison,/Rakoto chef de district/);assert.match(comparison,/Rabe chef de fokontany/);assert.match(comparison,/Réponses différentes sur une portée commune/);assert.match(comparison,/Ne sait pas/);
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'desktop comparison overflows');
  await page.screenshot({path:fileURLToPath(new URL('interviews-comparison-desktop.png',qa)),fullPage:true});
  async function download(action,name){const details=page.locator('details.iv-exports');if(!await details.evaluate(element=>element.open))await details.locator('summary').click();const [file]=await Promise.all([page.waitForEvent('download'),page.locator(`[data-iv-action="${action}"]`).click()]);const path=fileURLToPath(new URL(name,qa));await file.saveAs(path);return readFile(path);}
  const csv=(await download('export-csv','interviews-comparison.csv')).toString('utf8');
  assert.match(csv,/Rasoa témoin/);assert.match(csv,/Rakoto chef de district/);assert.match(csv,/40378/);assert.match(csv,/Déclaration directe/);assert.match(csv,/Date source/);
  const word=await download('export-word','interviews-comparison.docx');assert.equal(word.subarray(0,2).toString(),'PK');
  await page.locator('[data-iv-action="summary"]').click();
  const summary=await page.locator('.iv-report').innerText();
  for(const label of ['Informations confirmées','Déclarations non vérifiées','Informations contradictoires','Données manquantes','Actions à entreprendre'])assert.ok(summary.includes(label),label);
  const html=(await download('export-html','interviews-summary.html')).toString('utf8');assert.match(html,/40378/);assert.match(html,/Rasoa témoin/);assert.match(html,/Informations contradictoires/);
  await page.locator('[data-iv-action="missing"]').click();assert.match(await page.locator('.iv-report').innerText(),/Questions et vérifications à reprendre/);
  await page.locator('[data-iv-action="list"]').first().click();
  await page.getByRole('heading',{name:'Entretiens',exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'Réunions · 1'}).click();
  await page.locator('[data-iv-action="meeting-report"]').click();
  const meetingReport=(await download('export-html','interviews-meeting.html')).toString('utf8');
  assert.match(meetingReport,/Réunion de Marosangy/);assert.match(meetingReport,/Rasoa témoin/);assert.match(meetingReport,/Rakoto chef de district/);assert.match(meetingReport,/Rabe chef de fokontany/);
  await page.goto(base+'#interviews?id='+firstId);await page.getByRole('heading',{name:'Rasoa témoin',exact:true}).waitFor();
  const individual=(await download('export-html','interviews-individual.html')).toString('utf8');assert.match(individual,/Rasoa témoin/);assert.doesNotMatch(individual,/Rakoto chef de district/);assert.match(individual,/Site déclaré à confirmer/);
  const archive=JSON.parse((await download('backup','interviews-full.tety.json')).toString('utf8'));assert.equal(archive.stores.interviews.length,4);assert.equal(archive.stores.interviewPeople.length,3);assert.ok(archive.stores.assets[0].dataBase64);
  // A failed primary commit must still allow immediate rescue export and navigation.
  await page.evaluate(async()=>{
    const database=await(await import('./storage.mjs')).openStore(),original=database.transaction.bind(database);
    globalThis.restoreInterviewTransactions=()=>{database.transaction=original;};
    database.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){const objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='interviews')store.put=()=>{tx.abort();throw new DOMException('Stockage interrompu','AbortError');};return store;};}return tx;};
  });
  const interruptedQuestion=await page.locator('.iv-question').getAttribute('data-question');
  await page.getByRole('textbox',{name:'Complément / notes de cette réponse',exact:true}).fill('Dernière frappe conservée malgré échec du stockage principal');
  await page.waitForFunction(()=>document.querySelector('#iv-save-status')?.textContent.includes('Échec de sauvegarde'));
  const rescue=JSON.parse((await download('backup','interviews-rescue.tety.json')).toString('utf8'));
  assert.equal(rescue.stores.interviews.find(record=>record.id===firstId).answers[interruptedQuestion].complement,'Dernière frappe conservée malgré échec du stockage principal');
  const rescueHTML=(await download('export-html','interviews-rescue.html')).toString('utf8');assert.match(rescueHTML,/Dernière frappe conservée malgré échec du stockage principal/);
  await close();await page.evaluate(()=>restoreInterviewTransactions());
  await page.locator(`a[href="#interviews?id=${firstId}"]`).click();await page.getByRole('heading',{name:'Rasoa témoin',exact:true}).waitFor();
  assert.equal(await page.evaluate(async({id,question})=>(await(await import('./storage.mjs')).readInterviews()).find(record=>record.id===id).answers[question].complement,{id:firstId,question:interruptedQuestion}),'Dernière frappe conservée malgré échec du stockage principal');
  await context.close();
  assert.deepEqual(errors,[]);
}));
