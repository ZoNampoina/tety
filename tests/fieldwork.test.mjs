import test from 'node:test';
import assert from 'node:assert/strict';
import {templateFields,templateId,suggestSampleCode,dailyRecap,recapMarkup,questionnaireEntries,labelForField,localDay,needsCompletion} from '../dist/fieldwork.mjs';

test('category models add evidence fields without exposing HTML or changing stored data',() => {
  const draft={category:'Échantillon',questionnaire:{sampleCode:'TT-1',sampleDescription:'<script>bad</script>',observed:'Éclat & structure'}};
  const snapshot=structuredClone(draft),markup=templateFields(draft);
  assert.equal(templateId(draft),'sample');
  for(const key of ['sampleCode','sampleDescription','sampleConditioning','sampleAnalysis','observed','interpretation','toVerify','template'])assert.match(markup,new RegExp(`name="q_${key}"`));
  assert.match(markup,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(markup,/<script>/);
  assert.deepEqual(draft,snapshot);
  assert.equal(templateId({category:'Échantillon',questionnaire:{template:'meeting'}}),'meeting');
});

test('sample codes do not collide with saved observations or drafts, including restored codes',() => {
  const observations=[{questionnaire:{sampleCode:'TT-20261014-001'}},{questionnaire:{sampleCode:'tt-20261014-003'}}],drafts=[{questionnaire:{sampleCode:' TT-20261014-002 '}}];
  assert.equal(suggestSampleCode({observations,drafts,date:'2026-10-14'}),'TT-20261014-004');
  assert.equal(suggestSampleCode({observations,drafts,date:'2026-10-15'}),'TT-20261015-001');
});

test('human labels preserve legacy questionnaire values and skip photo metadata objects',() => {
  const entries=questionnaireEntries({village:'Soavina',template:'sample',needsReview:true,tags:['fracture','source'],photoNotes:{photo:{caption:'Image'}},toVerify:'',legacy:'Autre'});
  assert.equal(entries.find(entry => entry.key==='village').label,'Commune et village');
  assert.equal(entries.find(entry => entry.key==='template').value,'Échantillon');
  assert.deepEqual(entries.find(entry => entry.key==='needsReview'),{key:'needsReview',label:'À compléter le soir',value:'Oui'});
  assert.equal(entries.find(entry => entry.key==='tags').value,'fracture, source');
  assert.equal(labelForField('source'),'Origine de l’information');
  assert.ok(!entries.some(entry => entry.key==='photoNotes'));
  assert.equal(entries.find(entry => entry.key==='legacy').value,'Autre');
});

test('daily recap isolates the local day and mission and counts original photos once',() => {
  const timestamp=new Date(2026,9,14,18,30).toISOString();
  const complete={id:'a',missionId:'m',createdAt:timestamp,title:'Roche',category:'Affleurement',notes:'Observed',lat:-20,lng:48,permitId:'42278',assetIds:['photo','annotated'],questionnaire:{toVerify:'Mesurer la structure'}};
  const sample={id:'b',missionId:'m',createdAt:timestamp,title:'Échantillon 1',category:'Échantillon',assetIds:['photo','missing'],questionnaire:{sampleCode:'TT-20261014-001',sampleDescription:'Roche altérée',sampleAnalysis:'Pétrographie'}};
  const assets=[{id:'photo',type:'image/jpeg'},{id:'annotated',type:'image/png',kind:'photo-annotation'}];
  const recap=dailyRecap({observations:[complete,sample,{...complete,id:'other',missionId:'other'},{...complete,id:'previous',createdAt:new Date(2026,9,13,12).toISOString()}],assets,missions:[{id:'m',name:'Mission Nosy Varika'}],missionId:'m'},'2026-10-14');
  assert.equal(recap.total,2);assert.equal(recap.photos,1);assert.equal(recap.samples.length,1);assert.equal(recap.incomplete.length,1);
  assert.deepEqual(recap.missingAssets,['missing']);assert.deepEqual(recap.byPermit,[{id:'42278',count:1},{id:null,count:1}]);
  assert.equal(recap.actions[0].toVerify,'Mesurer la structure');
  assert.equal(localDay(timestamp),'2026-10-14');
  assert.match(recapMarkup(recap),/TT-20261014-001/);assert.match(recapMarkup(recap),/data-action="word-day"/);
});

test('recap safely renders user titles and empty day',() => {
  const recap=dailyRecap({observations:[]},'2026-10-14');
  assert.match(recapMarkup(recap),/Aucun point enregistré/);
  const populated=dailyRecap({observations:[{id:'test',createdAt:new Date(2026,9,14,12).toISOString(),title:'<img src=x onerror=bad>',questionnaire:{followup:'A & B'}}]},'2026-10-14');
  assert.doesNotMatch(recapMarkup(populated),/<img src=x/);assert.match(recapMarkup(populated),/A &amp; B/);
});

test('an otherwise complete point remains in evening review when explicitly marked',() => {
  const point={title:'Roche',category:'Affleurement',notes:'Description',lat:-20,lng:48,permitId:'42278',assetIds:['photo'],questionnaire:{}};
  assert.equal(needsCompletion(point),false);
  assert.equal(needsCompletion({...point,questionnaire:{needsReview:true}}),true);
  assert.equal(questionnaireEntries({needsReview:false})[0].value,'Non');
});
