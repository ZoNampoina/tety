import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerson, createMeeting, createInterview, validateInterview, writeAnswer, updateInterview, addInterviewNote, answerPermitIds, appliesToPermit, interviewsForPermit } from '../dist/interviews.mjs';
import { STORE_NAMES, createArchive, validateArchive, mergeArchiveRecords, saveInterviewDraft, readInterviews, reconcileInterviewDrafts, readEmergencyInterviews } from '../dist/storage.mjs';

const at = '2026-10-15T08:00:00.000Z';
const later = '2026-10-15T08:01:00.000Z';
const person = () => createPerson({ id: 'p', name: 'Rakoto', role: 'Maire', commune: 'Marosangy', createdAt: at });
const meeting = () => createMeeting({ id: 'm', title: 'Consultation', date: '2026-10-15', location: 'Mairie', permitIds: ['39985', '40378'], createdAt: at });
const interview = (input = {}) => createInterview({ id: 'i', person: person(), meetingId: 'm', permitIds: ['39985', '40378'], createdAt: at, ...input });
const question = { id: 'mining_presence', title: 'Existe-t-il des activités d’orpaillage ?', theme: 'mining', type: 'boolean', suggestions: ['Oui', 'Non'], documentSection: 'Contexte minier' };
const empty = () => Object.fromEntries(STORE_NAMES.map(name => [name, []]));
function records(record = interview()) { return { ...empty(), interviewPeople: [person()], interviewMeetings: [meeting()], interviews: [record] }; }
async function portable(value) { return JSON.parse(await (await createArchive(value)).text()); }

test('one meeting retains separate interviews and repeated interviews with the same person', () => {
  const first = interview(), second = interview({ id: 'i2', date: '2026-10-16' });
  const third = interview({ id: 'i3', person: createPerson({ id: 'p2', name: 'Rabe', role: 'Chef de district', createdAt: at }) });
  assert.equal(new Set([first, second, third].map(item => item.id)).size, 3);
  assert.equal(first.personId, second.personId);
  assert.equal(first.meetingId, third.meetingId);
  assert.equal(interviewsForPermit([first, second, third], '40378').length, 3);
  assert.deepEqual(first.answers, {});
  assert.throws(() => createPerson({ name: '' }), /nom/);
  assert.throws(() => createPerson({ name: 'Personne', permitIds: '40378' }), /liste/);
  assert.throws(() => interview({ permitIds: ['<script>'] }), /Numéro/);
  assert.throws(() => createMeeting({ date: '2026-02-30' }), /impossible/);
});

test('answers retain immutable question and person snapshots, provenance and scoped permits', () => {
  const source = person(), first = createInterview({ id: 'i', person: source, permitIds: ['39985', '40378'], createdAt: at });
  const captured = writeAnswer(first, question, { value: true, scope: { type: 'permits', permitIds: ['40378'] }, source: 'Déclaration du maire' }, at);
  source.name = 'Nom modifié'; question.suggestions.push('Autre');
  assert.equal(captured.personSnapshot.name, 'Rakoto');
  assert.deepEqual(captured.answers.mining_presence.questionSnapshot.suggestions, ['Oui', 'Non']);
  assert.equal(captured.answers.mining_presence.quality, 'to-confirm');
  assert.equal(captured.answers.mining_presence.provenance, 'declaration');
  assert.equal(captured.answers.mining_presence.sourcePersonId, 'p');
  assert.deepEqual(answerPermitIds(captured, captured.answers.mining_presence), ['40378']);
  assert.equal(appliesToPermit(captured, captured.answers.mining_presence, '39985'), false);
  assert.equal(appliesToPermit(captured, captured.answers.mining_presence, '40378'), true);
  assert.deepEqual(first.answers, {});
  question.suggestions.pop();
});

test('general and geographic contexts never become permit-specific statements', () => {
  for (const type of ['commune', 'district', 'general']) {
    const record = writeAnswer(interview(), question, { value: 'Contexte local', scope: { type, permitIds: [] } }, at);
    assert.deepEqual(answerPermitIds(record, record.answers.mining_presence), []);
  }
  const general = writeAnswer(interview({ permitIds: [] }), question, { value: 'Sans permis' }, at);
  assert.equal(general.answers.mining_presence.scope.type, 'general');
  assert.throws(() => writeAnswer(interview(), question, { scope: { type: 'permits', permitIds: ['40466'] } }), /portée/);
  assert.throws(() => writeAnswer(general, question, { scope: { type: 'all', permitIds: [] } }), /aucun permis/);
});

test('important edits retain history and never confirm information implicitly', () => {
  let record = writeAnswer(interview(), question, { value: true, provenance: 'verified' }, at);
  assert.equal(record.answers.mining_presence.quality, 'to-confirm');
  record = writeAnswer(record, { ...question, title: 'Modèle modifié' }, { quality: 'confirmed' }, later);
  assert.equal(record.answers.mining_presence.quality, 'confirmed');
  assert.equal(record.answers.mining_presence.questionSnapshot.title, question.title);
  record = writeAnswer(record, question, { value: false }, '2026-10-15T08:02:00.000Z');
  assert.equal(record.answers.mining_presence.quality, 'to-confirm');
  assert.equal(record.history.at(-1).previous.value, true);
  assert.equal(record.history.at(-1).previous.quality, 'confirmed');
  assert.equal(record.revision, 3);
  record = updateInterview(record, { mode: 'complete', notes: 'À approfondir' }, '2026-10-15T08:03:00.000Z');
  assert.equal(record.answers.mining_presence.value, false);
  assert.equal(record.history.at(-1).previous.mode, 'quick');
  assert.throws(() => updateInterview(record, { personId: 'other', personSnapshot: null }), /autre entretien/);
});

test('notes, GPS, custom questions and all uncertainty states remain recoverable', () => {
  let record = updateInterview(interview(), { customQuestions: [{ id: 'custom', title: 'Autre localité ?', type: 'text' }] }, later);
  record = addInterviewNote(record, { text: 'Point d’eau signalé', location: { lat: -21.1, lng: 48.2, accuracy: 10 }, assetIds: [], observationIds: [] }, later);
  for (const status of ['unknown', 'not-applicable', 'refused', 'verify', 'skipped']) record = writeAnswer(record, { id: status, title: status }, { status }, later);
  assert.equal(record.noteEntries[0].at, later);
  assert.equal(record.customQuestions.length, 1);
  assert.equal(Object.keys(record.answers).length, 5);
  assert.throws(() => addInterviewNote(record, { text: 'GPS invalide', location: { lat: 95, lng: 0 } }), /GPS/);
  assert.equal(validateInterview(record), record);
});

test('text keystrokes coalesce for thirty seconds while discrete answers preserve each change', () => {
  let record = interview();
  const q = { id: 'free', label: 'Précisions', type: 'text' };
  for (let index = 0; index < 20; index++) record = writeAnswer(record, q, { value: 'x'.repeat(index + 1), status: 'answered' }, `2026-10-15T08:00:${String(index).padStart(2, '0')}.000Z`);
  assert.equal(record.history.length, 1);
  assert.equal(record.history[0].previous, null);
  assert.equal(record.history[0].coalescedChanges, 20);
  assert.equal(record.history[0].revision, 20);
  assert.equal(record.history[0].at, '2026-10-15T08:00:19.000Z');
  record = writeAnswer(record, q, { value: 'Autre session', status: 'answered' }, later);
  assert.equal(record.history.length, 2);
  assert.equal(record.history[1].previous.value, 'x'.repeat(20));
  record = updateInterview(record, { notes: 'A' }, later);
  record = updateInterview(record, { notes: 'ABC' }, '2026-10-15T08:01:01.000Z');
  assert.equal(record.history.length, 3);
  assert.equal(record.history.at(-1).previous.notes, '');
  record = writeAnswer(record, question, { value: true }, later);
  record = writeAnswer(record, question, { value: false }, later);
  assert.equal(record.history.length, 5);
});

test('numeric and location responses enforce meaningful values and attachment captions survive edits', () => {
  assert.throws(() => writeAnswer(interview(), { id: 'gps', type: 'location' }, { value: { lat: 100, lng: 48 } }), /GPS/);
  assert.throws(() => writeAnswer(interview(), { id: 'gps', type: 'location' }, { value: 'ailleurs' }), /Localisation/);
  assert.throws(() => writeAnswer(interview(), { id: 'number', type: 'number' }, { value: Infinity }), /nombre fini/);
  assert.throws(() => writeAnswer(interview(), { id: 'number', type: 'number' }, { value: 'dix' }), /nombre fini/);
  assert.equal(writeAnswer(interview(), { id: 'number', type: 'number', unit: 'personnes' }, { value: 10 }).answers.number.value, 10);
  const record = updateInterview(interview(), { captions: { a: 'Document présenté' } }, later);
  assert.equal(record.captions.a, 'Document présenté');
});

test('old portable archives remain supported and new records round-trip with binary evidence', async () => {
  const old = { format: 'tety-portable-archive', schemaVersion: 1, stores: { observations: [{ id: 'old', notes: 'Préservé' }], assets: [], missions: [], drafts: [], settings: [] } };
  const restored = await validateArchive(old);
  assert.equal(restored.observations[0].notes, 'Préservé');
  assert.deepEqual(restored.interviews, []);
  const record = updateInterview(writeAnswer(interview(), question, { value: true, assetIds: ['a'], observationIds: ['o'], captions: { a: 'Pièce présentée' } }, at), { captions: { a: 'Pièce présentée' } }, later);
  const source = records(record);
  source.assets.push({ id: 'a', blob: new Blob(['preuve']), type: 'text/plain', kind: 'document', name: 'preuve.txt' });
  source.observations.push({ id: 'o', notes: 'Visite de terrain' });
  const archive = await portable(source), result = await validateArchive(archive);
  assert.deepEqual(result.interviews, [record]);
  assert.equal(await result.assets[0].blob.text(), 'preuve');
});

test('missing people, meetings, source people, observations and evidence reject an archive', async () => {
  for (const [collection, key] of [['interviewPeople', 'personId'], ['interviewMeetings', 'meetingId']]) {
    const source = records(); source[collection] = [];
    await assert.rejects(createArchive(source), cause => cause.code === 'MISSING_REFERENCE' && cause.message.includes(key));
  }
  for (const patch of [{ sourcePersonId: 'absent' }, { assetIds: ['absent'] }, { observationIds: ['absent'] }, { captions: { absent: 'Légende sans document' } }]) {
    const source = records(writeAnswer(interview(), question, { value: true, ...patch }, at));
    await assert.rejects(createArchive(source), cause => cause.code === 'MISSING_REFERENCE');
  }
});

test('restore collisions preserve all testimony and remap person snapshots, sources, meetings and evidence', () => {
  const current = records(writeAnswer(interview(), question, { value: false }, at));
  const incoming = records(writeAnswer(interview(), question, { value: true, assetIds: ['a'], observationIds: ['o'], captions: { a: 'Pièce présentée' } }, at));
  current.interviewPeople[0].name = 'Ancien nom'; current.interviewMeetings[0].title = 'Ancienne réunion';
  current.assets = [{ id: 'a', type: 'text/plain', sha256: 'old' }]; incoming.assets = [{ id: 'a', type: 'text/plain', sha256: 'new' }];
  current.observations = [{ id: 'o', notes: 'old' }]; incoming.observations = [{ id: 'o', notes: 'new' }];
  const plan = mergeArchiveRecords(current, incoming, (id, collection) => `${id}~copy-${collection}`);
  assert.equal(plan.merged.interviews.length, 2);
  const imported = plan.additions.interviews[0], answer = imported.answers.mining_presence;
  assert.equal(imported.personId, 'p~copy-interviewPeople');
  assert.equal(imported.personSnapshot.id, imported.personId);
  assert.equal(answer.sourcePersonId, imported.personId);
  assert.equal(imported.meetingId, 'm~copy-interviewMeetings');
  assert.deepEqual(answer.assetIds, ['a~copy-assets']);
  assert.deepEqual(answer.observationIds, ['o~copy-observations']);
  assert.deepEqual(answer.captions, { 'a~copy-assets': 'Pièce présentée' });
  assert.equal(plan.merged.interviews[0].answers.mining_presence.value, false);
  assert.equal(imported.answers.mining_presence.value, true);
});

test('reimporting an identical conflicting archive reuses prior copies and preserves cyclic references', () => {
  const existing = records(writeAnswer(interview(), question, { value: false }, at));
  const incoming = records(writeAnswer(interview(), question, { value: true, assetIds: ['a'], observationIds: ['o'], captions: { a: 'Pièce' } }, at));
  existing.interviewPeople[0].name = 'Profil ancien'; existing.interviewMeetings[0].title = 'Réunion ancienne';
  existing.assets = [{ id: 'a', type: 'text/plain', sha256: 'old' }]; incoming.assets = [{ id: 'a', type: 'text/plain', sha256: 'new' }];
  existing.missions = [{ id: 'mission', title: 'Ancienne mission', observationIds: ['o'] }];
  incoming.missions = [{ id: 'mission', title: 'Mission importée', observationIds: ['o'] }];
  existing.observations = [{ id: 'o', notes: 'Ancien point', missionId: 'mission', assetIds: ['a'] }];
  incoming.observations = [{ id: 'o', notes: 'Point importé', missionId: 'mission', assetIds: ['a'] }];
  existing.settings = [{ id: 'activeMission', value: 'mission' }]; incoming.settings = [{ id: 'activeMission', value: 'mission' }];
  const first = mergeArchiveRecords(existing, incoming);
  assert.ok(first.added >= 7);
  const second = mergeArchiveRecords(first.merged, incoming);
  assert.equal(second.added, 0);
  assert.equal(second.conflicts, 0);
  assert.deepEqual(second.merged, first.merged);
  for (const name of ['assets', 'observations', 'missions', 'interviewPeople', 'interviewMeetings', 'interviews', 'settings']) assert.deepEqual(second.idMap[name], first.idMap[name]);
});

test('restore planning compares the latest recovery edit and keeps an older imported version separately', () => {
  const original = writeAnswer(interview(), question, { value: 'Version archivée' }, at);
  const latest = writeAnswer(original, question, { value: 'Saisie locale interrompue' }, later);
  const existing = records(original);
  existing.interviews = reconcileInterviewDrafts(existing.interviews, [latest]);
  const plan = mergeArchiveRecords(existing, records(original), id => `${id}~archive`);
  assert.equal(plan.merged.interviews.length, 2);
  assert.equal(plan.merged.interviews[0].answers.mining_presence.value, 'Saisie locale interrompue');
  assert.equal(plan.additions.interviews[0].answers.mining_presence.value, 'Version archivée');
  const identical = mergeArchiveRecords(existing, records(latest));
  assert.equal(identical.added, 0);
  assert.equal(identical.conflicts, 0);
});

test('divergent recovery variants of the same revision export separately with stable copy IDs', async () => {
  const committed = writeAnswer(interview(), question, { value: 'Version A' }, at);
  const pending = writeAnswer(interview(), question, { value: 'Version B' }, later);
  const resolved = reconcileInterviewDrafts([committed], [pending]);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].answers.mining_presence.value, 'Version A');
  assert.equal(resolved[1].answers.mining_presence.value, 'Version B');
  assert.equal(resolved[1].recoveryOf, committed.id);
  assert.match(resolved[1].id, /~recovery-/);
  assert.deepEqual(reconcileInterviewDrafts([committed], [pending]), resolved);
  assert.deepEqual(reconcileInterviewDrafts(resolved, [pending]), resolved);
  const archive = await portable({ ...records(), interviews: resolved });
  assert.equal((await validateArchive(archive)).interviews.length, 2);
  // More typing after detecting a collision must retain A, even at a greater revision.
  const continued = { ...writeAnswer(pending, question, { value: 'Version B complétée' }, '2026-10-15T08:02:00Z'), recoveryConflict: true };
  const withContinued = reconcileInterviewDrafts([committed], [continued]);
  assert.equal(withContinued.length, 2);
  assert.equal(withContinued[0].answers.mining_presence.value, 'Version A');
  assert.equal(withContinued[1].answers.mining_presence.value, 'Version B complétée');
  const committedLater = writeAnswer(committed, question, { value: 'Version A plus avancée' }, '2026-10-15T08:03:00Z');
  const olderAttempt = { ...pending, recoveryConflict: true };
  const olderResolved = reconcileInterviewDrafts([committedLater], [olderAttempt]);
  assert.equal(olderResolved.length, 2);
  assert.equal(olderResolved[0].answers.mining_presence.value, 'Version A plus avancée');
  assert.equal(olderResolved[1].answers.mining_presence.value, 'Version B');
  // A genuinely old untouched recovery remains ignored when no rejected new attempt marked it.
  assert.deepEqual(reconcileInterviewDrafts([committedLater], [pending]), [committedLater]);
});

test('synchronous emergency saving recovers the last keystroke even when IndexedDB is unavailable', async () => {
  const values = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = { get length() { return values.size; }, key(index) { return [...values.keys()][index] ?? null; }, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
  try {
    const originalRecord = interview(), latest = writeAnswer(originalRecord, question, { value: 'Dernière saisie' }, later);
    const pending = saveInterviewDraft(latest);
    assert.equal(readEmergencyInterviews()[0].answers.mining_presence.value, 'Dernière saisie');
    await assert.rejects(pending, cause => cause.code === 'STORAGE_UNAVAILABLE');
    assert.equal((await readInterviews())[0].answers.mining_presence.value, 'Dernière saisie');
    assert.equal(reconcileInterviewDrafts([originalRecord])[0].revision, 1);
    const newer = writeAnswer(latest, question, { value: 'Déjà enregistré' }, '2026-10-15T08:02:00Z');
    assert.equal(reconcileInterviewDrafts([newer])[0].answers.mining_presence.value, 'Déjà enregistré');
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
