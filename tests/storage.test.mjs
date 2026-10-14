import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createArchive, validateArchive, mergeArchiveRecords, importArchive, openStore, MAX_ASSET_BYTES } from '../dist/storage.mjs';

function empty() { return { observations: [], assets: [], missions: [], drafts: [], settings: [] }; }
function portable(stores = empty()) { return { format: 'tety-portable-archive', schemaVersion: 1, stores }; }
async function decoded(records) { return JSON.parse(await (await createArchive(records)).text()); }
function validPermit(id = '42278') {
  return { id, name: `AERP ${id}`, holder: null, district: '', region: '', count: 1, cells: [{ x: 625, y: 625, lat: -20, lng: 48 }], contours: [[{lat:-20.01,lng:47.99},{lat:-19.99,lng:47.99},{lat:-19.99,lng:48.01},{lat:-20.01,lng:47.99}]], bounds: {minLat:-20.01,maxLat:-19.99,minLng:47.99,maxLng:48.01}, expiry: '2026-10-19', grant: null, communes: [{name:'Commune à confirmer',count:1}] };
}

test('a portable archive round-trips GPS, incomplete points and binary attachments', async () => {
  const records = empty();
  records.missions.push({ id: 'mission-1', title: 'Nosy Varika' });
  records.assets.push({ id: 'photo-1', name: 'terrain.jpg', kind: 'photo', type: 'image/jpeg', blob: new Blob([Uint8Array.of(0, 255, 37, 65)], { type: 'image/jpeg' }) });
  records.observations.push({ id: 'point-1', missionId: 'mission-1', lat: -20.1, lng: 48.3, accuracy: 9, assetIds: ['photo-1'], questionnaire: { water: null }, notes: 'Observation de terrain' });
  records.drafts.push({ id: 'draft-1', lat: null, lng: null, assetIds: [] });
  records.settings.push({ id: 'permits', value: [validPermit()] });
  const archive = await decoded(records);
  assert.match(archive.stores.assets[0].sha256, /^[a-f0-9]{64}$/);
  const restored = await validateArchive(archive);
  assert.deepEqual(restored.observations, records.observations);
  assert.deepEqual(new Uint8Array(await restored.assets[0].blob.arrayBuffer()), Uint8Array.of(0, 255, 37, 65));
  assert.equal(restored.assets[0].blob.type, 'image/jpeg');
  assert.deepEqual(restored.settings, records.settings);
});

test('malformed or unsupported archives and nonfinite nested numbers are rejected', async () => {
  await assert.rejects(validateArchive({ ...portable(), schemaVersion: 2 }), /Version/);
  await assert.rejects(validateArchive({ ...portable(), stores: { observations: [] } }), /absente/);
  const records = empty();
  records.settings.push({ id: 'bad', nested: { measurement: Infinity } });
  await assert.rejects(validateArchive(portable(records)), /non fini/);
  const prototype = JSON.parse('{"format":"tety-portable-archive","schemaVersion":1,"__proto__":{},"stores":{}}');
  await assert.rejects(validateArchive(prototype), /clé réservée/);
});

test('missing references, duplicate IDs and impossible GPS values are rejected', async () => {
  const records = empty();
  records.observations.push({ id: 'bad', lat: 91, lng: 0, assetIds: [] });
  await assert.rejects(validateArchive(portable(records)), /Coordonnée/);
  records.observations[0].lat = 0;
  records.observations[0].assetIds.push('missing');
  await assert.rejects(validateArchive(portable(records)), /absente/);
  records.observations[0].assetIds = [];
  records.observations[0].missionId = 'missing-mission';
  await assert.rejects(validateArchive(portable(records)), /absente/);
  delete records.observations[0].missionId;
  records.observations.push({ ...records.observations[0] });
  await assert.rejects(validateArchive(portable(records)), /répété/);
});

test('checksum, declared size, encoding and MIME validation catch damaged files', async () => {
  const records = empty();
  records.assets.push({ id: 'a', blob: new Blob(['ABC']), type: 'text/plain' });
  const archive = await decoded(records);
  archive.stores.assets[0].dataBase64 = btoa('ABD');
  await assert.rejects(validateArchive(archive), cause => cause.code === 'CHECKSUM_MISMATCH');
  archive.stores.assets[0].dataBase64 = btoa('ABC');
  archive.stores.assets[0].bytes = 4;
  await assert.rejects(validateArchive(archive), /taille annoncée/);
  archive.stores.assets[0].bytes = 3;
  archive.stores.assets[0].dataBase64 = '!!!=';
  await assert.rejects(validateArchive(archive), /encodé invalide/);
  archive.stores.assets[0].dataBase64 = btoa('ABC');
  archive.stores.assets[0].type = 'text/plain\r\ninjected';
  await assert.rejects(validateArchive(archive), /Type de fichier/);
  archive.stores.assets[0].bytes = MAX_ASSET_BYTES + 1;
  await assert.rejects(validateArchive(archive), /Taille de fichier/);
});

test('all collisions preserve existing data and remap observations, nested drafts and missions', () => {
  const existing = empty(), incoming = empty();
  existing.assets.push({ id: 'a', type: 'image/jpeg', bytes: 1, sha256: 'old' });
  incoming.assets.push({ id: 'a', type: 'image/jpeg', bytes: 1, sha256: 'new' });
  existing.missions.push({ id: 'm', title: 'Ancienne mission', observationIds: ['o'] });
  incoming.missions.push({ id: 'm', title: 'Nouvelle mission', observationIds: ['o'] });
  existing.observations.push({ id: 'o', missionId: 'm', notes: 'same', assetIds: ['a'] });
  incoming.observations.push({ id: 'o', missionId: 'm', notes: 'same', assetIds: ['a'] });
  incoming.drafts.push({ id: 'd', nested: { observationId: 'o', assetIds: ['a'], missionId: 'm' } });
  existing.settings.push({ id: 'permits', value: [{ ...validPermit(), name: 'ancien' }] });
  incoming.settings.push({ id: 'permits', value: [{ ...validPermit(), name: 'corrigé' }] });
  const plan = mergeArchiveRecords(existing, incoming, (id, name) => `${id}-copy-${name}`);
  assert.equal(plan.conflicts, 4);
  assert.equal(plan.added, 5);
  assert.deepEqual(plan.merged.assets[0], existing.assets[0]);
  assert.deepEqual(plan.merged.observations[0], existing.observations[0]);
  const observation = plan.additions.observations[0];
  assert.equal(observation.id, 'o-copy-observations');
  assert.equal(observation.missionId, 'm-copy-missions');
  assert.deepEqual(observation.assetIds, ['a-copy-assets']);
  assert.deepEqual(plan.additions.missions[0].observationIds, ['o-copy-observations']);
  assert.deepEqual(plan.additions.drafts[0].nested, { observationId: observation.id, assetIds: observation.assetIds, missionId: observation.missionId });
  assert.equal(plan.merged.settings[0].id, 'permits');
  assert.equal(plan.merged.settings[1].id, 'permits-copy-settings');
});

test('identical records in a different key order are not duplicated', () => {
  const existing = empty(), incoming = empty();
  existing.observations.push({ id: 'o', notes: 'x', assetIds: [], questionnaire: { b: 1, a: 2 } });
  incoming.observations.push({ questionnaire: { a: 2, b: 1 }, assetIds: [], notes: 'x', id: 'o' });
  const plan = mergeArchiveRecords(existing, incoming);
  assert.equal(plan.added, 0);
  assert.equal(plan.identical, 1);
  assert.equal(plan.conflicts, 0);
});

test('ID allocation cannot overwrite pre-existing import copies', () => {
  const existing = empty(), incoming = empty();
  existing.missions.push({ id: 'm', title: 'old' }, { id: 'm-copy-1', title: 'earlier import' });
  incoming.missions.push({ id: 'm', title: 'new' });
  const plan = mergeArchiveRecords(existing, incoming, (id, name, attempt) => `${id}-copy-${attempt}`);
  assert.equal(plan.idMap.missions.m, 'm-copy-2');
  assert.equal(plan.merged.missions.length, 3);
});

test('invalid files are rejected before IndexedDB is opened', async () => {
  await assert.rejects(importArchive(new Blob(['not json'], { type: 'application/json' })), cause => cause.code === 'INVALID_ARCHIVE_JSON');
  await assert.rejects(importArchive(new Blob(['{}'], { type: 'image/png' })), cause => cause.code === 'INVALID_ARCHIVE_TYPE');
  await assert.rejects(importArchive(new Blob(['{}'], { type: 'application/json' })), cause => cause.code === 'UNSUPPORTED_ARCHIVE');
  await assert.rejects(openStore(), cause => cause.code === 'STORAGE_UNAVAILABLE');
});

test('drafts preserve partial manual GPS while observations require a coordinate pair', async () => {
  const records = empty();
  records.drafts.push({ id: 'partial', lat: -20.5, lng: null, accuracy: null, notes: '', questionnaire: {}, status: 'incomplete' });
  assert.equal((await validateArchive(portable(records))).drafts[0].lat, -20.5);
  records.drafts[0].lat = 91;
  await assert.rejects(validateArchive(portable(records)), /Coordonnée/);
  records.drafts[0].lat = 'bad';
  await assert.rejects(validateArchive(portable(records)), /Coordonnée/);
  records.drafts = [];
  records.observations.push({ id: 'partial', lat: -20.5, lng: null });
  await assert.rejects(validateArchive(portable(records)), /ensemble/);
  records.observations[0].lat = null;
  await validateArchive(portable(records));
});

test('point UI fields have usable text, questionnaire and status types', async () => {
  for (const key of ['title', 'notes', 'category', 'permitId']) {
    const records = empty();
    records.observations.push({ id: 'o', [key]: { injected: '<script>bad</script>' } });
    await assert.rejects(validateArchive(portable(records)), /texte/);
  }
  for (const value of [null, [], 'string']) {
    const records = empty(); records.drafts.push({ id: 'd', questionnaire: value });
    await assert.rejects(validateArchive(portable(records)), /Questionnaire/);
  }
  for (const value of [{}, 'unknown', 1]) {
    const records = empty(); records.observations.push({ id: 'o', status: value });
    await assert.rejects(validateArchive(portable(records)), /Statut/);
  }
  const records = empty(); records.drafts.push({ id: 'd', questionnaire: { tags: {} } });
  await assert.rejects(validateArchive(portable(records)), /Repères/);
});

test('real mission calendar dates and ISO timestamps reject normalized impossibilities', async () => {
  const records = empty(); records.missions.push({ id: 'm', title: 'Mission', date: '2024-02-29', createdAt: '2026-10-13T11:30:00.123Z', updatedAt: '2026-10-13T13:30:00+02:00' });
  await validateArchive(portable(records));
  records.missions[0].date = '2026-02-29';
  await assert.rejects(validateArchive(portable(records)), /impossible/);
  records.missions[0].date = '';
  records.missions[0].updatedAt = '2026-10-13T24:00:00Z';
  await assert.rejects(validateArchive(portable(records)), /heure invalide/);
  records.missions[0].updatedAt = '2026-02-30T12:00:00Z';
  await assert.rejects(validateArchive(portable(records)), /impossible/);
  records.missions[0].updatedAt = 'yesterday';
  await assert.rejects(validateArchive(portable(records)), /ISO complète/);
});

test('archive permit geometry and metadata reject malformed or deceptive shapes', async () => {
  const cases = [
    [p => {p.id = '<img>';}, /numéro/],
    [p => {p.holder = {value:'bad'};}, /texte/],
    [p => {p.cells[0].lat = '20';}, /nombre invalide/],
    [p => {p.cells[0].x = null;}, /nombre invalide/],
    [p => {p.cells.push({...p.cells[0]});p.count=2;}, /répétés/],
    [p => {p.count = 2;}, /incohérent/],
    [p => {p.contours[0][1].lng = 181;}, /nombre invalide/],
    [p => {p.contours[0].pop();}, /contour invalide/],
    [p => {p.contours[0].at(-1).lat = -20;}, /non fermé/],
    [p => {p.bounds.minLng = 49;}, /inversées/],
    [p => {p.bounds.maxLat = -20.001;}, /sort des bornes/],
    [p => {p.expiry = '2026-02-30';}, /impossible/],
    [p => {p.communes[0].count = -1;}, /nombre invalide/],
    [p => {p.communes[0].name = {bad:true};}, /texte/]
  ];
  for (const [change, pattern] of cases) {
    const records = empty(), permit = validPermit();
    change(permit); records.settings.push({id:'permits',value:[permit]});
    await assert.rejects(validateArchive(portable(records)), pattern);
  }
  const records = empty(); records.settings.push({id:'permits~import-test',value:[validPermit()]});
  await validateArchive(portable(records));
  records.settings[0].value = {};
  await assert.rejects(validateArchive(portable(records)), /liste/);
});

test('all bundled permit records satisfy the same portable archive contract', async () => {
  const records = empty();
  records.settings.push({id:'permits',value:JSON.parse(await readFile(new URL('../dist/permits.json',import.meta.url),'utf8'))});
  const verified = await validateArchive(portable(records));
  assert.equal(verified.settings[0].value.length,4);
});

test('known preference values reject unsupported types', async () => {
  for (const [id,value] of [['theme','system'],['large','true'],['wake',1],['activeMission',7],['lastExport','2026-10-13']]) {
    const records = empty();records.settings.push({id,value});
    await assert.rejects(validateArchive(portable(records)));
  }
});

test('activeMission value is a validated and remapped mission reference', async () => {
  const existing=empty(),incoming=empty();
  existing.missions.push({id:'m',name:'Locale'});incoming.missions.push({id:'m',name:'Importée'});
  existing.settings.push({id:'activeMission',value:'m'});incoming.settings.push({id:'activeMission',value:'m'});
  await validateArchive(portable(incoming));
  const plan=mergeArchiveRecords(existing,incoming,(id,store)=>`${id}~copy-${store}`);
  assert.equal(plan.idMap.missions.m,'m~copy-missions');
  assert.equal(plan.additions.settings[0].value,'m~copy-missions');
  assert.equal(plan.additions.settings[0].id,'activeMission~copy-settings');
  assert.equal(plan.merged.settings[0].value,'m');
  incoming.settings[0].value='absent';
  await assert.rejects(validateArchive(portable(incoming)),/mission active/);
});
