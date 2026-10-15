import {QUESTIONS,THEMES,destinationFor,isQuestionVisible} from './interview-library.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const known=value=>value==null||String(value).trim()===''?'Non renseigné':String(value);
const list=value=>Array.isArray(value)?value:[];
const qualityLabels={'to-confirm':'À confirmer',confirmed:'Confirmé',contradictory:'Contradictoire',outdated:'À actualiser'};
const provenanceLabels={declaration:'Déclaration directe',observed:'Fait personnellement observé','third-party':'Information rapportée par un tiers',document:'Document présenté',verified:'Information vérifiée ultérieurement'};
const statusLabels={answered:'Réponse saisie',unknown:'Ne sait pas','not-applicable':'Non applicable',refused:'Refuse de répondre',verify:'À vérifier',skipped:'À reprendre'};
const scopeLabels={all:'Tous les permis de l’entretien',permits:'Permis déterminés',commune:'Commune en général',district:'District en général',general:'Information générale'};
const nonValues=new Set(['unknown','not-applicable','refused','verify','skipped']);
const personFor=(interview,people)=>interview.personSnapshot||people.find(person=>person.id===interview.personId)||{};
const date=value=>known(value);
const sorted=interviews=>[...interviews].sort((a,b)=>String(a.date||a.createdAt||'').localeCompare(String(b.date||b.createdAt||''))||String(a.id).localeCompare(String(b.id)));

export function formatAnswer(value) {
  if (value==null||value==='') return '';
  if (typeof value==='boolean') return value?'Oui':'Non';
  if (Array.isArray(value)) return value.map(formatAnswer).filter(Boolean).join(' ; ');
  if (typeof value==='object') {
    if (Number.isFinite(value.lat)&&Number.isFinite(value.lng)) return `${value.lat}, ${value.lng}${Number.isFinite(value.accuracy)?' (± '+value.accuracy+' m)':''}${value.label?' — '+value.label:''}`;
    if ('value' in value) return `${formatAnswer(value.value)}${value.unit?' '+value.unit:''}`;
    return Object.entries(value).filter(([,item])=>item!=null&&item!=='').map(([key,item])=>`${key} : ${formatAnswer(item)}`).join(' ; ');
  }
  return String(value);
}

function meaningful(answer) {
  return Boolean(answer && !nonValues.has(answer.status) && (formatAnswer(answer.value).trim() || String(answer.period||'').trim() || String(answer.complement||'').trim() || list(answer.assetIds).length || list(answer.observationIds).length));
}

function scopePermits(interview,answer={}) {
  if (['commune','district','general'].includes(answer.scope?.type)) return [];
  return answer.scope?.type==='permits'?list(answer.scope.permitIds).map(String):list(interview.permitIds).map(String);
}

function applies(interview,answer,permitId) {
  if (!permitId) return true;
  if (['commune','district','general'].includes(answer.scope?.type)) return list(interview.permitIds).map(String).includes(String(permitId));
  return scopePermits(interview,answer).includes(String(permitId));
}

function selection(options) {
  let interviews=options.interviews||(options.interview?[options.interview]:[]);
  const people=options.people||options.persons||[],meetings=options.meetings||(options.meeting?[options.meeting]:[]);
  const interviewId=options.interviewId||options.interview?.id,meetingId=options.meetingId||options.meeting?.id;
  if (interviewId) interviews=interviews.filter(item=>item.id===interviewId);
  if (meetingId) interviews=interviews.filter(item=>item.meetingId===meetingId);
  if (options.permitId) interviews=interviews.filter(item=>list(item.permitIds).map(String).includes(String(options.permitId)));
  if (options.personId) interviews=interviews.filter(item=>item.personId===options.personId);
  if (options.district) interviews=interviews.filter(item=>personFor(item,people).district===options.district);
  if (options.commune) interviews=interviews.filter(item=>personFor(item,people).commune===options.commune);
  if (options.role) interviews=interviews.filter(item=>personFor(item,people).role===options.role);
  if (options.from) interviews=interviews.filter(item=>String(item.date||'').slice(0,10)>=options.from);
  if (options.to) interviews=interviews.filter(item=>String(item.date||'').slice(0,10)<=options.to);
  return {interviews:sorted(interviews),people,meetings};
}

function questionList(options,interviews) {
  const questions=options.questions||QUESTIONS,result=new Map(questions.map(item=>[item.id,item]));
  for (const interview of interviews) for (const question of list(interview.customQuestions)) if (!result.has(question.id)) result.set(question.id,question);
  return [...result.values()].filter(item=>!options.theme||item.theme===options.theme);
}

/** One record is one source's answer. No testimony is combined or promoted to a fact. */
export function interviewRecords(options={}) {
  const {interviews,people}=selection(options),questions=questionList(options,interviews),catalog=new Map(questions.map(item=>[item.id,item]));
  const assets=new Map(list(options.assets).map(item=>[item.id,item])),records=[];
  for (const interview of interviews) {
    const person=personFor(interview,people);
    for (const [questionId,raw] of Object.entries(interview.answers||{})) {
      const answer=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{value:raw};
      const question=answer.questionSnapshot||catalog.get(questionId)||{id:questionId,label:questionId,theme:'H'};
      if (options.theme&&question.theme!==options.theme || !applies(interview,answer,options.permitId)) continue;
      const scope=answer.scope||{type:'all'},ids=scopePermits(interview,answer);
      const response=formatAnswer(answer.value),quality=answer.quality||'to-confirm';
      const attachments=list(answer.assetIds).map(id=>{const asset=assets.get(id),caption=answer.captions?.[id]||asset?.caption;return `${asset?.name||id}${caption?' — '+caption:''}${asset?'':' (consulter la sauvegarde)'}`;});
      const record={interviewId:interview.id,meetingId:interview.meetingId||'',personId:interview.personId||person.id||'',person:person.name||'Interlocuteur non renseigné',role:person.role||'',institution:person.institution||'',district:person.district||'',commune:person.commune||'',fokontany:person.fokontany||'',date:interview.date||'',location:interview.location||'',permitIds:ids,scope:scope.type||'all',scopeLabel:`${scopeLabels[scope.type]||scope.type||scopeLabels.all}${ids.length?' : '+ids.join(', '):''}`,questionId,question:question.label||questionId,theme:question.theme||'H',destination:destinationFor(question,options),value:response,unit:question.unit||'',complement:answer.complement||'',answerStatus:answer.status||'answered',answerStatusLabel:statusLabels[answer.status||'answered']||answer.status,quality,qualityLabel:qualityLabels[quality]||quality,provenance:answer.provenance||'declaration',provenanceLabel:provenanceLabels[answer.provenance||'declaration']||answer.provenance,source:answer.source||'',sourcePersonId:answer.sourcePersonId||interview.personId||'',sourceDate:answer.date||interview.date||'',assetIds:list(answer.assetIds),attachments,observationIds:list(answer.observationIds),revisit:Boolean(answer.revisit),updatedAt:answer.updatedAt||'',hasValue:meaningful(answer)};
      record.displayValue=[response?response+(question.unit?' '+question.unit:''):'',answer.status&&answer.status!=='answered'?record.answerStatusLabel:''].filter(Boolean).join(' — ')||'Non renseigné';
      record.period=answer.period||'';
      if (record.period) record.displayValue=(response?record.displayValue+' — ':'')+'Période déclarée : '+record.period;
      record.sourceLabel=[record.person,record.role,record.date?date(record.date):'Date non renseignée',`Entretien ${record.interviewId}`,record.source].filter(Boolean).join(' · ');
      if (!options.unconfirmedOnly||quality!=='confirmed'||record.revisit||record.answerStatus==='verify') records.push(record);
    }
  }
  return records;
}

function missingRecords(options,interviews,people,questions,records) {
  const result=[],modelIds=new Set((options.questions||QUESTIONS).map(question=>question.id));
  for (const interview of interviews) {
    const person=personFor(interview,people),own=records.filter(item=>item.interviewId===interview.id);
    for (const question of questions) {
      if (!modelIds.has(question.id)&&!list(interview.customQuestions).some(item=>item.id===question.id)) continue;
      if (!isQuestionVisible(question,interview.answers||{})) continue;
      const answer=interview.answers?.[question.id];
      if (answer&&!applies(interview,answer,options.permitId)) continue;
      const row=own.find(item=>item.questionId===question.id);
      if (row?.answerStatus==='not-applicable'||row?.hasValue&&!row.revisit&&!['outdated','contradictory'].includes(row.quality)&&row.answerStatus!=='verify') continue;
      result.push({interviewId:interview.id,person:person.name||'Interlocuteur non renseigné',role:person.role||'',date:interview.date||'',questionId:question.id,question:question.label,theme:question.theme,destination:destinationFor(question,options),permitIds:row?row.permitIds:list(interview.permitIds),reason:row?.answerStatus==='refused'?'Refus de répondre — respecter ce choix':row?.revisit?'Question signalée à reprendre':row?.quality==='contradictory'?'Contradiction à examiner':row?.quality==='outdated'?'Information à actualiser':row?.answerStatus&&row.answerStatus!=='answered'?row.answerStatusLabel:'Réponse manquante',record:row||null});
    }
  }
  return result;
}

/** Differences remain candidates for verification, never an automatic factual conclusion. */
export function compareInterviews(options={}) {
  const records=interviewRecords({...options,unconfirmedOnly:false}),groups=new Map();
  for (const record of records) {const key=record.questionId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
  return [...groups].map(([questionId,responses])=>{
    const differs=(a,b)=>[a.value,a.period,a.complement].join('\n').trim().toLocaleLowerCase('fr')!==[b.value,b.period,b.complement].join('\n').trim().toLocaleLowerCase('fr');
    const overlaps=(a,b)=>{
      if (['all','permits'].includes(a.scope)&&['all','permits'].includes(b.scope)) return a.permitIds.some(id=>b.permitIds.includes(id));
      if (a.scope!==b.scope) return false;
      if (a.scope==='commune') return Boolean(a.commune&&a.commune===b.commune&&(!a.district||!b.district||a.district===b.district));
      if (a.scope==='district') return Boolean(a.district&&a.district===b.district);
      return false;
    };
    const divergentResponses=responses.filter(a=>a.hasValue&&responses.some(b=>a!==b&&b.hasValue&&overlaps(a,b)&&differs(a,b)));
    const conflict=responses.some(item=>item.quality==='contradictory');
    const displayResponses=options.unconfirmedOnly?responses.filter(item=>item.quality!=='confirmed'||item.revisit||item.answerStatus==='verify'||divergentResponses.includes(item)):responses;
    return {questionId,question:responses[0].question,theme:responses[0].theme,responses,displayResponses,divergentResponses,divergent:divergentResponses.length>0,contradictory:conflict,needsVerification:conflict||divergentResponses.length>0||responses.some(item=>item.quality!=='confirmed'||!item.hasValue),notice:conflict?'Contradiction signalée — vérification nécessaire':divergentResponses.length?'Réponses différentes sur une portée commune — rapprochement et vérification nécessaires':'Sources conservées séparément'};
  }).filter(group=>group.displayResponses.length);
}

export function buildPermitSummary(options={}) {
  options={...options,unconfirmedOnly:false};
  const {interviews,people}=selection(options),questions=questionList(options,interviews),records=interviewRecords(options),missing=missingRecords(options,interviews,people,questions,records),sections=new Map();
  const comparisons=compareInterviews(options),divergent=new Set(comparisons.flatMap(group=>group.divergentResponses.map(record=>record.interviewId+'\0'+record.questionId)));
  const ensure=title=>{if(!sections.has(title))sections.set(title,{title,confirmed:[],unverified:[],contradictory:[],missing:[],actions:[]});return sections.get(title);};
  for (const record of records) {
    const section=ensure(record.destination);
    if (record.hasValue) section[record.quality==='contradictory'||divergent.has(record.interviewId+'\0'+record.questionId)?'contradictory':record.quality==='confirmed'?'confirmed':'unverified'].push(divergent.has(record.interviewId+'\0'+record.questionId)?{...record,comparisonNotice:'Réponses différentes sur une portée commune — à examiner ; fiabilité enregistrée conservée'}:record);
    if (record.revisit||record.quality!=='confirmed'||record.answerStatus==='verify') section.actions.push({question:record.question,source:record.sourceLabel,action:record.quality==='outdated'?'Actualiser cette information':record.quality==='contradictory'?'Examiner les sources et résoudre la contradiction':record.revisit?'Reprendre la question':'Vérifier la déclaration ou demander une preuve',interviewId:record.interviewId});
  }
  for (const item of missing) {const section=ensure(item.destination);section.missing.push(item);if(!item.record)section.actions.push({question:item.question,source:`${item.person} · ${item.date||'Date non renseignée'} · Entretien ${item.interviewId}`,action:'Compléter la donnée si elle est pertinente et si la personne accepte de répondre',interviewId:item.interviewId});}
  for (const group of comparisons.filter(item=>item.divergent)) {
    for (const record of group.divergentResponses) {const section=ensure(record.destination);if(!section.actions.some(item=>item.action===group.notice&&item.interviewId===record.interviewId&&item.question===record.question))section.actions.push({question:record.question,source:record.sourceLabel,action:group.notice,interviewId:record.interviewId});}
  }
  return {permitId:options.permitId||'',interviewIds:interviews.map(item=>item.id),sections:[...sections.values()],records,missing};
}

const recordRow=record=>[record.question,record.displayValue+(record.complement?'\nComplément : '+record.complement:''),record.sourceLabel,record.scopeLabel,`${record.provenanceLabel}\n${record.qualityLabel}${record.comparisonNotice?'\n'+record.comparisonNotice:''}${record.attachments.length?'\nPièces : '+record.attachments.join(' ; '):''}${record.observationIds.length?'\nObservations : '+record.observationIds.join(', '):''}${record.sourceDate?'\nDate source : '+record.sourceDate:''}`];
const recordHeaders=['Question','Réponse et complément','Interlocuteur et entretien','Portée','Provenance, fiabilité et preuves'];
const reportTitles={individual:'Fiche individuelle d’entretien',meeting:'Compte rendu de réunion',permit:'Synthèse par permis',comparison:'Tableau comparatif des témoignages',missing:'Informations à compléter'};

export function buildInterviewReport(options={}) {
  const kind=options.kind||'individual';
  if (['permit','missing'].includes(kind)) options={...options,unconfirmedOnly:false};
  const {interviews,people,meetings}=selection(options),records=interviewRecords(options),questions=questionList(options,interviews),generatedAt=options.generatedAt||new Date().toISOString();
  const report={kind,title:reportTitles[kind]||reportTitles.individual,generatedAt,metadata:[{label:'Export créé',value:generatedAt},{label:'Entretiens',value:interviews.map(item=>item.id).join(', ')||'Aucun entretien sélectionné'},{label:'Permis',value:options.permitId||[...new Set(interviews.flatMap(item=>list(item.permitIds)))].join(', ')||'Entretien général'}],sections:[],records};
  report.sections.push({title:'Lecture des informations',paragraphs:['Chaque réponse reste attribuée à son interlocuteur, à sa date et à sa portée. Une déclaration ou un document présenté ne vaut pas confirmation administrative. Les champs non renseignés ne sont pas complétés automatiquement. Les différences de réponses appellent un examen des sources et des périmètres concernés.']});
  if (kind==='permit') {
    const summary=buildPermitSummary(options);
    for (const section of summary.sections) {
      for (const [key,label] of [['confirmed','Informations confirmées'],['unverified','Déclarations non vérifiées'],['contradictory','Informations contradictoires']]) report.sections.push({title:section.title+' — '+label,headers:recordHeaders,rows:section[key].map(recordRow),paragraphs:section[key].length?[]:['Aucune information dans cette catégorie.']});
      report.sections.push({title:section.title+' — Données manquantes',headers:['Question','Source','Motif'],rows:section.missing.map(item=>[item.question,`${item.person} · ${item.date||'Date non renseignée'} · Entretien ${item.interviewId}`,item.reason]),paragraphs:section.missing.length?[]:['Aucune donnée manquante identifiée dans les questions applicables.']});
      report.sections.push({title:section.title+' — Actions à entreprendre',headers:['Question','Source','Action proposée'],rows:section.actions.map(item=>[item.question,item.source,item.action]),paragraphs:section.actions.length?[]:['Aucune action signalée.']});
    }
  } else if (kind==='comparison') {
    for (const group of compareInterviews(options)) report.sections.push({title:group.question,paragraphs:[group.notice],headers:recordHeaders,rows:group.displayResponses.map(recordRow)});
  } else if (kind==='missing') {
    const missing=missingRecords(options,interviews,people,questions,records);
    report.sections.push({title:'Questions et vérifications à reprendre',headers:['Rubrique','Question','Interlocuteur, date et entretien','Permis','Motif'],rows:missing.map(item=>[item.destination,item.question,`${item.person} · ${item.role} · ${item.date||'Date non renseignée'} · ${item.interviewId}`,item.permitIds.join(', ')||'Général',item.reason])});
  } else {
    if (kind==='meeting') {
      for (const meeting of meetings.filter(item=>interviews.some(interview=>interview.meetingId===item.id)||item.id===options.meetingId)) report.sections.push({title:meeting.title||'Réunion sans titre',paragraphs:[`Réunion : ${meeting.id} · Date : ${date(meeting.date)} · Lieu : ${known(meeting.location)}`,`Permis : ${list(meeting.permitIds).join(', ')||'Général'}`,`Notes : ${known(meeting.notes)}`]});
    }
    for (const interview of interviews) {
      const person=personFor(interview,people),own=records.filter(item=>item.interviewId===interview.id);
      const assetMap=new Map(list(options.assets).map(asset=>[asset.id,asset]));
      report.sections.push({title:`${person.name||'Interlocuteur non renseigné'} — entretien ${interview.id}`,paragraphs:[`Fonction : ${known(person.role)} · Institution : ${known(person.institution)}`,`District : ${known(person.district)} · Commune : ${known(person.commune)} · Fokontany : ${known(person.fokontany)}`,`Contact facultatif : ${known(person.contact)}`,`Date : ${date(interview.date)} · Lieu : ${known(interview.location)}`,`Permis : ${list(interview.permitIds).join(', ')||'Général'} · État : ${interview.status==='complete'?'Terminé':'Brouillon'}`,`Notes générales : ${known(interview.notes)}`,...list(interview.noteEntries).map(note=>`${note.at||note.createdAt||note.date||'Date non renseignée'} — ${note.text||note.note||''}`),`Pièces de l’entretien : ${list(interview.assetIds).map(id=>{const asset=assetMap.get(id),caption=interview.captions?.[id]||asset?.caption;return (asset?.name||id)+(caption?' — '+caption:'');}).join(', ')||'Aucune pièce référencée'}`,`Observations de terrain liées : ${list(interview.observationIds).join(', ')||'Aucune observation référencée'}`]});
      for (const theme of THEMES) {const rows=own.filter(item=>item.theme===theme.id);if(rows.length)report.sections.push({title:theme.id+'. '+theme.label,headers:recordHeaders,rows:rows.map(recordRow)});}
      const other=own.filter(item=>!THEMES.some(theme=>theme.id===item.theme));if(other.length)report.sections.push({title:'Autres questions',headers:recordHeaders,rows:other.map(recordRow)});
      if (!own.length) report.sections.push({title:'Réponses',paragraphs:['Aucune réponse saisie dans cet entretien.']});
    }
  }
  if (!interviews.length) report.sections.push({title:'Sélection vide',paragraphs:['Aucun entretien ne correspond à la sélection.']});
  report.sections.push({title:'Conservation des preuves',paragraphs:['Les pièces et observations sont référencées dans ce rapport. Conserver la sauvegarde JSON complète et les fichiers joints pour consulter les originaux. Ce document ne remplace pas la vérification des titres, autorisations ou prescriptions auprès des services compétents.']});
  return report;
}

function csvCell(value) {
  let text=String(value??'');
  // Spreadsheet programs can execute a leading formula even inside CSV quotes.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text)||/^[\t\r]/.test(text)) text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function interviewCSV(options={}) {
  const records=options.kind==='comparison'?compareInterviews(options).flatMap(group=>group.displayResponses):interviewRecords(options),rows=[['Export créé','Entretien','Réunion','Interlocuteur','Fonction','Institution','District','Commune','Fokontany','Date entretien','Lieu','Permis','Portée','Thème','Question ID','Question','Destination documentaire','Réponse','Unité','Période déclarée','Complément','État de réponse','Fiabilité','Provenance','Personne source ID','Source complémentaire','Date source','Pièces','Observations','À reprendre']];
  const generatedAt=options.generatedAt||new Date().toISOString();
  if (['missing','permit'].includes(options.kind)) {
    const report=buildInterviewReport({...options,generatedAt}),output=[['Export créé','Rapport','Rubrique','Question','Réponse','Interlocuteur et date','Portée','Provenance et preuves','Motif ou action']];
    for (const section of report.sections) {
      for (const row of section.rows||[]) {
        if (section.headers?.[0]==='Rubrique') output.push([generatedAt,report.title,row[0],row[1],'',row[2],row[3],'',row[4]]);
        else if (section.headers?.length===3) output.push([generatedAt,report.title,section.title,row[0],'',row[1],'','',row[2]]);
        else output.push([generatedAt,report.title,section.title,...row,'']);
      }
      for(const paragraph of section.paragraphs||[])output.push([generatedAt,report.title,section.title,'','','','','',paragraph]);
    }
    return '\ufeff'+output.map(row=>row.map(csvCell).join(';')).join('\r\n');
  }
  for (const record of records) rows.push([generatedAt,record.interviewId,record.meetingId,record.person,record.role,record.institution,record.district,record.commune,record.fokontany,record.date,record.location,record.permitIds.join(', '),record.scopeLabel,record.theme,record.questionId,record.question,record.destination,record.value,record.unit,record.period,record.complement,record.answerStatusLabel,record.qualityLabel,record.provenanceLabel,record.sourcePersonId,record.source,record.sourceDate,record.attachments.join(' ; '),record.observationIds.join(', '),record.revisit?'Oui':'Non']);
  return '\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}

export function interviewHTML(options={}) {
  const report=options.report||buildInterviewReport(options);
  const content=report.sections.map(section=>`<section><h2>${esc(section.title)}</h2>${list(section.paragraphs).map(paragraph=>`<p>${esc(paragraph).replace(/\r?\n/g,'<br>')}</p>`).join('')}${section.rows?.length?`<table><thead><tr>${list(section.headers).map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell).replace(/\r?\n/g,'<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>`:''}</section>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(report.title)} — Tety</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:1180px;margin:32px auto;padding:0 20px;color:#172d30}h1{font-size:26px}h2{font-size:18px;margin-top:28px}p{white-space:normal}table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}td,th{border:1px solid #aab8b6;padding:8px;vertical-align:top;overflow-wrap:anywhere}th{background:#edf4f1;text-align:left}tr{break-inside:avoid}thead{display:table-header-group}.print{padding:12px 18px;font:inherit;min-height:44px}dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}@page{size:A4 landscape;margin:14mm}@media print{body{margin:0;padding:0;font-size:10pt;max-width:none}.print{display:none}h2{break-after:avoid}td,th{padding:5px;font-size:8pt}a{color:inherit}}</style></head><body><button class="print" onclick="window.print()">Imprimer / enregistrer en PDF</button><h1>Tety — ${esc(report.title)}</h1><dl>${report.metadata.map(item=>`<dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd>`).join('')}</dl>${content}</body></html>`;
}

// A small standards-based OOXML writer. No remote service or heavy package is needed.
const encoder=new TextEncoder(),wordType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function zip(entries){
  const blocks=[],central=[];let offset=0,centralSize=0;
  for(const [path,value] of entries){const name=encoder.encode(path),bytes=encoder.encode(value),crc=crc32(bytes),local=new Uint8Array(30),view=new DataView(local.buffer),record=new Uint8Array(46),recordView=new DataView(record.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,0x21,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);
    recordView.setUint32(0,0x02014b50,true);recordView.setUint16(4,20,true);recordView.setUint16(6,20,true);recordView.setUint16(8,0x800,true);recordView.setUint16(14,0x21,true);recordView.setUint32(16,crc,true);recordView.setUint32(20,bytes.length,true);recordView.setUint32(24,bytes.length,true);recordView.setUint16(28,name.length,true);recordView.setUint32(42,offset,true);
    blocks.push(local,name,bytes);central.push(record,name);offset+=30+name.length+bytes.length;centralSize+=46+name.length;
    if(offset+centralSize>100*1024*1024)throw new Error('Le rapport dépasse 100 Mio. Réduisez la sélection.');
  }
  const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);return new Blob([...blocks,...central,end],{type:wordType});
}
const paragraph=(value,style='Normal')=>`<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${String(value??'').split(/\r\n|\r|\n/).map((line,index)=>`<w:r>${index?'<w:br/>':''}<w:t xml:space="preserve">${xml(line)}</w:t></w:r>`).join('')}</w:p>`;
function wordTable(headers,rows){
  const width=Math.floor(13900/Math.max(1,headers.length)),cell=(value,heading)=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${heading?'<w:shd w:fill="E5EFEB"/>':''}</w:tcPr>${paragraph(value)}</w:tc>`;
  const row=(values,heading=false)=>`<w:tr><w:trPr>${heading?'<w:tblHeader/>':''}<w:cantSplit/></w:trPr>${values.map(value=>cell(value,heading)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="13900" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="B7C6C0"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${headers.map(()=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${row(headers,true)}${rows.map(values=>row(values)).join('')}</w:tbl>${paragraph('')}`;
}

export async function createInterviewWordReport(options={}) {
  const report=options.report||buildInterviewReport(options),header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const body=[paragraph('Tety — '+report.title,'Title'),...report.metadata.map(item=>paragraph(item.label+' : '+item.value)),...report.sections.flatMap(section=>[paragraph(section.title,'Heading1'),...list(section.paragraphs).map(value=>paragraph(value)),...(section.rows?.length?[wordTable(section.headers||[],section.rows)]:[])])].join('');
  const styles=`${header}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="18"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`;
  const relation='http://schemas.openxmlformats.org/package/2006/relationships',office='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  return zip([
    ['[Content_Types].xml',`${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`],
    ['_rels/.rels',`${header}<Relationships xmlns="${relation}"><Relationship Id="rIdDocument" Type="${office}officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml',`${header}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="1469" w:bottom="850" w:left="1469"/></w:sectPr></w:body></w:document>`],
    ['word/styles.xml',styles],['word/_rels/document.xml.rels',`${header}<Relationships xmlns="${relation}"><Relationship Id="rIdStyles" Type="${office}styles" Target="styles.xml"/></Relationships>`]
  ]);
}

export function interviewJSON(options={}) {
  const {interviews,people,meetings}=selection(options),personIds=new Set(interviews.map(item=>item.personId)),meetingIds=new Set(interviews.map(item=>item.meetingId));
  return JSON.stringify({application:'Tety',format:'tety-interview-report',version:1,exportedAt:options.generatedAt||new Date().toISOString(),permitId:options.permitId||null,interviews,people:people.filter(item=>personIds.has(item.id)),meetings:meetings.filter(item=>meetingIds.has(item.id)),notice:'Les fichiers joints sont à conserver avec la sauvegarde complète.'},null,2);
}
