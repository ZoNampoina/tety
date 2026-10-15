/** Pure interview records. No network, UI or storage dependency. */
export const INTERVIEW_SCHEMA_VERSION = 1;
export const ANSWER_STATUSES = Object.freeze(['answered', 'unknown', 'not-applicable', 'refused', 'verify', 'skipped']);
export const ANSWER_PROVENANCE = Object.freeze(['declaration', 'observed', 'third-party', 'document', 'verified']);
export const ANSWER_QUALITIES = Object.freeze(['to-confirm', 'confirmed', 'contradictory', 'outdated']);
export const ANSWER_SCOPES = Object.freeze(['all', 'permits', 'commune', 'district', 'general']);
const copy = value => structuredClone(value);
const now = () => new Date().toISOString();
const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const fail = message => { throw new TypeError(message); };
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
function id(value, label = 'Identifiant') {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\u0000-\u001f]/.test(value)) fail(`${label} invalide.`);
}
function string(value, label, max = 1000000) {
  if (typeof value !== 'string' || value.length > max) fail(`${label} doit être un texte.`);
}
function object(value, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} invalide.`);
}
function list(value, label, limit = 10000) {
  if (!Array.isArray(value) || value.length > limit || new Set(value).size !== value.length) fail(`${label} doit être une liste sans doublons.`);
  value.forEach(item => id(item, label));
}
function permits(value) {
  list(value, 'Permis');
  if (value.some(item => !/^\d{1,12}$/.test(item))) fail('Numéro de permis invalide.');
}
function date(value, label, optional = false) {
  if (optional && value === '') return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} doit être une date YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) fail(`${label} est une date impossible.`);
}
function iso(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(`${label} doit être une date ISO complète.`);
  date(value.slice(0, 10), label);
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) fail(`${label} contient une heure invalide.`);
}
function base(record) {
  object(record, 'Fiche'); id(record.id);
  iso(record.createdAt, 'Création'); iso(record.updatedAt, 'Modification');
  if (record.schemaVersion !== INTERVIEW_SCHEMA_VERSION) fail('Version de fiche entretien non prise en charge.');
}
function unique(values = []) { if (!Array.isArray(values)) fail('Une sélection doit être une liste.'); return [...new Set(values)]; }
function fields(input, names) { return Object.fromEntries(names.map(key => [key, text(input[key])])); }
const PERSON_TEXT = ['name', 'role', 'institution', 'district', 'commune', 'fokontany', 'contact', 'notes'];

export function validatePerson(record) {
  base(record);
  for (const key of PERSON_TEXT) string(record[key], key);
  if (!record.name.trim()) fail('Renseignez le nom de la personne.');
  permits(record.permitIds);
  return record;
}
export function createPerson(input = {}) {
  const at = input.createdAt || now();
  return validatePerson({ id: input.id || newId('person'), schemaVersion: INTERVIEW_SCHEMA_VERSION, ...fields(input, PERSON_TEXT), permitIds: unique(input.permitIds), createdAt: at, updatedAt: input.updatedAt || at });
}
export function validateMeeting(record) {
  base(record);
  for (const key of ['title', 'location', 'notes']) string(record[key], key);
  date(record.date, 'Date de réunion', true); permits(record.permitIds);
  return record;
}
export function createMeeting(input = {}) {
  const at = input.createdAt || now();
  return validateMeeting({ id: input.id || newId('meeting'), schemaVersion: INTERVIEW_SCHEMA_VERSION, ...fields(input, ['title', 'location', 'notes']), date: text(input.date, at.slice(0, 10)), permitIds: unique(input.permitIds), createdAt: at, updatedAt: input.updatedAt || at });
}
export function validateAnswer(answer, interview, questionId = answer?.questionId) {
  object(answer, 'Réponse'); id(questionId, 'Question');
  if (answer.questionId !== questionId) fail('Identifiant de question incohérent.');
  object(answer.questionSnapshot, 'Copie de la question');
  if (answer.questionSnapshot.id !== questionId) fail('La copie de la question ne correspond pas à la réponse.');
  if (!ANSWER_STATUSES.includes(answer.status)) fail('État de réponse invalide.');
  if (!ANSWER_PROVENANCE.includes(answer.provenance)) fail('Provenance invalide.');
  if (!ANSWER_QUALITIES.includes(answer.quality)) fail('Qualité invalide.');
  object(answer.scope, 'Portée');
  if (!ANSWER_SCOPES.includes(answer.scope.type)) fail('Portée invalide.');
  permits(answer.scope.permitIds);
  if (answer.scope.type === 'permits') {
    if (!answer.scope.permitIds.length || answer.scope.permitIds.some(permitId => !interview.permitIds.includes(permitId))) fail('La portée doit désigner des permis de cet entretien.');
  } else if (answer.scope.permitIds.length) fail('Seule une portée par permis contient une sélection de titres.');
  if (answer.scope.type === 'all' && !interview.permitIds.length) fail('Cet entretien général ne possède aucun permis.');
  if (answer.sourcePersonId !== null) id(answer.sourcePersonId, 'Personne source');
  for (const key of ['complement', 'source']) string(answer[key], key);
  date(answer.date, 'Date de la source', true); iso(answer.updatedAt, 'Date de réponse');
  for (const key of ['assetIds', 'observationIds']) list(answer[key], key);
  if (typeof answer.revisit !== 'boolean') fail('Indicateur de reprise invalide.');
  if (answer.location != null) validateLocation(answer.location);
  if (answer.questionSnapshot.type === 'location' && answer.value != null) validateLocation(answer.value);
  if (answer.questionSnapshot.type === 'number' && answer.value != null && (typeof answer.value !== 'number' || !Number.isFinite(answer.value))) fail('La réponse numérique doit être un nombre fini.');
  if (answer.captions !== undefined) validateCaptions(answer.captions);
  return answer;
}
function validateCaptions(captions) {
  object(captions, 'Légendes');
  if (Object.keys(captions).length > 10000) fail('Trop de légendes.');
  for (const [assetId, caption] of Object.entries(captions)) { id(assetId, 'Fichier de légende'); string(caption, 'Légende'); }
}
function validateLocation(location) {
  object(location, 'Localisation');
  if (typeof location.lat !== 'number' || !Number.isFinite(location.lat) || Math.abs(location.lat) > 90 || typeof location.lng !== 'number' || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180) fail('Coordonnées GPS invalides.');
  if (location.accuracy != null && (typeof location.accuracy !== 'number' || !Number.isFinite(location.accuracy) || location.accuracy < 0)) fail('Précision GPS invalide.');
}
export function validateInterview(record) {
  base(record); id(record.personId, 'Personne');
  if (record.meetingId !== null) id(record.meetingId, 'Réunion');
  permits(record.permitIds); date(record.date, 'Date d’entretien', true);
  for (const key of ['location', 'notes']) string(record[key], key);
  if (!['quick', 'complete'].includes(record.mode) || !['draft', 'complete'].includes(record.status)) fail('Mode ou statut d’entretien invalide.');
  if (!Number.isSafeInteger(record.revision) || record.revision < 0) fail('Révision invalide.');
  for (const key of ['assetIds', 'observationIds']) list(record[key], key);
  if (record.captions !== undefined) validateCaptions(record.captions);
  if (record.personSnapshot !== null) { object(record.personSnapshot, 'Copie de la personne'); if (record.personSnapshot.id !== record.personId) fail('La copie de la personne ne correspond pas à cet entretien.'); }
  object(record.answers, 'Réponses');
  if (Object.keys(record.answers).length > 10000) fail('Cet entretien contient trop de réponses.');
  for (const [questionId, answer] of Object.entries(record.answers)) validateAnswer(answer, record, questionId);
  for (const key of ['customQuestions', 'noteEntries', 'history']) if (!Array.isArray(record[key]) || record[key].length > 100000) fail(`${key} invalide.`);
  const questionIds = new Set();
  for (const question of record.customQuestions) {
    object(question, 'Question personnalisée'); id(question.id, 'Question personnalisée');
    if (questionIds.has(question.id)) fail('Une question personnalisée est répétée.');
    questionIds.add(question.id);
  }
  const noteIds = new Set();
  for (const note of record.noteEntries) {
    object(note, 'Note'); id(note.id, 'Note'); string(note.text, 'Note'); iso(note.at, 'Date de note');
    if (noteIds.has(note.id)) fail('Une note est répétée.');
    noteIds.add(note.id);
    if (note.assetIds !== undefined) list(note.assetIds, 'Fichiers de note');
    if (note.observationIds !== undefined) list(note.observationIds, 'Observations de note');
    if (note.location != null) validateLocation(note.location);
  }
  for (const event of record.history) {
    object(event, 'Historique'); iso(event.at, 'Date d’historique');
    if (event.startedAt !== undefined) iso(event.startedAt, 'Début d’historique');
    if (!['answer', 'metadata', 'note'].includes(event.type)) fail('Événement d’historique invalide.');
    if (event.type === 'answer' && event.previous !== null) validateAnswer(event.previous, { ...record, permitIds: unique([...record.permitIds, ...(event.previous.scope?.permitIds || [])]) }, event.questionId);
  }
  return record;
}
export function createInterview(input = {}) {
  const at = input.createdAt || now(), person = input.personSnapshot || input.person || null;
  return validateInterview({
    id: input.id || newId('interview'), schemaVersion: INTERVIEW_SCHEMA_VERSION,
    personId: input.personId || person?.id, personSnapshot: person ? copy(person) : null,
    meetingId: input.meetingId || null, permitIds: unique(input.permitIds),
    date: text(input.date, at.slice(0, 10)), location: text(input.location),
    mode: input.mode || 'quick', status: input.status || 'draft', notes: text(input.notes),
    noteEntries: copy(input.noteEntries || []), answers: copy(input.answers || {}), customQuestions: copy(input.customQuestions || []),
    assetIds: unique(input.assetIds), observationIds: unique(input.observationIds), captions: copy(input.captions || {}), history: copy(input.history || []),
    revision: input.revision || 0, createdAt: at, updatedAt: input.updatedAt || at
  });
}
/** Preserve the first question snapshot even when a reusable template later changes. */
export function writeAnswer(interview, question, patch = {}, at = now()) {
  validateInterview(interview); object(question, 'Question'); id(question.id, 'Question');
  const record = copy(interview), previous = record.answers[question.id] || null;
  const initial = {
    questionId: question.id, questionSnapshot: copy(question), value: null, complement: '', status: 'answered',
    scope: { type: record.permitIds.length ? 'all' : 'general', permitIds: [] },
    provenance: 'declaration', quality: 'to-confirm', sourcePersonId: record.personId, source: '',
    date: record.date, assetIds: [], observationIds: [], revisit: false, updatedAt: at
  };
  const answer = { ...(previous || initial), ...copy(patch), questionId: question.id, questionSnapshot: copy(previous?.questionSnapshot || question), updatedAt: at };
  if (patch.scope) answer.scope = { type: patch.scope.type, permitIds: unique(patch.scope.permitIds) };
  for (const key of ['assetIds', 'observationIds']) answer[key] = unique(answer[key]);
  // A changed declaration becomes uncertain again unless the collector explicitly verifies it.
  if (previous && previous.quality === 'confirmed' && !Object.hasOwn(patch, 'quality') && (Object.hasOwn(patch, 'value') && JSON.stringify(previous.value) !== JSON.stringify(patch.value) || Object.hasOwn(patch, 'complement') && previous.complement !== patch.complement || Object.hasOwn(patch, 'provenance') && previous.provenance !== patch.provenance)) answer.quality = 'to-confirm';
  validateAnswer(answer, record);
  record.answers[question.id] = answer;
  const patchKeys = Object.keys(patch).sort();
  const typing = patchKeys.every(key => ['value', 'complement', 'status', 'period', 'captions'].includes(key)) && (Object.hasOwn(patch, 'complement') || Object.hasOwn(patch, 'period') || Object.hasOwn(patch, 'captions') || ['text', 'observation'].includes(question.type) && typeof patch.value === 'string');
  appendHistory(record, { type: 'answer', questionId: question.id, at, previous: copy(previous), revision: record.revision + 1 }, typing ? `answer:${question.id}:${patchKeys.join(',')}` : null);
  record.revision++; record.updatedAt = at;
  return validateInterview(record);
}
export function updateInterview(interview, patch = {}, at = now()) {
  validateInterview(interview);
  const keys = ['personId', 'personSnapshot', 'meetingId', 'permitIds', 'date', 'location', 'mode', 'status', 'notes', 'assetIds', 'observationIds', 'captions', 'customQuestions'];
  const record = copy(interview), previous = {};
  for (const key of keys) if (Object.hasOwn(patch, key)) { previous[key] = copy(record[key]); record[key] = copy(patch[key]); }
  // References cannot silently change the attribution of already collected answers.
  if (record.personId !== interview.personId && Object.keys(record.answers).length) fail('Créez un autre entretien pour changer de personne après la collecte.');
  const patchKeys = Object.keys(previous).sort(), typing = patchKeys.length && patchKeys.every(key => ['notes', 'location', 'captions'].includes(key));
  appendHistory(record, { type: 'metadata', at, previous, revision: record.revision + 1 }, typing ? `metadata:${patchKeys.join(',')}` : null);
  record.revision++; record.updatedAt = at;
  return validateInterview(record);
}
function appendHistory(record, event, editing) {
  const previous = record.history.at(-1), elapsed = previous ? Date.parse(event.at) - Date.parse(previous.startedAt || previous.at) : Infinity;
  if (editing && previous?.editing === editing && elapsed >= 0 && elapsed < 30000) {
    previous.startedAt ||= previous.at;
    previous.at = event.at; previous.revision = event.revision;
    previous.coalescedChanges = (previous.coalescedChanges || 1) + 1;
    return;
  }
  if (editing) event.editing = editing;
  record.history.push(event);
}
export function addInterviewNote(interview, note, at = now()) {
  validateInterview(interview);
  const record = copy(interview), entry = typeof note === 'string' ? { text: note } : copy(note);
  entry.id ||= newId('note'); entry.at ||= at;
  record.noteEntries.push(entry);
  record.history.push({ type: 'note', noteId: entry.id, at, revision: record.revision + 1 });
  record.revision++; record.updatedAt = at;
  return validateInterview(record);
}
/** General district/commune answers are presented as context, never permit-specific facts. */
export function answerPermitIds(interview, answer) {
  if (answer.scope.type === 'all') return [...interview.permitIds];
  if (answer.scope.type === 'permits') return answer.scope.permitIds.filter(id => interview.permitIds.includes(id));
  return [];
}
export function appliesToPermit(interview, answer, permitId) { return answerPermitIds(interview, answer).includes(String(permitId)); }
export function interviewsForPermit(interviews, permitId) { return interviews.filter(interview => interview.permitIds.includes(String(permitId))); }
