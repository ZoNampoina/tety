import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordReport} from '../dist/word-report.mjs';

const tinyPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHmkAAAAASUVORK5CYII=','base64');
const observation={id:'p1',missionId:'m',title:'Affleurement & interprétation',category:'Affleurement',notes:'Première ligne\nDeuxième ligne <à confirmer>',createdAt:'2026-10-14T12:00:00.000Z',lat:-20.4,lng:48.25,accuracy:12,permitId:'42278',questionnaire:{observed:'Roche visible',interpretation:'Granite probable',toVerify:'Analyse à réaliser',source:'Équipe de terrain'},assetIds:['photo','annotation','audio']};
function unzipStored(bytes) {
  const entries=new Map();let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0);
    const size=bytes.readUInt32LE(offset+18),nameSize=bytes.readUInt16LE(offset+26),extraSize=bytes.readUInt16LE(offset+28),start=offset+30+nameSize+extraSize;
    entries.set(bytes.subarray(offset+30,offset+30+nameSize).toString('utf8'),bytes.subarray(start,start+size));offset=start+size;
  }
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length-12),entries.size);
  return entries;
}

test('Word export is a real OOXML ZIP with editable text, styles, relationships and unknown values',async () => {
  const blob=await createWordReport({mission:{id:'m',name:'Mission Nosy Varika'},observations:[observation],permits:[{id:'42278',count:96,region:'VATOVAVY',district:'NOSY VARIKA',grant:null,expiry:'2026-10-19'}]});
  assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const entries=unzipStored(Buffer.from(await blob.arrayBuffer())),document=entries.get('word/document.xml').toString('utf8');
  assert.ok(entries.has('[Content_Types].xml'));assert.ok(entries.has('_rels/.rels'));assert.ok(entries.has('word/styles.xml'));
  assert.match(document,/w:pStyle w:val="Title"/);assert.match(document,/Affleurement &amp; interprétation/);
  assert.match(document,/Deuxième ligne &lt;à confirmer&gt;/);assert.match(document,/<w:br\/>/);assert.match(document,/Non renseigné/);
  assert.match(document,/19 octobre 2026/);assert.doesNotMatch(document,/Invalid Date/);
  assert.match(document,/Observé ou mesuré/);assert.match(document,/Granite probable/);
});

test('Word exports linked annotation and unchanged original with the caption and lists voice attachments',async () => {
  const original=new Blob([tinyPNG],{type:'image/png'}),annotation=new Blob([tinyPNG],{type:'image/png'});
  const assets=[{id:'photo',blob:original,type:'image/png',name:'roche.png'},{id:'annotation',blob:annotation,type:'image/png',name:'roche-annotee.png',kind:'photo-annotation',originalId:'photo'},{id:'audio',blob:new Blob(['voice']),type:'audio/webm',name:'Note vocale.webm'}];
  const item={...observation,questionnaire:{...observation.questionnaire,photoNotes:{photo:{caption:'Fracture visible',annotatedAssetId:'annotation'}}}};
  const entries=unzipStored(Buffer.from(await (await createWordReport({observations:[item],assets})).arrayBuffer()));
  const document=entries.get('word/document.xml').toString('utf8'),rels=entries.get('word/_rels/document.xml.rels').toString('utf8');
  assert.deepEqual(entries.get('word/media/image1.png'),tinyPNG);assert.deepEqual(entries.get('word/media/image2.png'),tinyPNG);
  assert.match(document,/Fracture visible — version annotée/);assert.match(document,/Fracture visible — photo originale/);
  assert.match(document,/Note vocale.webm/);assert.match(rels,/Target="media\/image1.png"/);assert.match(rels,/Target="media\/image2.png"/);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),tinyPNG);
});

test('Word export respects explicit mission/day selection and does not silently include other points',async () => {
  const excluded={...observation,id:'other',missionId:'other',title:'EXCLUDED'},previous={...observation,id:'previous',createdAt:'2026-10-13T12:00:00.000Z',title:'PREVIOUS'};
  const entries=unzipStored(Buffer.from(await (await createWordReport({mission:{id:'m'},day:'2026-10-14',observations:[observation,excluded,previous]})).arrayBuffer()));
  const document=entries.get('word/document.xml').toString('utf8');assert.doesNotMatch(document,/EXCLUDED|PREVIOUS/);assert.match(document,/Bilan de journée/);
});

test('Word reports missing or corrupt photos without pretending that they were embedded',async () => {
  const item={...observation,createdAt:'invalid',assetIds:['missing','bad'],questionnaire:{observed:'A\u0000B'}};
  const entries=unzipStored(Buffer.from(await (await createWordReport({observations:[item],assets:[{id:'bad',type:'image/png',name:'bad.png',blob:new Blob(['not a picture'])}]})).arrayBuffer()));
  const document=entries.get('word/document.xml').toString('utf8');assert.match(document,/Pièce absente du stockage : missing/);assert.match(document,/Photo non incorporée/);
  assert.doesNotMatch(document,/Invalid Date|\u0000/);assert.ok(!entries.has('word/media/image1.png'));
});
