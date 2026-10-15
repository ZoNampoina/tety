export const CHECKLIST = Object.freeze([
  ['Documents', 'Captures BCMM et fiches AERP'], ['Documents', 'Ordre de mission et contacts utiles'],
  ['Appareil', 'Tety installé et essayé sans réseau'], ['Appareil', 'Carte du secteur préparée'],
  ['Appareil', 'Batterie et batterie externe chargées'], ['Appareil', 'Sauvegarde exportée hors du téléphone'],
  ['Terrain', 'Eau et équipement de marche'], ['Terrain', 'Matériel de mesure'],
  ['Terrain', 'Sachets et étiquettes pour les échantillons'], ['Organisation', 'Accès et transport confirmés'],
  ['Organisation', 'Objectifs de visite définis'], ['Organisation', 'Retour et rendez-vous convenus']
].map(([group,label],i)=>Object.freeze({id:'depart-'+i,group,label})));
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function checklistItems(mission) { return [...CHECKLIST,...(mission?.checklistExtra||[])]; }
export function checklistMarkup(mission) {
  const items=checklistItems(mission), checked=items.filter(x=>mission.checklist?.[x.id]).length;
  return `<details class="departure"><summary>Checklist de départ · ${checked}/${items.length}</summary>${items.map(x=>`<label class="checklist-item"><input type="checkbox" data-checklist="${escapeHTML(x.id)}" data-mission="${escapeHTML(mission.id)}" ${mission.checklist?.[x.id]?'checked':''}><span><small>${escapeHTML(x.group)}</small>${escapeHTML(x.label)}</span></label>`).join('')}<form class="checklist-add" data-mission="${escapeHTML(mission.id)}"><label class="field"><span>Ajouter un élément</span><input name="item" maxlength="200" required placeholder="Ex. Vérifier le véhicule"></label><button type="submit">Ajouter</button></form></details>`;
}
export function backupChanges(records,lastExport) {
  const limit=lastExport?Date.parse(lastExport):-Infinity;
  const changed=name=>(records[name]||[]).filter(r=>Math.max(Date.parse(r.updatedAt||r.createdAt||'')||0,Date.parse(r.createdAt||'')||0)>limit).length;
  const settingChanges=prefix=>(records.settings||[]).filter(r=>r.id.startsWith(prefix)&&(Date.parse(r.updatedAt||'')||0)>limit).length;
  return {observations:changed('observations'),drafts:changed('drafts'),assets:changed('assets'),missions:changed('missions'),maps:settingChanges('map-pack:'),tracks:settingChanges('map-tracks:'),interviews:changed('interviews'),interviewPeople:changed('interviewPeople'),interviewMeetings:changed('interviewMeetings')};
}
export function backupMarkup(records,lastExport) {
  const c=backupChanges(records,lastExport);
  const text=lastExport?`Dernier export : ${new Date(lastExport).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}`:'Première sauvegarde à exporter';
  return `<div class="backup-state"><strong>${escapeHTML(text)}</strong><p>${c.observations} observation(s), ${c.drafts} brouillon(s), ${c.assets} pièce(s), ${c.missions} mission(s), ${c.maps} secteur(s) de carte, ${c.tracks} lot(s) de traces, ${c.interviews} entretien(s), ${c.interviewPeople} fiche(s) de personne et ${c.interviewMeetings} réunion(s) ajoutés ou modifiés depuis.</p><small>L’export déclenché doit être conservé dans vos fichiers ou sur un autre appareil.</small></div>`;
}
export function annotationLine(ctx,mark,width,height) {
  const [x1,y1,x2,y2]=mark.points.map((v,i)=>v*(i%2?height:width));
  ctx.strokeStyle='#f4b942';ctx.lineWidth=Math.max(3,width/220);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  if(mark.tool==='circle') ctx.ellipse((x1+x2)/2,(y1+y2)/2,Math.max(1,Math.abs(x2-x1)/2),Math.max(1,Math.abs(y2-y1)/2),0,0,Math.PI*2);
  else {ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);const angle=Math.atan2(y2-y1,x2-x1),head=Math.max(14,width/40);ctx.moveTo(x2-head*Math.cos(angle-.5),y2-head*Math.sin(angle-.5));ctx.lineTo(x2,y2);ctx.lineTo(x2-head*Math.cos(angle+.5),y2-head*Math.sin(angle+.5));}
  ctx.stroke();
}
export function photoEditorMarkup() {
  return `<h2>Annoter la photo</h2><p class="muted">L’original est conservé. Dessinez au doigt ou à la souris.</p><div class="quick-actions"><button type="button" data-photo-tool="arrow" aria-pressed="true">Flèche</button><button type="button" data-photo-tool="circle" aria-pressed="false">Entourer</button><button type="button" data-photo-undo>Annuler le dernier tracé</button></div><canvas id="photo-canvas" aria-label="Photo à annoter"></canvas><div class="quick-actions"><button data-action="close-modal" type="button">Fermer</button><button id="photo-save" type="button" class="primary">Conserver la version annotée</button></div>`;
}
export async function mountPhotoEditor(dialog,{blob,onSave,notify}) {
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),url=URL.createObjectURL(blob),image=new Image();
  try {image.src=url;await image.decode();}finally{URL.revokeObjectURL(url);}
  const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  let tool='arrow',start=null,marks=[],pending=null,busy=false;
  const draw=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);for(const mark of [...marks,...(pending?[pending]:[])])annotationLine(ctx,mark,canvas.width,canvas.height);};
  const coords=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
  canvas.onpointerdown=e=>{if(busy)return;canvas.setPointerCapture(e.pointerId);start=coords(e);pending=null;};
  canvas.onpointermove=e=>{if(!start)return;pending={tool,points:[...start,...coords(e)]};draw();};
  canvas.onpointerup=e=>{if(!start)return;const end=coords(e);if(Math.hypot(end[0]-start[0],end[1]-start[1])>.005)marks.push({tool,points:[...start,...end]});start=null;pending=null;draw();};
  canvas.onpointercancel=()=>{start=null;pending=null;draw();};
  for(const button of dialog.querySelectorAll('[data-photo-tool]'))button.onclick=()=>{tool=button.dataset.photoTool;for(const b of dialog.querySelectorAll('[data-photo-tool]'))b.setAttribute('aria-pressed',String(b===button));};
  dialog.querySelector('[data-photo-undo]').onclick=()=>{marks.pop();draw();};
  dialog.querySelector('#photo-save').onclick=async()=>{if(busy)return;if(!marks.length){notify('Ajoutez une flèche ou un cercle avant d’enregistrer.');return;}busy=true;const button=dialog.querySelector('#photo-save');button.disabled=true;try{const annotated=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!annotated)throw new Error('La photo n’a pas pu être produite.');await onSave(annotated);dialog.close();}catch(e){notify(e.message);}finally{busy=false;button.disabled=false;}};
  draw();
}
