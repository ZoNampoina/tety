import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTIONS,THEMES,ROLES,SPECIAL_ANSWERS,getQuestions,isQuestionVisible,suggestionsFor,destinationFor} from '../dist/interview-library.mjs';
import {interviewRecords,compareInterviews,buildPermitSummary,buildInterviewReport,interviewCSV,interviewHTML,createInterviewWordReport,interviewJSON,formatAnswer} from '../dist/interview-export.mjs';

const q=id=>QUESTIONS.find(question=>question.id===id);
const people=[{id:'mayor',name:'Personne A',role:'Maire',institution:'Commune',commune:'Tsiatosika',district:'Mananjary'},{id:'chief',name:'Personne B',role:'Chef de district',district:'Mananjary'}];
const answer=(id,value,extra={})=>({questionId:id,questionSnapshot:structuredClone(q(id)),value,status:'answered',quality:'to-confirm',provenance:'declaration',scope:{type:'all',permitIds:[]},date:'2026-10-14',...extra});
const interviews=[{id:'i-a',personId:'mayor',personSnapshot:people[0],meetingId:'meeting',permitIds:['39985','40378'],date:'2026-10-14',location:'Commune',status:'draft',notes:'Première note',noteEntries:[{at:'2026-10-14T09:05:00Z',text:'Note horodatée'}],assetIds:['photo'],captions:{photo:'Réunion au village'},answers:{D1:answer('D1','Oui',{complement:'Deux secteurs signalés',assetIds:['photo'],captions:{photo:'Site signalé à localiser'},observationIds:['point-1']}),A2:answer('A2',['Rizières','Jachères'],{quality:'confirmed',provenance:'observed'}),G8:answer('G8','Demander la pièce',{scope:{type:'permits',permitIds:['39985']}})}},{id:'i-b',personId:'chief',personSnapshot:people[1],meetingId:'meeting',permitIds:['39985'],date:'2026-10-15',location:'District',status:'complete',answers:{D1:answer('D1','Non',{quality:'confirmed',provenance:'document'})}}];
const options={interviews,people,meetings:[{id:'meeting',title:'Réunion de terrain',date:'2026-10-14',location:'Tsiatosika',permitIds:['39985','40378'],notes:'Deux entretiens individuels'}],assets:[{id:'photo',name:'photo-terrain.jpg'}],generatedAt:'2026-10-15T10:00:00Z'};

test('question library covers all required themes, role suggestions and response types',()=>{
  assert.equal(THEMES.map(theme=>theme.id).join(''),'ABCDEFGH');
  assert.ok(QUESTIONS.length>=70);assert.equal(new Set(QUESTIONS.map(question=>question.id)).size,QUESTIONS.length);
  assert.deepEqual(new Set(QUESTIONS.map(question=>question.type)),new Set(['boolean','select','multi','number','date','text','location','observation']));
  assert.ok(ROLES.includes('Maire'));assert.ok(ROLES.includes('Habitant'));assert.equal(SPECIAL_ANSWERS.length,5);
  for (const question of QUESTIONS) {assert.ok(question.label&&question.destination&&question.destinations.PTPF&&question.destinations.PRSE);assert.ok(question.allowOther&&question.allowComplement);}
});

test('orpaillage subquestions follow explicit yes and never treat uncertainty as yes',()=>{
  for(const value of ['Oui',true,'yes'])assert.ok(isQuestionVisible(q('D2'),{D1:{value,status:'answered'}}));
  for(const answer of [{value:'Non',status:'answered'},{value:'Oui',status:'unknown'},{value:'Oui',status:'verify'},undefined])assert.equal(isQuestionVisible(q('D2'),{D1:answer}),false);
  const saved={D1:answer('D1','Non'),D2:answer('D2','Localisation anciennement déclarée')},before=structuredClone(saved);
  assert.ok(!getQuestions({answers:saved}).some(question=>question.id==='D2'));assert.deepEqual(saved,before);
});

test('quick collection prioritizes profile while complete and includeAll expose every category',()=>{
  const quick=getQuestions({role:'Chef de district',mode:'quick'});
  assert.ok(quick.every(question=>question.essential));assert.equal(quick[0].theme,'G');
  assert.ok(quick.length<getQuestions().length);
  assert.equal(getQuestions({mode:'quick',includeAll:true,includeHidden:true}).length,QUESTIONS.length);
  assert.equal(new Set(getQuestions({role:'Habitant'}).map(question=>question.theme)).size,8);
  assert.ok(getQuestions({theme:'D',search:'orpaillage'}).some(question=>question.id==='D1'));
});

test('local suggestions and documentary mappings are reusable without changing frozen templates',()=>{
  const original=[...q('D2').suggestions],suggestions=suggestionsFor(q('D2'),{suggestions:{D2:['Site actif','Nouveau secteur']}});
  assert.deepEqual(q('D2').suggestions,original);assert.equal(suggestions.filter(value=>value==='Site actif').length,1);assert.ok(suggestions.includes('Nouveau secteur'));
  assert.equal(destinationFor(q('D1'),{document:'PRSE',mappings:{D:{PRSE:'Rubrique personnalisée'}}}),'Rubrique personnalisée');
  assert.equal(destinationFor(q('D1'),{mappings:{D1:'Destination par question'}}),'Destination par question');
});

test('individual and meeting reports preserve interviews, snapshots, dates, captions and source distinctions',()=>{
  const changedPeople=people.map(person=>({...person,name:'Nom changé après entretien'}));
  const report=buildInterviewReport({...options,people:changedPeople,kind:'meeting',meetingId:'meeting'}),text=JSON.stringify(report);
  assert.match(text,/Réunion de terrain/);assert.match(text,/Personne A/);assert.match(text,/Personne B/);assert.doesNotMatch(text,/Nom changé/);
  assert.match(text,/2026-10-14T09:05:00Z/);assert.match(text,/Réunion au village/);assert.match(text,/Site signalé à localiser/);assert.match(text,/point-1/);
  assert.equal(report.records.filter(row=>row.questionId==='D1').length,2);
  assert.match(text,/Déclaration directe/);assert.match(text,/Document présenté/);
});

test('permit selection respects per-answer scope and keeps general context visibly separate',()=>{
  const copy=structuredClone(interviews);copy[0].answers.C1=answer('C1','Source communale',{scope:{type:'commune',permitIds:[]}});
  const rows=interviewRecords({...options,interviews:copy,permitId:'40378'});
  assert.ok(rows.some(row=>row.questionId==='D1'));assert.ok(!rows.some(row=>row.questionId==='G8'));assert.ok(!rows.some(row=>row.interviewId==='i-b'));
  const context=rows.find(row=>row.questionId==='C1');assert.equal(context.scopeLabel,'Commune en général');assert.deepEqual(context.permitIds,[]);
});

test('divergent sources remain separate and summary places them in the review category without changing records',()=>{
  const source=structuredClone(options),before=structuredClone(source),comparison=compareInterviews({...source,permitId:'39985'}).find(group=>group.questionId==='D1');
  assert.equal(comparison.divergent,true);assert.equal(comparison.responses.length,2);assert.equal(comparison.needsVerification,true);
  assert.match(comparison.notice,/rapprochement/);
  const summary=buildPermitSummary({...source,permitId:'39985'}),section=summary.sections.find(item=>item.title===q('D1').destination);
  assert.equal(section.contradictory.length,2);assert.equal(section.confirmed.length,0);
  assert.equal(section.contradictory.find(row=>row.person==='Personne B').quality,'confirmed');
  assert.deepEqual(source,before);
});

test('non-overlapping permits and locality scopes do not create an inferred contradiction',()=>{
  const a=structuredClone(interviews[0]),b=structuredClone(interviews[1]);
  a.answers={D1:answer('D1','Oui',{scope:{type:'permits',permitIds:['40378']}})};
  b.answers={D1:answer('D1','Non',{scope:{type:'permits',permitIds:['39985']}})};
  assert.equal(compareInterviews({interviews:[a,b]})[0].divergent,false);
  a.answers.D1.scope={type:'commune',permitIds:[]};
  assert.equal(compareInterviews({interviews:[a,b]})[0].divergent,false);
  b.answers.D1.scope={type:'commune',permitIds:[]};b.personSnapshot.commune='Autre commune';
  assert.equal(compareInterviews({interviews:[a,b]})[0].divergent,false);
  b.personSnapshot.commune='Tsiatosika';
  assert.equal(compareInterviews({interviews:[a,b]})[0].divergent,true);
});

test('summary distinguishes missing, unverified and confirmed without promoting documents',()=>{
  const one={...structuredClone(interviews[0]),answers:{D1:answer('D1','Oui',{provenance:'verified'}),D3:answer('D3',0,{quality:'confirmed'}),D4:answer('D4','',{status:'unknown'}),D5:answer('D5','',{status:'not-applicable'})}};
  const summary=buildPermitSummary({interviews:[one],questions:['D1','D2','D3','D4','D5'].map(q),permitId:'39985'}),section=summary.sections[0];
  assert.equal(section.unverified.length,1);assert.equal(section.confirmed.length,1);assert.equal(section.confirmed[0].value,'0');
  assert.ok(section.missing.some(row=>row.questionId==='D2'));assert.ok(section.missing.some(row=>row.questionId==='D4'));assert.ok(!section.missing.some(row=>row.questionId==='D5'));
  assert.ok(section.actions.length>0);
});

test('CSV is French UTF-8, quotes multiline text and neutralizes spreadsheet formulas',()=>{
  const copy=structuredClone(options);copy.interviews[0].personSnapshot.name='  =HYPERLINK("x")';copy.interviews[0].answers.D1.complement='Ligne 1; "citation"\nLigne 2';
  const csv=interviewCSV(copy);assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/"\'  =HYPERLINK\(""x""\)"/);assert.match(csv,/Ligne 1; ""citation""\nLigne 2/);assert.match(csv,/Déclaration directe/);assert.match(csv,/Personne B/);
});

test('missing and permit CSV export the chosen report including entirely unanswered questions',()=>{
  const empty={...structuredClone(interviews[0]),answers:{}};
  const selected={interviews:[empty],questions:[q('D1')],permitId:'39985',generatedAt:options.generatedAt};
  const missing=interviewCSV({...selected,kind:'missing'}),permit=interviewCSV({...selected,kind:'permit'});
  assert.match(missing,/Existe-t-il des activités d’orpaillage/);assert.match(missing,/Réponse manquante/);assert.match(missing,/Informations à compléter/);
  assert.match(permit,/Données manquantes/);assert.match(permit,/Actions à entreprendre/);assert.match(permit,/Compléter la donnée/);
});

test('HTML is self-contained, printable offline, and escapes testimony as text',()=>{
  const copy=structuredClone(options);copy.interviews[0].notes='<script>alert(1)</script>';
  const html=interviewHTML(copy);assert.match(html,/lang="fr"/);assert.match(html,/@media print/);assert.match(html,/window\.print\(\)/);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<(?:link|script)[^>]+(?:href|src)="https?:/);
});

function unzipStored(bytes) {
  const entries=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),nameSize=bytes.readUInt16LE(offset+26),extraSize=bytes.readUInt16LE(offset+28),start=offset+30+nameSize+extraSize;entries.set(bytes.subarray(offset+30,offset+30+nameSize).toString('utf8'),bytes.subarray(start,start+size));offset=start+size;}
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);return entries;
}

test('DOCX is a real editable OOXML archive and retains individual sources and uncertainty',async()=>{
  const blob=await createInterviewWordReport({...options,kind:'meeting',meetingId:'meeting'});
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const entries=unzipStored(Buffer.from(await blob.arrayBuffer())),document=entries.get('word/document.xml').toString('utf8');
  for(const path of ['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml','word/_rels/document.xml.rels'])assert.ok(entries.has(path));
  assert.match(document,/Compte rendu de réunion/);assert.match(document,/Personne A/);assert.match(document,/Personne B/);assert.match(document,/À confirmer/);assert.match(document,/Document présenté/);assert.match(document,/w:tblHeader/);assert.match(document,/w:orient="landscape"/);
  assert.match(document,/Réunion au village/);assert.match(document,/Site signalé à localiser/);
});

test('export selection never silently includes unrelated interviews and JSON retains original answers',()=>{
  const report=buildInterviewReport({...options,kind:'individual',interviewId:'i-b'});
  assert.equal(report.records.length,1);assert.equal(report.records[0].person,'Personne B');
  const json=JSON.parse(interviewJSON({...options,interviewId:'i-b'}));assert.equal(json.interviews.length,1);assert.equal(json.people.length,1);assert.equal(json.meetings.length,1);assert.deepEqual(json.interviews[0].answers,interviews[1].answers);
  const empty=buildInterviewReport({...options,interviewId:'absent'});assert.equal(empty.records.length,0);assert.match(JSON.stringify(empty),/Aucun entretien/);
});

test('answer values keep numeric zero, false, coordinates and dates without inventing replacements',()=>{
  assert.equal(formatAnswer(0),'0');assert.equal(formatAnswer(false),'Non');assert.equal(formatAnswer(null),'');assert.equal(formatAnswer({lat:-21,lng:48,accuracy:7}),'-21, 48 (± 7 m)');
  assert.equal(formatAnswer({value:15,unit:'minutes'}),'15 minutes');
});

test('declared periods remain responses and appear in reports and CSV without a precise date',()=>{
  const interview={...structuredClone(interviews[0]),answers:{D1:answer('D1','Oui'),D6:answer('D6','',{period:'Vers 2010, selon l’interlocuteur'})}};
  const input={interviews:[interview],questions:[q('D1'),q('D6')]},record=interviewRecords(input).find(item=>item.questionId==='D6');
  assert.equal(record.hasValue,true);assert.match(record.displayValue,/Vers 2010/);assert.match(interviewCSV(input),/Vers 2010/);assert.match(interviewHTML(input),/Vers 2010/);
  assert.ok(!buildPermitSummary(input).missing.some(item=>item.questionId==='D6'));
});

test('questions reserved to one interview never create missing data for other people',()=>{
  const a=structuredClone(interviews[0]),b=structuredClone(interviews[1]);a.customQuestions=[{id:'custom-a',label:'Question réservée A',theme:'H',type:'text'}];
  const summary=buildPermitSummary({interviews:[a,b],questions:[q('D1')]});
  assert.ok(summary.missing.some(item=>item.questionId==='custom-a'&&item.interviewId==='i-a'));
  assert.ok(!summary.missing.some(item=>item.questionId==='custom-a'&&item.interviewId==='i-b'));
});

test('verification filter calculates differences on full sources and never invents missing confirmed data',()=>{
  const selected={...options,questions:[q('D1'),q('A2')],permitId:'39985',unconfirmedOnly:true};
  const groups=compareInterviews(selected),group=groups.find(item=>item.questionId==='D1');
  assert.equal(group.divergent,true);assert.equal(group.responses.length,2);assert.equal(group.displayResponses.length,2);
  const summary=buildPermitSummary(selected);assert.ok(!summary.missing.some(item=>item.questionId==='A2'&&item.interviewId==='i-a'));
  const report=buildInterviewReport({...selected,kind:'missing'});assert.ok(!report.sections.some(section=>section.rows?.some(row=>row[1]===q('A2').label&&row[2].includes('Personne A'))));
  const comparisonCSV=interviewCSV({...selected,kind:'comparison'});assert.match(comparisonCSV,/Personne A/);assert.match(comparisonCSV,/Personne B/);
});
