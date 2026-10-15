/** Tety's local database and portable, loss-preserving backup format. */
import { validatePerson, validateMeeting, validateInterview } from './interviews.mjs';
const ORIGINAL_STORES = Object.freeze(['observations', 'assets', 'missions', 'drafts', 'settings']);
const INTERVIEW_STORES = Object.freeze(['interviewPeople', 'interviewMeetings', 'interviews']);
export const STORE_NAMES = Object.freeze([...ORIGINAL_STORES, ...INTERVIEW_STORES]);
export const ARCHIVE_SCHEMA_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const DB_NAME = 'tety-field-data';
const DB_VERSION = 2;
let databasePromise;
const interviewWriteQueues = new Map();
const unresolvedInterviewConflicts = new Set();

export class StorageError extends Error {
  constructor(message, code = 'STORAGE_ERROR', cause) {
    super(message, { cause });
    this.name = 'StorageError';
    this.code = code;
  }
}
const error = (message, code = 'INVALID_DATA') => new StorageError(message, code);
function storageFailure(cause) {
  if (cause instanceof StorageError) return cause;
  const quota = cause?.name === 'QuotaExceededError';
  return new StorageError(quota ? 'Stockage plein : exportez une sauvegarde puis libérez de la place. Le point n’a pas été enregistré.' : 'Le stockage local n’a pas terminé l’enregistrement. Conservez le formulaire et réessayez.', quota ? 'QUOTA_EXCEEDED' : 'STORAGE_ERROR', cause);
}
function checkStore(name) {
  if (!STORE_NAMES.includes(name)) throw error(`Collection inconnue : ${name}.`);
}
function checkId(id, label = 'identifiant') {
  if (typeof id !== 'string' || !id.trim() || id.length > 240 || /[\u0000-\u001f]/.test(id)) throw error(`${label} invalide.`);
}
function checkJSON(value, path = 'donnée', depth = 0) {
  if (depth > 40) throw error(`${path} est trop profondément imbriquée.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw error(`${path} contient un nombre non fini.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => checkJSON(item, `${path}[${i}]`, depth + 1));
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw error(`${path} contient une valeur non exportable.`);
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw error(`${path} contient une clé réservée.`);
    checkJSON(item, `${path}.${key}`, depth + 1);
  }
}
function recordMetadata(record) {
  const result = {};
  for (const [key, value] of Object.entries(record)) if (key !== 'blob') result[key] = value;
  return result;
}
function checkText(value, label, { nullable = false, max = 1000000 } = {}) {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== 'string' || value.length > max) throw error(`${label} doit être un texte valide.`);
}
function checkCalendarDate(value, label, { nullable = false, empty = false } = {}) {
  if ((nullable && value === null) || (empty && value === '')) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw error(`${label} doit être une date YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw error(`${label} est une date impossible.`);
}
function checkISO(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw error(`${label} doit être une date ISO complète.`);
  checkCalendarDate(value.slice(0, 10), label);
  const hour = Number(value.slice(11, 13)), minute = Number(value.slice(14, 16)), second = Number(value.slice(17, 19));
  if (hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) throw error(`${label} contient une heure invalide.`);
}
function checkFinite(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw error(`${label} contient un nombre invalide.`);
}
function checkLocation(point, label, xyRequired = false) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) throw error(`${label} doit contenir des coordonnées.`);
  for (const key of ['x', 'y']) if (xyRequired || point[key] !== undefined) checkFinite(point[key], `${label}.${key}`);
  checkFinite(point.lat, `${label}.lat`, { min: -90, max: 90 });
  checkFinite(point.lng, `${label}.lng`, { min: -180, max: 180 });
}
function checkBounds(bounds, label) {
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) throw error(`${label} invalide.`);
  for (const key of ['minLat', 'maxLat']) checkFinite(bounds[key], `${label}.${key}`, { min: -90, max: 90 });
  for (const key of ['minLng', 'maxLng']) checkFinite(bounds[key], `${label}.${key}`, { min: -180, max: 180 });
  if (bounds.minLat > bounds.maxLat || bounds.minLng > bounds.maxLng) throw error(`${label} contient des bornes inversées.`);
}
function checkPermits(permits) {
  if (!Array.isArray(permits) || permits.length > 10000) throw error('Les permis doivent former une liste limitée à 10 000 titres.');
  const ids = new Set();
  let totalCells = 0, totalContourPoints = 0;
  for (const permit of permits) {
    if (!permit || typeof permit !== 'object' || Array.isArray(permit) || typeof permit.id !== 'string' || !/^\d{1,12}$/.test(permit.id)) throw error('Un numéro de permis est invalide.');
    if (ids.has(permit.id)) throw error(`Le permis ${permit.id} est répété.`);
    ids.add(permit.id);
    const label = `Permis ${permit.id}`;
    for (const key of ['holder', 'district', 'region', 'name', 'type', 'status', 'substance', 'metadataSource', 'csvSource', 'crs', 'gridUnit']) checkText(permit[key], `${label}.${key}`, { nullable: true, max: 20000 });
    for (const key of ['grant', 'expiry']) if (permit[key] !== undefined) checkCalendarDate(permit[key], `${label}.${key}`, { nullable: true });
    if (!Array.isArray(permit.cells) || permit.cells.length > 100000 || (totalCells += permit.cells.length) > 100000) throw error('La sauvegarde contient plus de 100 000 carrés ou une liste de carrés invalide.');
    checkFinite(permit.count, `${label}.count`, { min: 0, max: 100000, integer: true });
    const gridIds = new Set(), gpsIds = new Set();
    for (const cell of permit.cells) {
      checkLocation(cell, `${label}.carré`, true);
      const gridKey = `${cell.x},${cell.y}`, gpsKey = `${cell.lat},${cell.lng}`;
      if (gridIds.has(gridKey) || gpsIds.has(gpsKey)) throw error(`${label} contient un carré ou des coordonnées GPS répétés.`);
      gridIds.add(gridKey); gpsIds.add(gpsKey);
      if (cell.polygon !== undefined) {
        if (!Array.isArray(cell.polygon) || cell.polygon.length < 3 || cell.polygon.length > 100) throw error(`${label} contient un polygone de carré invalide.`);
        cell.polygon.forEach(point => checkLocation(point, `${label}.polygone`));
      }
    }
    if (permit.count !== gridIds.size) throw error(`${label} : nombre de carrés incohérent.`);
    if (permit.contours !== undefined) {
      if (!Array.isArray(permit.contours) || permit.contours.length > 100000) throw error(`${label} : contours invalides.`);
      for (const contour of permit.contours) {
        if (!Array.isArray(contour) || contour.length < 4 || (totalContourPoints += contour.length) > 1000000) throw error(`${label} : contour invalide ou trop volumineux.`);
        contour.forEach(point => checkLocation(point, `${label}.contour`));
        const first = contour[0], last = contour.at(-1);
        if (first.lat !== last.lat || first.lng !== last.lng) throw error(`${label} : contour non fermé.`);
      }
    }
    for (const key of ['bounds', 'pointBounds']) if (permit[key] !== undefined && permit[key] !== null) {
      checkBounds(permit[key], `${label}.${key}`);
      if (permit.cells.some(cell => cell.lat < permit[key].minLat - 1e-9 || cell.lat > permit[key].maxLat + 1e-9 || cell.lng < permit[key].minLng - 1e-9 || cell.lng > permit[key].maxLng + 1e-9)) throw error(`${label} : un carré sort des bornes ${key}.`);
    }
    for (const key of ['declaredCount', 'squareCount', 'blockCount']) if (permit[key] != null) checkFinite(permit[key], `${label}.${key}`, { min: 0, integer: true });
    for (const key of ['areaKm2', 'perimeterKm', 'gridStep']) if (permit[key] != null) checkFinite(permit[key], `${label}.${key}`, { min: 0 });
    for (const key of ['measurementsIndicative', 'adminVerificationRequired']) if (permit[key] !== undefined && typeof permit[key] !== 'boolean') throw error(`${label}.${key} doit être vrai ou faux.`);
    if (permit.grid != null) {
      if (typeof permit.grid !== 'object' || Array.isArray(permit.grid)) throw error(`${label} : grille invalide.`);
      if (permit.grid.step != null) checkFinite(permit.grid.step, `${label}.grid.step`, { min: Number.MIN_VALUE });
      for (const key of ['unit', 'crs', 'stepSource']) checkText(permit.grid[key], `${label}.grid.${key}`, { nullable: true, max: 20000 });
      for (const key of ['spacingVerified', 'centerAssumption']) if (permit.grid[key] !== undefined && typeof permit.grid[key] !== 'boolean') throw error(`${label}.grid.${key} doit être vrai ou faux.`);
    }
    if (permit.geometry != null) {
      if (typeof permit.geometry !== 'object' || Array.isArray(permit.geometry)) throw error(`${label} : géométrie invalide.`);
      for (const key of ['kind', 'method', 'crs', 'datum', 'warning']) checkText(permit.geometry[key], `${label}.geometry.${key}`, { nullable: true, max: 20000 });
      for (const key of ['step', 'originX', 'originY']) if (permit.geometry[key] !== undefined) checkFinite(permit.geometry[key], `${label}.geometry.${key}`, key === 'step' ? { min: Number.MIN_VALUE } : {});
      for (const key of ['rmseMeters', 'maxResidualMeters']) if (permit.geometry[key] !== undefined) checkFinite(permit.geometry[key], `${label}.geometry.${key}`, { min: 0 });
      for (const key of ['latitude', 'longitude']) if (permit.geometry[key] !== undefined) {
        if (!Array.isArray(permit.geometry[key]) || permit.geometry[key].length !== 3) throw error(`${label}.geometry.${key} invalide.`);
        permit.geometry[key].forEach(value => checkFinite(value, `${label}.geometry.${key}`));
      }
      if (permit.geometry.centerAssumption !== undefined && typeof permit.geometry.centerAssumption !== 'boolean') throw error(`${label}.geometry.centerAssumption doit être vrai ou faux.`);
    }
    for (const key of ['districts', 'diagnostics', 'contourKinds']) if (permit[key] !== undefined) {
      if (!Array.isArray(permit[key]) || permit[key].length > 100000) throw error(`${label}.${key} doit être une liste.`);
      permit[key].forEach(item => checkText(item, `${label}.${key}`, { max: 20000 }));
    }
    if (permit.contourKinds !== undefined && (permit.contourKinds.length !== (permit.contours || []).length || permit.contourKinds.some(kind => !['outer', 'hole'].includes(kind)))) throw error(`${label} : types de contours incohérents.`);
    if (permit.communes !== undefined) {
      if (!Array.isArray(permit.communes) || permit.communes.length > 100000) throw error(`${label} : communes invalides.`);
      for (const commune of permit.communes) {
        if (!commune || typeof commune !== 'object' || Array.isArray(commune)) throw error(`${label} : commune invalide.`);
        checkText(commune.name, `${label}.commune`, { max: 20000 });
        if (typeof commune.name !== 'string') throw error(`${label} : nom de commune absent.`);
        checkFinite(commune.count, `${label}.commune.count`, { min: 0, integer: true });
      }
    }
  }
}
function settingType(id, type) { return id === type || id.startsWith(`${type}~`); }
function checkRecord(name, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw error(`Fiche ${name} invalide.`);
  checkId(record.id);
  checkJSON(name === 'assets' ? recordMetadata(record) : record);
  for (const key of ['createdAt', 'updatedAt']) if (record[key] !== undefined) checkISO(record[key], `${record.id}.${key}`);
  if (INTERVIEW_STORES.includes(name)) {
    try { ({ interviewPeople: validatePerson, interviewMeetings: validateMeeting, interviews: validateInterview })[name](record); }
    catch (cause) { throw error(cause.message); }
  }
  if (name === 'observations' || name === 'drafts') {
    for (const [key, min, max] of [['lat', -90, 90], ['lng', -180, 180]]) {
      if (record[key] != null && (typeof record[key] !== 'number' || !Number.isFinite(record[key]) || record[key] < min || record[key] > max)) throw error(`Coordonnée ${key} invalide pour ${record.id}.`);
    }
    if (record.accuracy != null && (typeof record.accuracy !== 'number' || !Number.isFinite(record.accuracy) || record.accuracy < 0)) throw error(`Précision GPS invalide pour ${record.id}.`);
    if (name === 'observations' && (record.lat == null) !== (record.lng == null)) throw error(`Latitude et longitude doivent être renseignées ensemble pour ${record.id}.`);
    for (const key of ['title', 'notes', 'category', 'permitId', 'gpsMessage']) checkText(record[key], `${record.id}.${key}`, { nullable: key === 'permitId' });
    if (record.questionnaire !== undefined && (!record.questionnaire || Array.isArray(record.questionnaire) || Object.getPrototypeOf(record.questionnaire) !== Object.prototype)) throw error(`Questionnaire invalide pour ${record.id}.`);
    if (record.questionnaire?.tags !== undefined && (!Array.isArray(record.questionnaire.tags) || record.questionnaire.tags.length > 1000 || record.questionnaire.tags.some(tag => typeof tag !== 'string'))) throw error(`Repères de questionnaire invalides pour ${record.id}.`);
    if (record.status !== undefined && !['incomplete', 'complete'].includes(record.status)) throw error(`Statut de point invalide pour ${record.id}.`);
    if (record.permitConfirmed !== undefined && typeof record.permitConfirmed !== 'boolean') throw error(`Confirmation AERP invalide pour ${record.id}.`);
  }
  if (name === 'missions') {
    for (const key of ['name', 'title', 'notes']) checkText(record[key], `${record.id}.${key}`);
    if (record.date !== undefined) checkCalendarDate(record.date, `${record.id}.date`, { empty: true });
  }
  if (name === 'settings') {
    if (settingType(record.id, 'permits')) checkPermits(record.value);
    if (settingType(record.id, 'activeMission') && record.value != null && record.value !== '') checkId(record.value, 'mission active');
    if (settingType(record.id, 'theme') && !['light', 'dark'].includes(record.value)) throw error('Thème invalide.');
    for (const type of ['large', 'wake']) if (settingType(record.id, type) && typeof record.value !== 'boolean') throw error(`Réglage ${type} invalide.`);
    if (settingType(record.id, 'lastExport')) checkISO(record.value, 'Date de sauvegarde');
  }
  for (const key of ['assetIds', 'missionIds', 'observationIds']) if (record[key] != null) {
    if (!Array.isArray(record[key]) || new Set(record[key]).size !== record[key].length) throw error(`Liste ${key} invalide pour ${record.id}.`);
    record[key].forEach(id => checkId(id, key));
  }
  for (const key of ['missionId', 'observationId', 'assetId']) if (record[key] != null && record[key] !== '') checkId(record[key], key);
  if (name === 'assets') {
    if (!(record.blob instanceof Blob)) throw error(`Le fichier ${record.id} est absent.`);
    if (record.blob.size > MAX_ASSET_BYTES) throw error(`Le fichier ${record.id} dépasse 25 Mio. Réduisez sa taille.`, 'ASSET_TOO_LARGE');
    if (typeof record.type !== 'string' || record.type.length > 200 || /[\r\n]/.test(record.type)) throw error(`Type de fichier invalide pour ${record.id}.`);
    checkText(record.name, `${record.id}.name`, { max: 20000 });
    if (record.kind !== undefined && !['photo', 'photo-annotation', 'audio', 'document', 'voice-segment'].includes(record.kind)) throw error(`Catégorie de fichier invalide pour ${record.id}.`);
  }
}

export async function openStore() {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) throw error('Le navigateur ne propose pas de stockage local. Ouvrez Tety dans Chrome Android.', 'STORAGE_UNAVAILABLE');
  databasePromise = new Promise((resolve, reject) => {
    let rejected = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of STORE_NAMES) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onerror = () => { rejected = true; reject(storageFailure(request.error)); };
    request.onblocked = () => { rejected = true; reject(error('Une ancienne fenêtre de Tety bloque le stockage. Fermez les autres fenêtres, puis réessayez.', 'STORAGE_BLOCKED')); };
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) { db.close(); return; }
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      db.onclose = () => { databasePromise = undefined; };
      resolve(db);
    };
  }).catch(cause => { databasePromise = undefined; throw storageFailure(cause); });
  return databasePromise;
}
async function transaction(names, mode, execute) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    let tx, result, failure;
    try {
      try { tx = db.transaction(names, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
      catch { tx = db.transaction(names, mode); }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(storageFailure(failure || tx.error || error('Transaction interrompue.', 'STORAGE_ABORTED')));
      tx.onerror = () => { failure ||= tx.error; };
      const fail = cause => { failure = cause; try { tx.abort(); } catch { reject(storageFailure(cause)); } };
      execute(tx, value => { result = value; }, fail);
    } catch (cause) {
      if (tx) { failure = cause; try { tx.abort(); } catch { reject(storageFailure(cause)); } }
      else reject(storageFailure(cause));
    }
  });
}
export async function readAll(name) {
  checkStore(name);
  return transaction([name], 'readonly', (tx, done) => {
    const request = tx.objectStore(name).getAll();
    request.onsuccess = () => done(request.result);
  });
}
export async function get(name, id) {
  checkStore(name); checkId(id);
  return transaction([name], 'readonly', (tx, done) => {
    const request = tx.objectStore(name).get(id);
    request.onsuccess = () => done(request.result);
  });
}
export async function put(name, value) {
  checkStore(name);
  if (name === 'observations') return saveObservation(value);
  if (name === 'interviews') return saveInterview(value);
  const record = name === 'assets' ? await prepareAsset(value) : structuredClone(value);
  checkRecord(name, record);
  return transaction([name], 'readwrite', (tx, done, fail) => {
    const store = tx.objectStore(name);
    const write = () => { try { store.put(record); done(record); } catch (cause) { fail(cause); } };
    if (name !== 'assets') { write(); return; }
    const existing = store.get(record.id);
    existing.onsuccess = () => {
      if (existing.result && canonicalRecord(existing.result) !== canonicalRecord(record)) { fail(error('Cet identifiant de fichier existe déjà avec un contenu différent. Créez un nouveau fichier.', 'ASSET_CONFLICT')); return; }
      write();
    };
  });
}
export async function remove(name, id) {
  checkStore(name); checkId(id);
  const guarded = ['assets', 'missions', 'observations', 'interviewPeople', 'interviewMeetings', 'interviews'].includes(name);
  return transaction(guarded ? STORE_NAMES : [name], 'readwrite', (tx, done, fail) => {
    const erase = () => { tx.objectStore(name).delete(id); done(true); };
    if (!guarded) { erase(); return; }
    let remaining = STORE_NAMES.length, failed = false;
    for (const collection of STORE_NAMES) {
      const request = tx.objectStore(collection).getAll();
      request.onsuccess = () => {
        if (failed) return;
        const used = request.result.some(record => !(collection === name && record.id === id) && hasReference(record, name, id));
        if (used) { failed = true; fail(error('Cet élément est encore utilisé par une fiche, un entretien ou un brouillon.', 'REFERENCE_IN_USE')); return; }
        if (--remaining === 0) erase();
      };
    }
  });
}
function hasReference(value, store, id) {
  if (!value || typeof value !== 'object' || value instanceof Blob) return false;
  if (Array.isArray(value)) return value.some(item => hasReference(item, store, id));
  if (store === 'missions' && typeof value.id === 'string' && settingType(value.id, 'activeMission') && value.value === id) return true;
  const singular = { missions: ['missionId'], assets: ['assetId', 'originalId', 'annotatedAssetId'], observations: ['observationId'], interviewPeople: ['personId', 'sourcePersonId'], interviewMeetings: ['meetingId'], interviews: ['interviewId'] }[store] || [];
  const plural = { missions: 'missionIds', assets: 'assetIds', observations: 'observationIds', interviewPeople: 'personIds', interviewMeetings: 'meetingIds', interviews: 'interviewIds' }[store];
  return Object.entries(value).some(([key, item]) => singular.includes(key) ? item === id : key === plural ? Array.isArray(item) && item.includes(id) : ['photoNotes', 'captions'].includes(key) && store === 'assets' && Object.hasOwn(item || {}, id) ? true : hasReference(item, store, id));
}
async function sha256(blob) {
  if (!globalThis.crypto?.subtle) throw error('Le contrôle des sauvegardes nécessite une connexion HTTPS ou localhost.', 'CRYPTO_UNAVAILABLE');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function prepareAsset(value) {
  const blob = value?.blob;
  const record = { ...recordMetadata(value || {}), blob, type: value?.type || blob?.type || 'application/octet-stream' };
  checkRecord('assets', record);
  record.bytes = blob.size;
  record.sha256 = await sha256(blob);
  return record;
}
export async function saveObservation(value, attachments = []) {
  if (!Array.isArray(attachments)) throw error('Liste de fichiers invalide.');
  const prepared = [];
  for (const attachment of attachments) prepared.push(await prepareAsset(attachment));
  if (new Set(prepared.map(asset => asset.id)).size !== prepared.length) throw error('Deux fichiers utilisent le même identifiant.');
  const record = structuredClone(value);
  record.assetIds = [...new Set([...(record.assetIds || []), ...prepared.map(asset => asset.id)])];
  checkRecord('observations', record);
  return transaction(['observations', 'assets', 'missions'], 'readwrite', (tx, done, fail) => {
    const assets = tx.objectStore('assets');
    const candidates = new Map(prepared.map(asset => [asset.id, asset]));
    const checks = record.assetIds.map(id => ['assets', id]);
    if (record.missionId) checks.push(['missions', record.missionId]);
    let remaining = checks.length, failed = false;
    const write = () => {
      if (failed) return;
      try {
        for (const asset of prepared) assets.put(asset);
        tx.objectStore('observations').put(record);
        done(record);
      } catch (cause) { failed = true; fail(cause); }
    };
    if (!remaining) { write(); return; }
    for (const [name, id] of checks) {
      const request = tx.objectStore(name).get(id);
      request.onsuccess = () => {
        if (failed) return;
        const candidate = name === 'assets' ? candidates.get(id) : null;
        if (!request.result && !candidate) { failed = true; fail(error(`Le ${name === 'assets' ? 'fichier' : 'mission'} ${id} est absent.`, 'MISSING_REFERENCE')); return; }
        if (request.result && candidate && canonicalRecord(request.result) !== canonicalRecord(candidate)) { failed = true; fail(error(`Le fichier ${id} existe avec un autre contenu.`, 'ASSET_CONFLICT')); return; }
        if (--remaining === 0) write();
      };
    }
  });
}
/** Commit an interview and new attachments atomically, checking every referenced record. */
export function saveInterview(value, attachments = []) {
  const record = structuredClone(value), files = structuredClone(attachments);
  checkRecord('interviews', record);
  const previous = interviewWriteQueues.get(record.id) || Promise.resolve();
  const pending = previous.catch(() => {}).then(() => commitInterview(record, files));
  interviewWriteQueues.set(record.id, pending);
  const cleanup = () => { if (interviewWriteQueues.get(record.id) === pending) interviewWriteQueues.delete(record.id); };
  pending.then(cleanup, cleanup);
  return pending;
}
async function commitInterview(value, attachments = []) {
  if (!Array.isArray(attachments)) throw error('Liste de fichiers invalide.');
  const record = structuredClone(value);
  if (unresolvedInterviewConflicts.has(record.id)) {
    markInterviewConflict(record);
    throw error('Deux variantes de cet entretien ont été conservées. Fermez puis rouvrez les entretiens pour choisir la fiche à poursuivre.', 'REVISION_CONFLICT');
  }
  const prepared = [];
  for (const attachment of attachments) prepared.push(await prepareAsset(attachment));
  if (new Set(prepared.map(asset => asset.id)).size !== prepared.length) throw error('Deux fichiers utilisent le même identifiant.');
  record.assetIds = [...new Set([...(record.assetIds || []), ...prepared.map(asset => asset.id)])];
  checkRecord('interviews', record);
  const checks = new Map();
  const collect = value => {
    if (!value || typeof value !== 'object' || value instanceof Blob) return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    for (const [key, item] of Object.entries(value)) {
      const collection = REFERENCE_STORES[key];
      if (collection && item != null && item !== '') {
        const ids = key.endsWith('Ids') ? item : [item];
        if (!Array.isArray(ids)) throw error(`Liste ${key} invalide.`);
        for (const id of ids) { checkId(id, key); checks.set(`${collection}:${id}`, [collection, id]); }
      } else {
        if (['photoNotes', 'captions'].includes(key) && item && typeof item === 'object') for (const id of Object.keys(item)) checks.set(`assets:${id}`, ['assets', id]);
        collect(item);
      }
    }
  };
  collect(record);
  checks.set(`interviews:${record.id}`, ['interviews', record.id]);
  const candidates = new Map(prepared.map(asset => [asset.id, asset]));
  return transaction(STORE_NAMES, 'readwrite', (tx, done, fail) => {
    let remaining = checks.size, failed = false;
    const abort = cause => { if (!failed) { failed = true; fail(cause); } };
    const write = () => {
      if (failed) return;
      try {
        for (const asset of prepared) tx.objectStore('assets').put(asset);
        tx.objectStore('interviews').put(record);
        done(record);
      } catch (cause) { abort(cause); }
    };
    for (const [collection, id] of checks.values()) {
      const request = tx.objectStore(collection).get(id);
      request.onsuccess = () => {
        if (failed) return;
        const prior = request.result, candidate = collection === 'assets' ? candidates.get(id) : null;
        if (collection === 'interviews' && id === record.id) {
          if (prior && prior.revision === record.revision && canonicalRecord(prior) !== canonicalRecord(record)) { markInterviewConflict(record); abort(error('Deux variantes de cet entretien ont été conservées. Fermez puis rouvrez les entretiens pour choisir la fiche à poursuivre.', 'REVISION_CONFLICT')); return; }
          if (prior && isNewerInterview(prior, record)) { markInterviewConflict(record); abort(error('Une version plus récente de cet entretien est déjà enregistrée. Votre variante de secours est conservée ; fermez puis rouvrez les entretiens.', 'STALE_WRITE')); return; }
        } else if (!prior && !candidate) { abort(error(`La référence ${collection}=${id} est absente.`, 'MISSING_REFERENCE')); return; }
        if (prior && candidate && canonicalRecord(prior) !== canonicalRecord(candidate)) { abort(error(`Le fichier ${id} existe avec un autre contenu.`, 'ASSET_CONFLICT')); return; }
        if (--remaining === 0) write();
      };
    }
  });
}
const INTERVIEW_EMERGENCY_PREFIX = 'tety:emergency-draft:interview:';
const interviewEmergencyId = id => `interview:${id}`;
function isNewerInterview(left, right) {
  return left.revision > right.revision || left.revision === right.revision && Date.parse(left.updatedAt) > Date.parse(right.updatedAt);
}
function interviewPayload(record) {
  const result = { ...record };
  delete result.recoveryConflict;
  return canonicalRecord(result);
}
function recoveryFingerprint(record) {
  let hash = 0xcbf29ce484222325n;
  for (const char of interviewPayload(record)) { hash ^= BigInt(char.codePointAt(0)); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, '0');
}
function markInterviewConflict(record) {
  unresolvedInterviewConflicts.add(record.id);
  const pending = readEmergencyDraft(interviewEmergencyId(record.id))?.data;
  const latest = pending && pending.revision >= record.revision ? pending : record;
  saveEmergencyDraft(interviewEmergencyId(record.id), { ...latest, recoveryConflict: true });
}
function cleanInterviewRecovery(saved) {
  const own = readEmergencyDraft(interviewEmergencyId(saved.id))?.data;
  if (own && (saved.revision > own.revision || interviewPayload(saved) === interviewPayload(own))) removeEmergencyDraft(interviewEmergencyId(saved.id));
  if (saved.recoveryOf && saved.recoveryFingerprint) {
    const source = readEmergencyDraft(interviewEmergencyId(saved.recoveryOf))?.data;
    if (source && recoveryFingerprint(source) === saved.recoveryFingerprint) removeEmergencyDraft(interviewEmergencyId(saved.recoveryOf));
    unresolvedInterviewConflicts.delete(saved.recoveryOf);
  }
}
export function readEmergencyInterviews() {
  const records = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(INTERVIEW_EMERGENCY_PREFIX)) continue;
      const draft = readEmergencyDraft(key.slice('tety:emergency-draft:'.length));
      try { checkRecord('interviews', draft?.data); records.push(draft.data); } catch { /* A damaged recovery entry must never replace a valid record. */ }
    }
  } catch { /* IndexedDB remains authoritative when localStorage is unavailable. */ }
  return records;
}
export function reconcileInterviewDrafts(records, pending = readEmergencyInterviews()) {
  const result = new Map(records.map(record => [record.id, record]));
  for (const record of pending) {
    checkRecord('interviews', record);
    const prior = result.get(record.id);
    if (!prior) { result.set(record.id, structuredClone(record)); continue; }
    const different = interviewPayload(prior) !== interviewPayload(record);
    if (different && (record.recoveryConflict || record.revision === prior.revision)) {
      const fingerprint = recoveryFingerprint(record), prefix = `${record.id.slice(0, 180)}~recovery-${fingerprint}`;
      let copyId = prefix, attempt = 0;
      while (result.has(copyId) && !(result.get(copyId).recoveryOf === record.id && result.get(copyId).recoveryFingerprint === fingerprint)) copyId = `${prefix}-${++attempt}`;
      if (!result.has(copyId)) {
        const recovered = structuredClone(record);
        delete recovered.recoveryConflict;
        recovered.id = copyId; recovered.recoveryOf = record.id; recovered.recoveryFingerprint = fingerprint;
        result.set(copyId, recovered);
      }
    } else if (record.revision > prior.revision) result.set(record.id, structuredClone(record));
  }
  return [...result.values()];
}
/** localStorage is written before this function returns its pending IndexedDB Promise. */
export function saveInterviewDraft(value) {
  const record = structuredClone(value);
  checkRecord('interviews', record);
  if (unresolvedInterviewConflicts.has(record.id)) record.recoveryConflict = true;
  const recoveryId = interviewEmergencyId(record.id);
  const previous = readEmergencyDraft(recoveryId)?.data;
  if (!previous || !isNewerInterview(previous, record)) saveEmergencyDraft(recoveryId, record);
  return saveInterview(record).then(saved => {
    cleanInterviewRecovery(saved);
    return saved;
  });
}
export async function readInterviews() {
  const pending = readEmergencyInterviews();
  let records;
  try { records = await readAll('interviews'); }
  catch (cause) { if (!pending.length) throw cause; records = []; }
  const recovered = reconcileInterviewDrafts(records, pending);
  const existingIds = new Set(records.map(record => record.id));
  for (const record of recovered) if (record.recoveryOf && !existingIds.has(record.id)) {
    try { cleanInterviewRecovery(await saveInterview(record)); }
    catch { /* Both variants remain visible and their recovery entry remains available. */ }
  }
  return recovered;
}
async function snapshot() {
  return transaction(STORE_NAMES, 'readonly', (tx, done) => {
    const records = {};
    let remaining = STORE_NAMES.length;
    for (const name of STORE_NAMES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { records[name] = request.result; if (--remaining === 0) done(records); };
    }
  });
}
function bytesToBase64(bytes) {
  let result = '';
  const chunkSize = 3 * 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) result += btoa(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  return result;
}
function decodeBase64(encoded, expectedBytes) {
  if (typeof encoded !== 'string' || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw error('Contenu de fichier encodé invalide.');
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > MAX_ASSET_BYTES) throw error('Taille de fichier invalide.');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (encoded.length / 4 * 3 - padding !== expectedBytes) throw error('La taille annoncée du fichier ne correspond pas à son contenu.');
  const raw = atob(encoded);
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  if (bytesToBase64(bytes) !== encoded) throw error('Encodage de fichier non canonique.');
  return bytes;
}
const REFERENCE_STORES = Object.freeze({ assetId: 'assets', assetIds: 'assets', originalId: 'assets', annotatedAssetId: 'assets', missionId: 'missions', missionIds: 'missions', observationId: 'observations', observationIds: 'observations', personId: 'interviewPeople', sourcePersonId: 'interviewPeople', personIds: 'interviewPeople', meetingId: 'interviewMeetings', meetingIds: 'interviewMeetings', interviewId: 'interviews', interviewIds: 'interviews' });
function checkReferences(records) {
  const ids = Object.fromEntries(STORE_NAMES.map(name => [name, new Set((records[name] || []).map(record => record.id))]));
  const refs = REFERENCE_STORES;
  const walk = (value, owner) => {
    if (!value || typeof value !== 'object' || value instanceof Blob) return;
    if (Array.isArray(value)) { value.forEach(item => walk(item, owner)); return; }
    if (typeof value.id === 'string' && settingType(value.id, 'activeMission') && value.value != null && value.value !== '' && !ids.missions.has(value.value)) throw error(`La mission active ${value.value} référencée par ${owner} est absente.`, 'MISSING_REFERENCE');
    for (const [key, item] of Object.entries(value)) {
      if (refs[key] && item != null && item !== '') {
        const list = key.endsWith('Ids') ? item : [item];
        if (!Array.isArray(list)) throw error(`Liste ${key} invalide pour ${owner}.`);
        for (const id of list) {
          checkId(id, key);
          if (!ids[refs[key]].has(id)) throw error(`La référence ${key}=${id} utilisée par ${owner} est absente.`, 'MISSING_REFERENCE');
        }
      } else {
        if (['photoNotes', 'captions'].includes(key) && item && typeof item === 'object') for(const id of Object.keys(item)) {checkId(id,key);if(!ids.assets.has(id))throw error(`Le fichier ${id} utilisé par ${owner} est absent.`, 'MISSING_REFERENCE');}
        walk(item, owner);
      }
    }
  };
  for (const name of STORE_NAMES) for (const record of records[name] || []) walk(record, record.id);
}
/** Validates every record, byte count, checksum and reference before any write. */
export async function validateArchive(archive) {
  if (!archive || archive.format !== 'tety-portable-archive' || archive.schemaVersion !== ARCHIVE_SCHEMA_VERSION) throw error('Version ou format de sauvegarde non pris en charge.', 'UNSUPPORTED_ARCHIVE');
  checkJSON(archive);
  const records = {};
  let totalAssets = 0;
  if (!archive.stores || typeof archive.stores !== 'object' || Object.keys(archive.stores).some(name => !STORE_NAMES.includes(name))) throw error('Collections de sauvegarde invalides.');
  for (const name of STORE_NAMES) {
    // Archives made before Entretiens remain fully restorable. Original stores stay mandatory.
    const collection = archive.stores[name] === undefined && INTERVIEW_STORES.includes(name) ? [] : archive.stores[name];
    if (!Array.isArray(collection) || collection.length > 100000) throw error(`Collection ${name} absente ou trop volumineuse.`);
    const ids = new Set();
    records[name] = [];
    for (const incoming of collection) {
      checkId(incoming?.id);
      if (ids.has(incoming.id)) throw error(`Identifiant ${incoming.id} répété dans ${name}.`);
      ids.add(incoming.id);
      let record;
      if (name === 'assets') {
        const { dataBase64, ...metadata } = incoming;
        if (typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw error(`Empreinte du fichier ${incoming.id} invalide.`);
        const bytes = decodeBase64(dataBase64, metadata.bytes);
        totalAssets += bytes.length;
        if (totalAssets > MAX_ARCHIVE_BYTES) throw error('Les fichiers de cette sauvegarde dépassent 100 Mio.', 'ARCHIVE_TOO_LARGE');
        record = { ...metadata, blob: new Blob([bytes], { type: metadata.type }) };
        checkRecord(name, record);
        if (await sha256(record.blob) !== record.sha256) throw error(`Le fichier ${record.id} est endommagé : empreinte différente.`, 'CHECKSUM_MISMATCH');
      } else { record = structuredClone(incoming); checkRecord(name, record); }
      records[name].push(record);
    }
  }
  checkReferences(records);
  return records;
}
export async function createArchive(records) {
  const stores = {};
  for (const name of STORE_NAMES) {
    stores[name] = [];
    for (const value of records[name] || []) {
      checkRecord(name, value);
      if (name === 'assets') {
        const asset = await prepareAsset(value);
        stores[name].push({ ...recordMetadata(asset), dataBase64: bytesToBase64(new Uint8Array(await asset.blob.arrayBuffer())) });
      } else stores[name].push(structuredClone(value));
    }
  }
  checkReferences(records);
  const archive = { format: 'tety-portable-archive', schemaVersion: ARCHIVE_SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores };
  const blob = new Blob([JSON.stringify(archive)], { type: 'application/json' });
  if (blob.size > MAX_ARCHIVE_BYTES) throw error('La sauvegarde dépasse 100 Mio, limite de ce format sur téléphone. Le stockage local est conservé.', 'ARCHIVE_TOO_LARGE');
  return blob;
}
export async function exportArchive() {
  const records = await snapshot();
  // An export includes keystrokes already captured synchronously while an IDB commit is pending.
  records.interviews = reconcileInterviewDrafts(records.interviews);
  return createArchive(records);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function canonicalRecord(record) { return canonical(recordMetadata(record)); }
function remapReferences(value, maps, storeName) {
  if (value instanceof Blob || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => remapReferences(item, maps));
  const result = {};
  const references = Object.fromEntries(Object.entries(REFERENCE_STORES).filter(([key]) => !key.endsWith('Ids')));
  const lists = Object.fromEntries(Object.entries(REFERENCE_STORES).filter(([key]) => key.endsWith('Ids')));
  for (const [key, item] of Object.entries(value)) {
    if (references[key] && typeof item === 'string') result[key] = maps[references[key]].get(item) || item;
    else if (lists[key] && Array.isArray(item)) result[key] = item.map(id => maps[lists[key]].get(id) || id);
    else if (key === 'personSnapshot' && item && typeof item === 'object') result[key] = { ...remapReferences(item, maps), id: maps.interviewPeople.get(item.id) || item.id };
    else if (['photoNotes', 'captions'].includes(key) && item && typeof item === 'object' && !Array.isArray(item)) result[key] = Object.fromEntries(Object.entries(item).map(([id,note]) => [maps.assets.get(id) || id, remapReferences(note,maps)]));
    else result[key] = remapReferences(item, maps);
  }
  if (storeName === 'settings' && settingType(value.id, 'activeMission') && typeof value.value === 'string') result.value = maps.missions.get(value.value) || value.value;
  return result;
}
function referenceShape(value, top = false) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => referenceShape(item));
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (top && key === 'id') result.id = '<record>';
    else if (REFERENCE_STORES[key] && item != null && item !== '') result[key] = Array.isArray(item) ? item.map(() => `<${REFERENCE_STORES[key]}>`) : `<${REFERENCE_STORES[key]}>`;
    else if (key === 'personSnapshot' && item && typeof item === 'object') result[key] = { ...referenceShape(item), id: '<person>' };
    else if (['photoNotes', 'captions'].includes(key) && item && typeof item === 'object' && !Array.isArray(item)) result[key] = Object.values(item).map(item => referenceShape(item)).sort((a, b) => canonical(a).localeCompare(canonical(b)));
    else if (key === 'value' && typeof value.id === 'string' && settingType(value.id, 'activeMission') && typeof item === 'string') result[key] = '<mission>';
    else result[key] = referenceShape(item);
  }
  return result;
}
/** Recognize copies from a previous restore, including mutually referencing records. */
function reuseImportedCopies(old, incoming, maps) {
  const indexes = Object.fromEntries(STORE_NAMES.map(name => [name, new Map()]));
  for (const name of STORE_NAMES) for (const record of old[name].values()) {
    const signature = canonical(referenceShape(recordMetadata(record), true));
    if (!indexes[name].has(signature)) indexes[name].set(signature, []);
    indexes[name].get(signature).push(record);
  }
  const proposals = [], reserved = Object.fromEntries(STORE_NAMES.map(name => [name, new Set()]));
  for (const name of STORE_NAMES) for (const record of incoming[name] || []) {
    if (!maps[name].has(record.id)) continue;
    const signature = canonical(referenceShape(recordMetadata(record), true));
    const prefix = `${record.id.slice(0, 180)}~import-`;
    const candidates = (indexes[name].get(signature) || []).filter(candidate => candidate.id.startsWith(prefix) && !reserved[name].has(candidate.id)).sort((a, b) => a.id.localeCompare(b.id));
    if (!candidates.length) continue;
    const original = maps[name].get(record.id), candidate = candidates[0];
    maps[name].set(record.id, candidate.id); reserved[name].add(candidate.id);
    proposals.push({ name, record, original, candidate });
  }
  // Propose all identities before checking their references, so cycles can match too.
  let changed;
  do {
    changed = false;
    for (const proposal of proposals) {
      const { name, record, original, candidate } = proposal;
      if (maps[name].get(record.id) === original) continue;
      const updated = remapReferences(record, maps, name); updated.id = candidate.id;
      if (canonicalRecord(updated) !== canonicalRecord(candidate)) { maps[name].set(record.id, original); changed = true; }
    }
  } while (changed);
}
/** Pure conflict planner. Existing records are always retained. */
export function mergeArchiveRecords(existing, incoming, idFactory = id => `${id.slice(0, 180)}~import-${crypto.randomUUID()}`) {
  const maps = Object.fromEntries(STORE_NAMES.map(name => [name, new Map()]));
  const old = Object.fromEntries(STORE_NAMES.map(name => [name, new Map((existing[name] || []).map(record => [record.id, record]))]));
  const used = Object.fromEntries(STORE_NAMES.map(name => [name, new Set([...(existing[name] || []), ...(incoming[name] || [])].map(record => record.id))]));
  const conflictItems = [];
  let changed;
  do {
    changed = false;
    for (const name of STORE_NAMES) for (const record of incoming[name] || []) {
      if (maps[name].has(record.id)) continue;
      const prior = old[name].get(record.id);
      if (!prior) continue;
      const updated = remapReferences(record, maps, name);
      if (canonicalRecord(prior) === canonicalRecord(updated)) continue;
      let newId, attempts = 0;
      do { newId = idFactory(record.id, name, ++attempts); checkId(newId); if (attempts > 100) throw error('Impossible de créer un identifiant de copie.'); } while (used[name].has(newId));
      used[name].add(newId);
      maps[name].set(record.id, newId);
      conflictItems.push({ store: name, from: record.id, to: newId });
      changed = true;
    }
  } while (changed);
  reuseImportedCopies(old, incoming, maps);
  const merged = {}, additions = {};
  let added = 0, identical = 0;
  for (const name of STORE_NAMES) {
    merged[name] = [...(existing[name] || [])];
    additions[name] = [];
    for (const record of incoming[name] || []) {
      const updated = remapReferences(record, maps, name);
      updated.id = maps[name].get(record.id) || record.id;
      if (old[name].has(updated.id)) { identical++; continue; }
      additions[name].push(updated);
      merged[name].push(updated);
      added++;
    }
  }
  checkReferences(merged);
  const newConflicts = conflictItems.filter(item => !old[item.store].has(maps[item.store].get(item.from))).map(item => ({ ...item, to: maps[item.store].get(item.from) }));
  return { merged, additions, added, identical, conflicts: newConflicts.length, conflictItems: newConflicts, idMap: Object.fromEntries(STORE_NAMES.map(name => [name, Object.fromEntries(maps[name])])) };
}
export async function importArchive(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) throw error('Sélectionnez une sauvegarde Tety JSON.');
  if (blob.size > MAX_ARCHIVE_BYTES) throw error('La sauvegarde dépasse la limite de 100 Mio.', 'ARCHIVE_TOO_LARGE');
  if (blob.type && !['application/json', 'text/json', 'text/plain', 'application/octet-stream'].includes(blob.type.toLowerCase())) throw error('Le fichier choisi n’est pas une archive JSON Tety.', 'INVALID_ARCHIVE_TYPE');
  let parsed;
  try { parsed = JSON.parse(await blob.text()); } catch { throw error('La sauvegarde JSON est illisible ou incomplète.', 'INVALID_ARCHIVE_JSON'); }
  const incoming = await validateArchive(parsed);
  // Snapshot and merge happen inside the same write transaction: another tab cannot
  // modify data between conflict detection and the commit.
  const recovered = [];
  const report = await transaction(STORE_NAMES, 'readwrite', (tx, done, fail) => {
    const existing = {};
    let remaining = STORE_NAMES.length;
    for (const name of STORE_NAMES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => {
        existing[name] = request.result;
        if (--remaining !== 0) return;
        try {
          const committed = new Map(existing.interviews.map(record => [record.id, record]));
          existing.interviews = reconcileInterviewDrafts(existing.interviews);
          const plan = mergeArchiveRecords(existing, incoming);
          // A recovered edit participates in collision detection and is committed with the restore.
          // Otherwise an archive equal to a pending edit could be duplicated, or an older archive
          // could be treated as identical even though the collector has already changed the answer.
          for (const record of existing.interviews) {
            const prior = committed.get(record.id);
            if (!prior || isNewerInterview(record, prior)) { tx.objectStore('interviews').put(record); recovered.push(record); }
          }
          for (const collection of STORE_NAMES) for (const record of plan.additions[collection]) tx.objectStore(collection).add(record);
          const { merged, additions, ...report } = plan;
          done(report);
        } catch (cause) { fail(cause); }
      };
    }
  });
  for (const record of recovered) cleanInterviewRecovery(record);
  return report;
}
export async function estimateStorage() {
  if (!globalThis.navigator?.storage?.estimate) return { supported: false, usage: null, quota: null };
  const estimate = await navigator.storage.estimate();
  return { supported: true, usage: estimate.usage ?? null, quota: estimate.quota ?? null };
}
export async function requestPersistence() {
  if (!globalThis.navigator?.storage?.persist) return { supported: false, persisted: false };
  const persisted = await navigator.storage.persist();
  return { supported: true, persisted };
}
const emergencyKey = id => `tety:emergency-draft:${id}`;
export function saveEmergencyDraft(id, data) {
  checkId(id); checkJSON(data);
  try {
    const encoded = JSON.stringify({ savedAt: new Date().toISOString(), data });
    if (encoded.length > 512 * 1024) return { saved: false, reason: 'TOO_LARGE' };
    localStorage.setItem(emergencyKey(id), encoded);
    return { saved: true };
  } catch { return { saved: false, reason: 'STORAGE_UNAVAILABLE' }; }
}
export function readEmergencyDraft(id) {
  checkId(id);
  try { const value = JSON.parse(localStorage.getItem(emergencyKey(id)) || 'null'); if (value) checkJSON(value); return value; }
  catch { return null; }
}
export function removeEmergencyDraft(id) {
  checkId(id);
  try { localStorage.removeItem(emergencyKey(id)); return true; } catch { return false; }
}
