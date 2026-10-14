import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKLIST,checklistItems,checklistMarkup,backupChanges,annotationLine} from '../dist/terrain-tools.mjs';
import {createArchive,validateArchive,mergeArchiveRecords} from '../dist/storage.mjs';
const empty=()=>({observations:[],assets:[],missions:[],drafts:[],settings:[]});
test('departure checklist keeps user items, checked values and escaped labels',()=>{
 const m={id:'m',checklist:{'depart-0':true},checklistExtra:[{id:'custom',group:'Personnel',label:'<véhicule>'}]};
 assert.equal(checklistItems(m).length,CHECKLIST.length+1);
 assert.match(checklistMarkup(m),/&lt;véhicule&gt;/);
 assert.match(checklistMarkup(m),/data-checklist="depart-0"[^>]*checked/);
});
test('backup state includes records modified since export and drafts not yet saved as observations',()=>{
 const r=empty();r.observations.push({id:'old',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z'});r.drafts.push({id:'draft',createdAt:'2026-10-14T00:00:00Z'});r.assets.push({id:'a',createdAt:'2026-10-10T00:00:00Z'});
 assert.deepEqual(backupChanges(r,'2026-10-13T00:00:00Z'),{observations:1,drafts:1,assets:0,missions:0,maps:0,tracks:0});
 assert.deepEqual(backupChanges(r,null),{observations:1,drafts:1,assets:1,missions:0,maps:0,tracks:0});
 r.settings.push({id:'map-pack:42278',updatedAt:'2026-10-14T00:00:00Z'},{id:'map-tracks:m',updatedAt:'2026-10-14T00:00:00Z'});
 assert.equal(backupChanges(r,'2026-10-13T00:00:00Z').maps,1);assert.equal(backupChanges(r,'2026-10-13T00:00:00Z').tracks,1);
});
test('archive round-trip retains original photo, caption, separate annotation and optional structured notes',async()=>{
 const r=empty();r.missions.push({id:'m',checklist:{'depart-0':true},checklistExtra:[{id:'extra',group:'Personnel',label:'Eau'}]});
 r.assets.push({id:'original',name:'terrain.png',type:'image/png',blob:new Blob(['original'],{type:'image/png'})},{id:'annotation',originalId:'original',name:'annotation.png',type:'image/png',blob:new Blob(['annotation'],{type:'image/png'})});
 r.observations.push({id:'o',missionId:'m',assetIds:['original','annotation'],questionnaire:{observed:'Roche visible',interpretation:'Hypothèse',toVerify:'Mesurer',photoNotes:{original:{caption:'Vue de contexte',annotatedAssetId:'annotation'}}}});
 const archive=JSON.parse(await (await createArchive(r)).text()),round=await validateArchive(archive);
 assert.deepEqual(round.observations,r.observations);assert.equal(await round.assets[0].blob.text(),'original');assert.equal(await round.assets[1].blob.text(),'annotation');assert.deepEqual(round.missions,r.missions);
});
test('conflicting photo restoration remaps caption keys and annotation links along with assetIds',()=>{
 const before=empty(),incoming=empty();
 before.assets=[{id:'photo',name:'existing',sha256:'a'},{id:'ann',name:'existing annotation',sha256:'b'}];
 incoming.assets=[{id:'photo',name:'new',sha256:'c'},{id:'ann',name:'new annotation',sha256:'d',originalId:'photo'}];
 incoming.observations=[{id:'point',assetIds:['photo','ann'],questionnaire:{photoNotes:{photo:{caption:'Vue',annotatedAssetId:'ann'}}}}];
 const result=mergeArchiveRecords(before,incoming,id=>id+'-copy');
 const point=result.additions.observations[0];assert.deepEqual(point.assetIds,['photo-copy','ann-copy']);assert.deepEqual(point.questionnaire.photoNotes,{'photo-copy':{caption:'Vue',annotatedAssetId:'ann-copy'}});assert.equal(result.additions.assets[1].originalId,'photo-copy');
});
test('annotation circle and arrow are drawn from normalized photo coordinates',()=>{
 const calls=[],ctx=new Proxy({}, {get:(obj,key)=>obj[key]||((...args)=>calls.push([key,...args])),set:(obj,key,value)=>{obj[key]=value;return true;}});
 annotationLine(ctx,{tool:'circle',points:[.1,.2,.5,.8]},100,200);const ellipse=calls.find(c=>c[0]==='ellipse');assert.equal(ellipse[1],30);assert.equal(ellipse[2],100);assert.equal(ellipse[3],20);
 calls.length=0;annotationLine(ctx,{tool:'arrow',points:[0,0,1,1]},100,200);assert.ok(calls.some(c=>c[0]==='lineTo'&&c[1]===100&&c[2]===200));
});
