// Field templates and recaps are pure helpers. Persistence stays in app.mjs.
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const TEMPLATE_OPTIONS = Object.freeze([
  {id:'geological',label:'Observation géologique'},
  {id:'access',label:'Accès et piste'},
  {id:'sample',label:'Échantillon'},
  {id:'meeting',label:'Rencontre'},
  {id:'general',label:'Note libre'}
]);

export const QUESTIONNAIRE_LABELS = Object.freeze({
  template:'Modèle de note',village:'Commune et village',access:'Accès et durée mesurée',
  description:'Roche indice structure et altération',water:'Eau occupation du sol et contraintes',
  contact:'Interlocuteur et contact',sample:'Échantillon et conditionnement',
  authorization:'Autorisation de prélèvement vérifiée',followup:'Suite à donner responsable et délai',
  source:'Origine de l’information',observed:'Observé ou mesuré',interpretation:'Interprétation',
  toVerify:'À vérifier',rock:'Roche observée',alteration:'Altération',structure:'Structure visible',
  accessCondition:'État de la piste',crossing:'Traversée ou pont',parking:'Point de stationnement',
  measuredDuration:'Durée réellement mesurée',sampleCode:'Code de l’échantillon',
  sampleDescription:'Description du prélèvement',sampleConditioning:'Conditionnement',
  sampleAnalysis:'Analyse attendue',needsReview:'À compléter le soir',person:'Interlocuteur',role:'Fonction déclarée',
  information:'Information recueillie',followupContact:'Contact de suivi',tags:'Repères'
});

export const labelForField = key => QUESTIONNAIRE_LABELS[key] || key;

const SPECIFIC_FIELDS = Object.freeze({
  geological:[['rock','Ex. granite, roche non identifiée'],['alteration','Aspect et degré observés'],['structure','Orientation mesurée, fracture ou autre structure']],
  access:[['accessCondition','État constaté et véhicule utilisé'],['crossing','État constaté, franchissement à vérifier'],['parking','Emplacement et contraintes'],['measuredDuration','Ex. 35 min mesurées depuis le village']],
  sample:[['sampleCode','Code unique de prélèvement'],['sampleDescription','Nature, quantité et contexte'],['sampleConditioning','Sachet, étiquette et conservation'],['sampleAnalysis','Analyse demandée ou à décider']],
  meeting:[['person','Nom ou désignation utile'],['role','Fonction déclarée par la personne'],['information','Information déclarée, distincte de ce que vous avez observé'],['followupContact','Contact consenti et action de suivi']],
  general:[]
});

export function templateId(draft = {}) {
  const saved = draft.questionnaire?.template;
  if (TEMPLATE_OPTIONS.some(option => option.id === saved)) return saved;
  return ({Affleurement:'geological','Échantillon':'sample','Accès':'access',Rencontre:'meeting'})[draft.category] || 'general';
}

export function questionnaireEntries(questionnaire = {}) {
  return Object.entries(questionnaire).filter(([key,value]) => key !== 'photoNotes' && value != null && String(value).trim() !== '' && (typeof value !== 'object' || Array.isArray(value))).map(([key,value]) => ({
    key,label:QUESTIONNAIRE_LABELS[key] || key,
    value:key === 'template' ? TEMPLATE_OPTIONS.find(option => option.id === value)?.label || String(value) : typeof value === 'boolean' ? value ? 'Oui' : 'Non' : Array.isArray(value) ? value.join(', ') : String(value)
  }));
}

function textField(key,value,placeholder = '',rows = 2) {
  return `<label class="field"><span>${esc(QUESTIONNAIRE_LABELS[key] || key)}</span><textarea name="q_${esc(key)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
}

export function templateFields(draft = {}) {
  const questionnaire = draft.questionnaire || {}, selected = templateId(draft);
  const specifics = SPECIFIC_FIELDS[selected].map(([key,placeholder]) => key === 'sampleCode'
    ? `<label class="field"><span>${esc(QUESTIONNAIRE_LABELS[key])}</span><div class="sample-code-row"><input name="q_sampleCode" value="${esc(questionnaire[key])}" maxlength="100" placeholder="${esc(placeholder)}"><button type="button" data-action="sample-code" class="small">Créer un code</button></div><small>Vérifiez aussi le code sur le sachet. Les codes existants restent conservés.</small></label>`
    : textField(key,questionnaire[key],placeholder)).join('');
  return `<div class="fieldwork-fields"><label class="field"><span>Modèle de note</span><select name="q_template">${TEMPLATE_OPTIONS.map(option => `<option value="${option.id}"${selected === option.id ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select><small>Changer de modèle conserve les champs déjà saisis.</small></label>${specifics}<div class="fieldwork-evidence">${textField('observed',questionnaire.observed,'Ce que vous avez vu ou mesuré directement',3)}${textField('interpretation',questionnaire.interpretation,'Votre hypothèse, avec ses incertitudes')}${textField('toVerify',questionnaire.toVerify,'Mesure, visite ou analyse nécessaire')}</div></div>`;
}

export function localDay(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function suggestSampleCode({observations = [],drafts = [],date = new Date()} = {}) {
  const day = (localDay(date) || localDay()).replace(/-/g,''), prefix = `TT-${day}-`;
  const existing = new Set([...observations,...drafts].map(item => String(item.questionnaire?.sampleCode || '').trim().toUpperCase()).filter(Boolean));
  for (let index = 1; index <= 999999; index++) {
    const code = prefix + String(index).padStart(3,'0');
    if (!existing.has(code)) return code;
  }
  throw new Error('Tous les codes de cette journée sont utilisés. Saisissez un code différent.');
}

export function needsCompletion(observation = {}) {
  if (observation.status === 'incomplete' || observation.questionnaire?.needsReview === true) return true;
  return !observation.title?.trim() || !observation.category || !(observation.notes?.trim() || observation.questionnaire?.observed?.trim()) || !Number.isFinite(observation.lat) || !Number.isFinite(observation.lng) || !observation.permitId || !observation.assetIds?.length;
}

export function dailyRecap({observations = [],assets = [],missions = [],missionId = null} = {},day = localDay()) {
  const selected = observations.filter(observation => (!missionId || observation.missionId === missionId) && localDay(observation.createdAt) === day).sort((left,right) => String(left.createdAt).localeCompare(String(right.createdAt)) || String(left.id).localeCompare(String(right.id)));
  const assetMap = new Map(assets.map(asset => [asset.id,asset]));
  const selectedAssetIds = [...new Set(selected.flatMap(observation => observation.assetIds || []))];
  const originalAssets = selectedAssetIds.map(id => assetMap.get(id)).filter(asset => asset && asset.kind !== 'photo-annotation');
  const byPermit = new Map(),byCategory = new Map();
  for (const observation of selected) {
    const permit = observation.permitId || null;
    byPermit.set(permit,(byPermit.get(permit) || 0)+1);
    const category = observation.category || 'Non renseigné';
    byCategory.set(category,(byCategory.get(category) || 0)+1);
  }
  const samples = selected.filter(observation => observation.category === 'Échantillon' || observation.questionnaire?.sampleCode || observation.questionnaire?.sampleDescription || observation.questionnaire?.sample).map(observation => ({id:observation.id,title:observation.title || 'Point sans titre',code:observation.questionnaire?.sampleCode || 'Non renseigné',description:observation.questionnaire?.sampleDescription || observation.questionnaire?.sample || 'Non renseigné',analysis:observation.questionnaire?.sampleAnalysis || 'Non renseigné'}));
  const actions = selected.filter(observation => observation.questionnaire?.toVerify?.trim() || observation.questionnaire?.followup?.trim()).map(observation => ({id:observation.id,title:observation.title || 'Point sans titre',toVerify:observation.questionnaire?.toVerify || '',followup:observation.questionnaire?.followup || ''}));
  const access = selected.filter(observation => observation.category === 'Accès' || observation.questionnaire?.accessCondition || observation.questionnaire?.access).map(observation => ({id:observation.id,title:observation.title || 'Point sans titre',condition:observation.questionnaire?.accessCondition || observation.questionnaire?.access || observation.notes || 'Non renseigné'}));
  return {day,missionId,mission:missions.find(mission => mission.id === missionId) || null,observations:selected,total:selected.length,incomplete:selected.filter(needsCompletion),photos:originalAssets.filter(asset => asset.type?.startsWith('image/')).length,audio:originalAssets.filter(asset => asset.type?.startsWith('audio/')).length,missingAssets:selectedAssetIds.filter(id => !assetMap.has(id)),byPermit:[...byPermit].map(([id,count]) => ({id,count})),byCategory:[...byCategory].map(([category,count]) => ({category,count})),samples,actions,access};
}

export function recapMarkup(recap) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(recap.day || '') ? new Date(recap.day+'T12:00:00').toLocaleDateString('fr-FR',{dateStyle:'long'}) : 'Date non renseignée';
  const links = items => items.map(item => `<li><a href="#point?id=${encodeURIComponent(item.id)}">${esc(item.title || 'Point sans titre')}</a></li>`).join('');
  return `<section class="card daily-recap"><div class="section-head"><div><p class="eyebrow">Bilan de journée</p><h2>${esc(day)}</h2></div><button class="small" data-action="word-day">Exporter Word</button></div><p class="muted">${esc(recap.mission?.name || 'Toutes les missions')} · points créés ce jour sur cet appareil</p><div class="recap-counts"><span><strong>${recap.total}</strong> points</span><span><strong>${recap.photos}</strong> photos</span><span><strong>${recap.samples.length}</strong> échantillons</span><span><strong>${recap.incomplete.length}</strong> à compléter</span></div>${recap.total ? `<h3>Points par AERP</h3><ul>${recap.byPermit.map(item => `<li>${item.id ? 'AERP '+esc(item.id) : 'AERP non renseigné'} · ${item.count} point(s)</li>`).join('')}</ul>${recap.incomplete.length ? `<h3>Fiches à compléter</h3><ul>${links(recap.incomplete)}</ul>` : ''}${recap.samples.length ? `<h3>Échantillons</h3><ul>${recap.samples.map(item => `<li><strong>${esc(item.code)}</strong> · ${esc(item.description)}<br><span class="muted">Analyse attendue : ${esc(item.analysis)}</span></li>`).join('')}</ul>` : ''}${recap.access.length ? `<h3>Accès et difficultés</h3><ul>${recap.access.map(item => `<li><strong>${esc(item.title)}</strong> · ${esc(item.condition)}</li>`).join('')}</ul>` : ''}${recap.actions.length ? `<h3>À reprendre</h3><ul>${recap.actions.map(item => `<li><a href="#point?id=${encodeURIComponent(item.id)}">${esc(item.title)}</a>${item.toVerify ? `<p>${esc(item.toVerify).replace(/\n/g,'<br>')}</p>` : ''}${item.followup ? `<p>${esc(item.followup).replace(/\n/g,'<br>')}</p>` : ''}</li>`).join('')}</ul>` : '<p>Aucune suite à donner renseignée pour cette journée.</p>'}` : '<p>Aucun point enregistré pour cette journée.</p>'}${recap.missingAssets.length ? `<p class="notice">${recap.missingAssets.length} pièce(s) liée(s) sont absentes du stockage. Vérifiez votre archive.</p>` : ''}</section>`;
}
