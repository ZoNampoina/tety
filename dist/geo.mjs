/**
 * Tety — offline, indicative permit geometry.
 * CSV points and administrative metadata are preserved; square boundaries are
 * derived under an explicit centre/step assumption. The source CRS is unknown.
 * GPS matches MUST be confirmed by the user and are not a legal boundary check.
 */
const EARTH_RADIUS = 6371008.8;
const radians = degrees => degrees * Math.PI / 180;

export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function getBounds(items = []) {
  const points = items.flatMap(item => Array.isArray(item) ? item : item.polygon || [item]);
  const usable = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (!usable.length) return null;
  return {
    minLat: Math.min(...usable.map(point => point.lat)),
    maxLat: Math.max(...usable.map(point => point.lat)),
    minLng: Math.min(...usable.map(point => point.lng)),
    maxLng: Math.max(...usable.map(point => point.lng))
  };
}

/** Calendar days on the device; independent of daylight-saving hour changes. */
export function daysRemaining(expiry, now = new Date()) {
  const match = typeof expiry === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const end = new Date(Date.UTC(year, month - 1, day));
  if (end.getUTCFullYear() !== year || end.getUTCMonth() !== month - 1 || end.getUTCDate() !== day) return null;
  let start;
  if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(now)) {
    const [y, m, d] = now.split('-').map(Number);
    start = new Date(Date.UTC(y, m - 1, d));
    if (start.getUTCFullYear() !== y || start.getUTCMonth() !== m - 1 || start.getUTCDate() !== d) return null;
  } else {
    const date = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(date.getTime())) return null;
    start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function csvRows(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Le CSV est vide.');
  const content = text.replace(/^\uFEFF/, '');
  const first = content.split(/\r?\n/)[0];
  const delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(field.trim()); field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[index + 1] === '\n') index++;
      row.push(field.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Le CSV contient des guillemets non fermés.');
  row.push(field.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function solve3(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-10) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let j = col; j < 4; j++) rows[col][j] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let j = col; j < 4; j++) rows[row][j] -= factor * rows[col][j];
    }
  }
  return rows.map(row => row[3]);
}

function inferStep(cells) {
  const differences = [];
  for (const axis of ['x', 'y']) {
    const values = [...new Set(cells.map(cell => cell[axis]))].sort((a, b) => a - b);
    for (let index = 1; index < values.length; index++) differences.push(values[index] - values[index - 1]);
  }
  if (!differences.length) return null;
  const step = Math.min(...differences.filter(value => value > 0));
  return differences.every(value => Math.abs(value / step - Math.round(value / step)) < 1e-6) ? step : null;
}

function fitGeometry(cells, step) {
  if (cells.length < 3 || !Number.isFinite(step) || step <= 0) return null;
  const originX = cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
  const originY = cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length;
  const matrix = Array.from({length: 3}, () => [0, 0, 0]);
  const latitude = [0, 0, 0], longitude = [0, 0, 0];
  for (const cell of cells) {
    const values = [1, (cell.x - originX) / step, (cell.y - originY) / step];
    for (let i = 0; i < 3; i++) {
      latitude[i] += values[i] * cell.lat;
      longitude[i] += values[i] * cell.lng;
      for (let j = 0; j < 3; j++) matrix[i][j] += values[i] * values[j];
    }
  }
  const lat = solve3(matrix, latitude), lng = solve3(matrix, longitude);
  if (!lat || !lng || Math.abs(lat[1] * lng[2] - lat[2] * lng[1]) < 1e-12) return null;
  const geometry = {
    kind: 'indicative', method: 'local-affine', crs: null, datum: null,
    centerAssumption: true, step, originX, originY,
    latitude: lat, longitude: lng,
    warning: 'Contours indicatifs : projection et position exacte du point dans le carré non précisées par la source.'
  };
  const residuals = cells.map(cell => {
    const derived = xyToLatLng(cell.x, cell.y, geometry);
    return haversine(cell.lat, cell.lng, derived.lat, derived.lng);
  });
  geometry.rmseMeters = Math.sqrt(residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length);
  geometry.maxResidualMeters = Math.max(...residuals);
  return geometry;
}

export function xyToLatLng(x, y, geometry) {
  if (!geometry) return null;
  const u = (x - geometry.originX) / geometry.step;
  const v = (y - geometry.originY) / geometry.step;
  return {
    lat: geometry.latitude[0] + geometry.latitude[1] * u + geometry.latitude[2] * v,
    lng: geometry.longitude[0] + geometry.longitude[1] * u + geometry.longitude[2] * v
  };
}

/** Trace unions of assumed centred grid squares, including separate blocks/holes. */
export function buildContours(cells, step = 625, geometry = null) {
  if (!cells.length || !Number.isFinite(step) || step <= 0) return [];
  const ox = Math.min(...cells.map(cell => cell.x));
  const oy = Math.min(...cells.map(cell => cell.y));
  const edges = new Map();
  const key = point => point.join(',');
  for (const cell of cells) {
    const i = Math.round((cell.x - ox) / step), j = Math.round((cell.y - oy) / step);
    const vertices = [[2*i-1, 2*j-1], [2*i-1, 2*j+1], [2*i+1, 2*j+1], [2*i+1, 2*j-1]];
    for (let k = 0; k < 4; k++) {
      const a = vertices[k], b = vertices[(k + 1) % 4];
      const reverse = `${key(b)}>${key(a)}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(`${key(a)}>${key(b)}`, {a, b});
    }
  }
  const outgoing = new Map();
  for (const [edgeKey, edge] of edges) {
    const startKey = key(edge.a);
    if (!outgoing.has(startKey)) outgoing.set(startKey, []);
    outgoing.get(startKey).push({edgeKey, ...edge});
  }
  const direction = (a, b) => b[0] > a[0] ? 0 : b[1] > a[1] ? 1 : b[0] < a[0] ? 2 : 3;
  const turnRank = delta => ({1: 0, 0: 1, 3: 2, 2: 3})[delta];
  const loops = [];
  while (edges.size) {
    const [firstKey, firstEdge] = edges.entries().next().value;
    let current = {...firstEdge, edgeKey: firstKey};
    const points = [current.a];
    const initial = key(current.a);
    while (current) {
      edges.delete(current.edgeKey);
      points.push(current.b);
      if (key(current.b) === initial) break;
      const incoming = direction(current.a, current.b);
      const options = (outgoing.get(key(current.b)) || []).filter(edge => edges.has(edge.edgeKey));
      options.sort((left, right) => turnRank((incoming - direction(left.a, left.b) + 4) % 4) - turnRank((incoming - direction(right.a, right.b) + 4) % 4));
      current = options[0];
    }
    loops.push(points.map(([i, j]) => {
      const x = ox + i * step / 2, y = oy + j * step / 2;
      return {x, y, ...(xyToLatLng(x, y, geometry) || {})};
    }));
  }
  return loops;
}

export function parsePermitCSV(text, metadata = {}) {
  const rows = csvRows(text);
  const headers = rows.shift().map(value => value.toLowerCase().trim());
  if (new Set(headers).size !== headers.length) throw new Error('Le CSV contient des colonnes dupliquées.');
  const indexes = ['x', 'y', 'lat', 'lng'].map(name => headers.indexOf(name));
  if (indexes.some(index => index < 0)) throw new Error('Colonnes requises : x, y, lat, lng.');
  const seen = new Set(), seenGPS = new Set();
  const cells = rows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Ligne ${index + 2} : nombre de colonnes incohérent.`);
    const numbers = indexes.map(column => row[column] === '' ? NaN : Number(row[column].replace(',', '.')));
    const [x, y, lat, lng] = numbers;
    if (!numbers.every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Ligne ${index + 2} : coordonnées invalides.`);
    const gridKey = `${x},${y}`, gpsKey = `${lat},${lng}`;
    if (seen.has(gridKey) || seenGPS.has(gpsKey)) throw new Error(`Ligne ${index + 2} : carré ou coordonnées GPS dupliqués.`);
    seen.add(gridKey); seenGPS.add(gpsKey);
    return {x, y, lat, lng};
  });
  if (!cells.length) throw new Error('Le CSV ne contient aucun carré.');
  const requestedStep = metadata.gridStep ?? metadata.grid?.step;
  if (requestedStep != null && (!Number.isFinite(Number(requestedStep)) || Number(requestedStep) <= 0)) throw new Error('Le pas de grille doit être un nombre positif.');
  const step = requestedStep == null ? inferStep(cells) : Number(requestedStep);
  const ox = cells[0].x, oy = cells[0].y;
  const spacingVerified = step != null && cells.every(cell => ['x', 'y'].every(axis => Math.abs((cell[axis] - (axis === 'x' ? ox : oy)) / step - Math.round((cell[axis] - (axis === 'x' ? ox : oy)) / step)) < 1e-6));
  const diagnostics = [];
  const declared = metadata.declaredCount ?? metadata.squareCount ?? null;
  const declaredCount = declared == null || declared === '' ? null : Number(declared);
  if (declaredCount !== null && (!Number.isInteger(declaredCount) || declaredCount < 1)) throw new Error('Le nombre déclaré de carrés est invalide.');
  if (declaredCount !== null && declaredCount !== cells.length) diagnostics.push(`Le CSV contient ${cells.length} carrés ; la fiche en annonce ${declaredCount}.`);
  if (!spacingVerified) diagnostics.push('Pas de grille non déterminable ou irrégulier : aucun contour de carré calculé.');
  else if (requestedStep == null) diagnostics.push(`Pas de ${step} unités déduit des coordonnées ; taille réelle des carrés à confirmer.`);
  const geometry = spacingVerified ? fitGeometry(cells, step) : null;
  if (geometry) {
    for (const cell of cells) {
      // Keep the provided centre exactly, and use the fitted local directions
      // only for the assumed half-step footprint around that source point.
      const fitted = xyToLatLng(cell.x, cell.y, geometry);
      cell.polygon = [[-1,-1], [-1,1], [1,1], [1,-1]].map(([i, j]) => {
        const corner = xyToLatLng(cell.x + i*step/2, cell.y + j*step/2, geometry);
        return {lat: corner.lat + cell.lat - fitted.lat, lng: corner.lng + cell.lng - fitted.lng};
      });
    }
    diagnostics.push(geometry.warning);
  } else diagnostics.push('Transformation géographique insuffisante : reconnaissance GPS du périmètre indisponible.');
  // Geographic consumers require finite lat/lng. Keep a grid-only outline
  // separate when the source cannot support a geographic transformation.
  const derivedContours = spacingVerified ? buildContours(cells, step, geometry) : [];
  const contours = geometry ? derivedContours : [];
  const xyContours = geometry ? undefined : derivedContours;
  const contourKinds = contours.map(contour => {
    const signedArea = contour.slice(0, -1).reduce((sum, point, index) => sum + point.x * contour[index + 1].y - contour[index + 1].x * point.y, 0);
    return signedArea < 0 ? 'outer' : 'hole';
  });
  let blockCount = null;
  if (spacingVerified) {
    const remaining = new Set(cells.map(cell => `${cell.x},${cell.y}`));
    blockCount = 0;
    while (remaining.size) {
      blockCount++;
      const queue = [remaining.values().next().value];
      remaining.delete(queue[0]);
      while (queue.length) {
        const [x, y] = queue.pop().split(',').map(Number);
        for (const [nx, ny] of [[x + step, y], [x - step, y], [x, y + step], [x, y - step]]) {
          const key = `${nx},${ny}`;
          if (remaining.delete(key)) queue.push(key);
        }
      }
    }
  }
  let boundaryEdges = 0;
  for (const contour of derivedContours) boundaryEdges += Math.max(0, contour.length - 1);
  return {
    ...metadata,
    id: metadata.id == null ? null : String(metadata.id),
    name: metadata.name || (metadata.id == null ? 'Permis importé' : `AERP ${metadata.id}`),
    holder: metadata.holder ?? null,
    grant: metadata.grant ?? null,
    expiry: metadata.expiry ?? null,
    status: metadata.status ?? null,
    substance: metadata.substance ?? null,
    declaredCount, count: cells.length, cells,
    grid: {step, spacingVerified, centerAssumption: true, unit: metadata.gridUnit ?? null, crs: metadata.crs ?? null, stepSource: requestedStep == null ? 'inferred' : 'provided'},
    geometry, contours, contourKinds, blockCount,
    ...(xyContours ? {xyContours} : {}),
    bounds: getBounds(cells), pointBounds: getBounds(cells.map(({lat,lng}) => ({lat,lng}))),
    areaKm2: spacingVerified && metadata.gridUnit === 'm' ? cells.length * step * step / 1000000 : null,
    perimeterKm: spacingVerified && metadata.gridUnit === 'm' ? boundaryEdges * step / 1000 : null,
    measurementsIndicative: true,
    diagnostics
  };
}

function distanceToPolygon(lat, lng, polygon) {
  const cos = Math.cos(radians(lat));
  const points = polygon.map(point => ({x: radians(point.lng - lng) * EARTH_RADIUS * cos, y: radians(point.lat - lat) * EARTH_RADIUS}));
  let inside = false, distance = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if ((a.y > 0) !== (b.y > 0) && 0 < (b.x - a.x) * (-a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
    distance = Math.min(distance, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return {inside: inside || distance < 0.01, distanceMeters: inside ? 0 : distance, boundaryDistanceMeters: distance};
}

export function detectPermit(lat, lng, accuracy, permits = []) {
  const valid = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180;
  const accuracyKnown = Number.isFinite(accuracy) && accuracy >= 0;
  const candidates = [], unavailable = [];
  if (!valid) return {candidates, uncertain: true, requiresConfirmation: true, message: 'Position GPS invalide.', unavailable};
  for (const permit of permits) {
    if (!permit.geometry || !permit.cells?.some(cell => cell.polygon)) { unavailable.push(permit.id); continue; }
    let best = {inside: false, distanceMeters: Infinity};
    for (const cell of permit.cells) {
      if (!cell.polygon) continue;
      const match = distanceToPolygon(lat, lng, cell.polygon);
      if (match.inside) { best = match; break; }
      if (match.distanceMeters < best.distanceMeters) best = match;
    }
    let boundaryDistanceMeters = Infinity;
    for (const contour of permit.contours || []) {
      if (contour.length > 2 && Number.isFinite(contour[0].lat)) boundaryDistanceMeters = Math.min(boundaryDistanceMeters, distanceToPolygon(lat, lng, contour).boundaryDistanceMeters);
    }
    if (!Number.isFinite(boundaryDistanceMeters)) boundaryDistanceMeters = best.boundaryDistanceMeters ?? best.distanceMeters;
    const modelMargin = Math.max(0, permit.geometry.maxResidualMeters || 0);
    if (best.inside || (accuracyKnown && best.distanceMeters <= accuracy + modelMargin)) candidates.push({
      id: permit.id, name: permit.name, inside: best.inside,
      distanceMeters: Math.round(best.distanceMeters * 10) / 10,
      certainty: 'indicative', boundaryUncertain: !accuracyKnown || boundaryDistanceMeters <= accuracy + modelMargin,
      boundaryDistanceMeters: Math.round(boundaryDistanceMeters * 10) / 10,
      accuracyMeters: accuracyKnown ? accuracy : null,
      geometryUncertaintyMeters: modelMargin
    });
  }
  candidates.sort((a, b) => Number(b.inside) - Number(a.inside) || a.distanceMeters - b.distanceMeters);
  return {
    candidates, uncertain: true, requiresConfirmation: true, unavailable,
    message: candidates.length === 1 ? 'AERP proposé à confirmer. Contour indicatif ; vérifier sur le terrain.' : candidates.length > 1 ? 'Plusieurs AERP possibles : choisir après vérification.' : 'Aucun AERP proposé. Choisir manuellement si nécessaire.'
  };
}
