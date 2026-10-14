import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parsePermitCSV, detectPermit, daysRemaining, buildContours, haversine} from '../dist/geo.mjs';

const permits = JSON.parse(fs.readFileSync(new URL('../dist/permits.json', import.meta.url), 'utf8'));
const fixture = (positions) => ['x;y;lat;lng', ...positions.map(([x,y]) => `${x};${y};${-20+y/111200};${48+x/104000}`)].join('\n');
const metadata = {id:'test',gridStep:625,gridUnit:'m'};
const square = parsePermitCSV(fixture([[0,0],[625,0],[0,625],[625,625]]),metadata);

test('four supplied datasets and commune totals agree; corrected 42278 differs from 41914', () => {
  assert.deepEqual(permits.map(permit => [permit.id,permit.count]), [['41914',164],['41998',388],['42230',214],['42278',96]]);
  for (const permit of permits) {
    assert.equal(permit.count,permit.declaredCount);
    assert.equal(permit.count,permit.communes.reduce((sum,commune)=>sum+commune.count,0));
    assert.equal(permit.blockCount,1);
    assert.equal(new Set(permit.cells.map(cell=>`${cell.x},${cell.y}`)).size,permit.count);
    assert.equal(permit.status,null);
    assert.equal(permit.substance,null);
    assert.equal(permit.geometry.kind,'indicative');
    assert.equal(permit.grid.crs,null);
  }
  const corrected = permits.find(permit=>permit.id==='42278');
  assert.equal(corrected.grant,null);
  assert.equal(corrected.areaKm2,37.5);
  assert.equal(corrected.perimeterKm,41.25);
  assert.equal(corrected.expiry,'2026-10-19');
  assert.deepEqual(corrected.contourKinds,['outer','hole']);
  assert.notDeepEqual(corrected.pointBounds,permits[0].pointBounds);
});

test('a supplied cell centre proposes its permit, always subject to confirmation', () => {
  for (const permit of permits) {
    const cell = permit.cells[Math.floor(permit.cells.length/2)];
    const result = detectPermit(cell.lat,cell.lng,12,permits);
    assert.equal(result.requiresConfirmation,true);
    assert.equal(result.uncertain,true);
    assert.equal(result.candidates.length,1);
    assert.equal(result.candidates[0].id,permit.id);
    assert.equal(result.candidates[0].inside,true);
    assert.equal(result.candidates[0].certainty,'indicative');
  }
});

test('a far outside GPS position yields no invented assignment', () => {
  assert.equal(detectPermit(-18.9,47.5,20,permits).candidates.length,0);
  assert.equal(detectPermit(NaN,48,20,permits).candidates.length,0);
});

test('GPS accuracy overlapping a border gives a candidate on either side', () => {
  // Left perimeter of the 2x2 test block is at x=-312.5.
  const inside = detectPermit(-20,-312.5/104000+48+8/104000,20,[square]);
  assert.equal(inside.candidates[0].inside,true);
  assert.equal(inside.candidates[0].boundaryUncertain,true);
  const outside = detectPermit(-20,-312.5/104000+48-8/104000,20,[square]);
  assert.equal(outside.candidates[0].inside,false);
  assert.equal(outside.candidates[0].boundaryUncertain,true);
  assert.equal(detectPermit(-20,-312.5/104000+48-100/104000,20,[square]).candidates.length,0);
});

test('contours preserve holes and disjoint blocks; hole centre is outside', () => {
  const positions=[];
  for(let x=0;x<3;x++) for(let y=0;y<3;y++) if(x!==1||y!==1) positions.push([x*625,y*625]);
  const ring=parsePermitCSV(fixture(positions),metadata);
  assert.equal(ring.blockCount,1);
  assert.deepEqual(ring.contourKinds,['outer','hole']);
  assert.equal(ring.areaKm2,3.125);
  assert.equal(ring.perimeterKm,10);
  const missingCentre=detectPermit(-20+625/111200,48+625/104000,10,[ring]);
  assert.equal(missingCentre.candidates.length,0);
  const islands=parsePermitCSV(fixture([[0,0],[625,0],[0,625],[2500,2500]]),metadata);
  assert.equal(islands.blockCount,2);
  assert.equal(buildContours([{x:0,y:0},{x:625,y:625}],625).length,2);
});

test('calendar expiry arithmetic handles date validity, midnight and daylight saving', () => {
  assert.equal(daysRemaining('2026-10-19','2026-10-13'),6);
  assert.equal(daysRemaining('2026-10-19',new Date(2026,9,18,23,59)),1);
  assert.equal(daysRemaining('2026-10-19',new Date(2026,9,19,0,1)),0);
  assert.equal(daysRemaining('2026-10-19','2026-10-20'),-1);
  assert.equal(daysRemaining('2026-10-26',new Date(2026,9,24,23,59)),2);
  assert.equal(daysRemaining('2026-02-30','2026-02-01'),null);
  assert.equal(daysRemaining(null,'2026-10-13'),null);
});

test('CSV refuses duplicate squares, absent columns, malformed and missing coordinates', () => {
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n0;0;-20;48\n0;0;-21;49'),/dupliqu/);
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n0;0;-20;48\n625;0;-20;48'),/dupliqu/);
  assert.throws(()=>parsePermitCSV('x;y;lat\n0;0;-20'),/Colonnes/);
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n0;0;bad;48'),/invalides/);
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n0;0;;48'),/invalides/);
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n0;0;91;48'),/invalides/);
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n0;0;-20'),/colonnes/);
  assert.throws(()=>parsePermitCSV('x;y;lat;lng\n"0;0;-20;48'),/guillemets/);
  assert.throws(()=>parsePermitCSV('x;x;lat;lng\n0;0;-20;48'),/colonnes dupliqu/);
});

test('unknown administrative metadata remains absent, incomplete geometry is unavailable', () => {
  const imported=parsePermitCSV('\uFEFFx;y;lat;lng\r\n0;0;-20;48\r\n');
  assert.equal(imported.id,null);
  assert.equal(imported.grant,null);
  assert.equal(imported.expiry,null);
  assert.equal(imported.geometry,null);
  assert.equal(imported.areaKm2,null);
  assert.equal(detectPermit(-20,48,10,[imported]).candidates.length,0);
  assert.deepEqual(detectPermit(-20,48,10,[imported]).unavailable,[null]);
  const mismatch=parsePermitCSV(fixture([[0,0],[625,0],[0,625]]),{...metadata,declaredCount:99});
  assert.match(mismatch.diagnostics[0],/3 carrés/);
});

test('two collinear cells import without invented geographic contours', () => {
  const imported = parsePermitCSV(fixture([[0,0],[625,0]]),metadata);
  assert.equal(imported.count,2);
  assert.equal(imported.geometry,null);
  assert.deepEqual(imported.contours,[]);
  assert.deepEqual(imported.contourKinds,[]);
  assert.equal(imported.cells.some(cell => 'polygon' in cell),false);
  assert.equal(imported.xyContours.length,1);
  assert.ok(imported.xyContours.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && !('lat' in point) && !('lng' in point)));
  assert.equal(imported.perimeterKm,3.75);
  assert.equal(detectPermit(-20,48,10,[imported]).candidates.length,0);
});

test('haversine returns metres and matches a known equatorial degree', () => {
  assert.equal(haversine(0,0,0,0),0);
  assert.ok(Math.abs(haversine(0,0,0,1)-111195.08)<1);
});
