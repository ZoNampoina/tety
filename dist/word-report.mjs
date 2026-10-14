// A standards based OOXML package, created locally without a network or dependency.
// Package relationships and inline pictures follow Microsoft's Open XML documentation.
import {dailyRecap,localDay,questionnaireEntries} from './fieldwork.mjs';

const WORD_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_PHOTO = 25 * 1024 * 1024, MAX_REPORT = 100 * 1024 * 1024;
const encoder = new TextEncoder();
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const known = value => value == null || String(value).trim() === '' ? 'Non renseigné' : String(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const dateLabel = value => {
  if (!value) return 'Non renseigné';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value+'T12:00:00' : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('fr-FR',{dateStyle:'long'}) : 'Non renseigné';
};
const dateTimeLabel = value => {const date=new Date(value);return value && Number.isFinite(date.getTime()) ? date.toLocaleString('fr-FR') : 'Non renseigné';};
const documentNamespaces = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relationshipRoot = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRelationship = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

function runs(value,{bold = false} = {}) {
  return xml(known(value)).split(/\r\n|\r|\n/).map((line,index) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${line}</w:t></w:r>`).join('');
}

function paragraph(value,{style = 'Normal',keepNext = false,bold = false} = {}) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keepNext ? '<w:keepNext/>' : ''}</w:pPr>${runs(value,{bold})}</w:p>`;
}

function pair(label,value) {
  return `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runs(label+' : ',{bold:true})}${runs(value)}</w:p>`;
}

function table(headers,rows,widths) {
  const border = '<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join('')+'</w:tblBorders>';
  const row = (values,head = false,index = 0) => `<w:tr><w:trPr>${head ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${values.map((value,column) => `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/><w:vAlign w:val="center"/>${head ? '<w:shd w:fill="E7E7E7"/>' : index % 2 ? '<w:shd w:fill="F7F7F7"/>' : ''}</w:tcPr><w:p><w:pPr>${head ? '<w:keepNext/>' : ''}${['AERP','Carrés'].includes(headers[column]) ? '<w:jc w:val="center"/>' : ''}<w:spacing w:before="0" w:after="50" w:line="240" w:lineRule="auto"/></w:pPr>${runs(value,{bold:head})}</w:p></w:tc>`).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${border}<w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${row(headers,true)}${rows.map((values,index) => row(values,false,index)).join('')}</w:tbl>${paragraph(' ',{style:'Spacing'})}`;
}

function picture({relationshipId,name,width,height,index}) {
  const scale = Math.min(1,6.3*914400/(width*9525),4.2*914400/(height*9525));
  const cx = Math.round(width*9525*scale),cy = Math.round(height*9525*scale);
  return `<w:p><w:pPr><w:pStyle w:val="Picture"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${index}" name="${xml(name)}" descr="${xml(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function imageDimensions(bytes) {
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte) && [73,72,68,82].every((byte,index) => bytes[index+12] === byte)) {
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return {extension:'png',type:'image/png',width:view.getUint32(16),height:view.getUint32(20)};
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) {offset++;continue;}
      const marker = bytes[offset+1];
      if (marker === 216 || marker === 217 || marker === 1 || marker >= 208 && marker <= 215) {offset+=2;continue;}
      if (marker === 218) break;
      const length = bytes[offset+2]*256+bytes[offset+3];
      if (length < 2 || offset+2+length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) {
        return {extension:'jpg',type:'image/jpeg',width:bytes[offset+7]*256+bytes[offset+8],height:bytes[offset+5]*256+bytes[offset+6]};
      }
      offset += 2+length;
    }
  }
  return null;
}

async function compatiblePhoto(asset) {
  if (!(asset?.blob instanceof Blob)) throw new Error('Le fichier de cette photo est absent.');
  if (asset.blob.size > MAX_PHOTO) throw new Error('Cette photo dépasse la limite de 25 Mio.');
  const bytes = new Uint8Array(await asset.blob.arrayBuffer());
  const dimensions = imageDimensions(bytes);
  if (dimensions?.width > 0 && dimensions.height > 0 && dimensions.width <= 50000 && dimensions.height <= 50000) return {bytes,...dimensions};
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('Format de photo non compatible avec Word.');
  // Word expects PNG or JPEG. Other browser readable image formats are flattened.
  const url = URL.createObjectURL(asset.blob);
  try {
    const image = new Image();
    await new Promise((resolve,reject) => {image.onload=resolve;image.onerror=() => reject(new Error('Photo illisible.'));image.src=url;});
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth*image.naturalHeight > 80000000) throw new Error('Dimensions de photo trop importantes pour la conversion.');
    const ratio = Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const converted = await new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Conversion de photo impossible.')),'image/png'));
    if (converted.size > MAX_PHOTO) throw new Error('La photo convertie dépasse 25 Mio.');
    return {bytes:new Uint8Array(await converted.arrayBuffer()),extension:'png',type:'image/png',width:canvas.width,height:canvas.height};
  } finally {URL.revokeObjectURL(url);}
}

const crcTable = Uint32Array.from({length:256},(_,value) => {for(let bit=0;bit<8;bit++)value=value&1 ? 0xedb88320^(value>>>1) : value>>>1;return value>>>0;});
function crc32(bytes) {let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

function storedZip(entries) {
  if (entries.length > 65535) throw new Error('Trop de pièces pour cet export Word.');
  const blocks = [],central = [];let offset=0,total=0;
  for (const [path,value] of entries) {
    const name=encoder.encode(path),bytes=typeof value==='string'?encoder.encode(value):value,crc=crc32(bytes);
    const local=new Uint8Array(30),view=new DataView(local.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(8,0,true);view.setUint16(12,0x21,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);
    const record=new Uint8Array(46),centralView=new DataView(record.buffer);
    centralView.setUint32(0,0x02014b50,true);centralView.setUint16(4,20,true);centralView.setUint16(6,20,true);centralView.setUint16(8,0x800,true);centralView.setUint16(14,0x21,true);centralView.setUint32(16,crc,true);centralView.setUint32(20,bytes.length,true);centralView.setUint32(24,bytes.length,true);centralView.setUint16(28,name.length,true);centralView.setUint32(42,offset,true);
    blocks.push(local,name,bytes);central.push(record,name);offset+=30+name.length+bytes.length;total+=46+name.length;
    if (offset+total+22 > MAX_REPORT) throw new Error('Cet export dépasse 100 Mio. Exportez une journée ou une sélection plus petite.');
  }
  const end=new Uint8Array(22),endView=new DataView(end.buffer);
  endView.setUint32(0,0x06054b50,true);endView.setUint16(8,entries.length,true);endView.setUint16(10,entries.length,true);endView.setUint32(12,total,true);endView.setUint32(16,offset,true);
  return new Blob([...blocks,...central,end],{type:WORD_TYPE});
}

const styles = `${xmlHeader}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="000000"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="000000"/></w:rPr></w:style>${[1,2,3].map(level => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${level===1?240:180}" w:after="100"/><w:outlineLvl w:val="${level-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${level===1?28:level===2?24:22}"/><w:color w:val="000000"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="80"/></w:pPr><w:rPr><w:sz w:val="20"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Picture"><w:name w:val="Picture"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="140"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Spacing"><w:name w:val="Spacing"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr><w:rPr><w:sz w:val="2"/></w:rPr></w:style></w:styles>`;

/** Create a real editable .docx. Only passed observations are exported.
 * If day is supplied, additionally restrict to observations created that local day.
 * Media originals are never modified. Non-image attachments are named in the report.
 */
export async function createWordReport({mission = null,permits = [],observations = [],assets = [],day = null} = {}) {
  const selected=observations.filter(observation => (!mission?.id || observation.missionId === mission.id) && (!day || localDay(observation.createdAt) === day)).sort((left,right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')) || String(left.id).localeCompare(String(right.id)));
  const assetMap=new Map(assets.map(asset => [asset.id,asset])),media=[],relationships=[],mediaTypes=new Map(),imageCache=new Map();let mediaBytes=0,imageIndex=0;
  const content=[];
  content.push(paragraph('Carnet de reconnaissance Tety',{style:'Title'}));
  content.push(paragraph(`${selected.length} observation(s) enregistrée(s)${day ? ' le '+dateLabel(day) : ''}. Ce carnet rassemble les relevés, les photographies légendées et les suites à donner pour préparer la descente et son compte rendu. Les champs absents sont indiqués comme non renseignés.`));
  content.push(pair('Mission',mission?.name || 'Toutes les missions'),pair('Date prévue',dateLabel(mission?.date)),pair('Programme',mission?.notes));
  if (day) content.push(pair('Journée',dateLabel(day)));
  content.push(paragraph('Les données de localisation issues des CSV restent indicatives. Les dates affichées ne confirment pas le statut administratif actuel. Les notes distinguent les faits observés, les interprétations et les informations à vérifier.'));

  if (permits.length) {
    content.push(paragraph('Périmètres de la mission',{style:'Heading1'}));
    content.push(table(['AERP','Localisation','Carrés','Octroi','Fin de validité'],permits.map(permit => [permit.id,[permit.region,permit.district || permit.districts?.join(' / '),(permit.communes || []).map(commune => typeof commune === 'string' ? commune : commune.name).join(', ')].filter(Boolean).join('\n') || 'Non renseigné',permit.count,dateLabel(permit.grant),dateLabel(permit.expiry)]),[1050,4050,750,1850,1850]));
    content.push(paragraph('Statut actuel, substances, frais administratifs et dossier en cours : non renseignés lorsque ces informations sont absentes des sources. Les dates de validité doivent être confirmées auprès du BCMM.'));
  }

  const recap = dailyRecap({observations:selected,assets,missions:mission?[mission]:[],missionId:mission?.id || null},day || localDay());
  content.push(paragraph(day ? 'Bilan de journée' : 'Synthèse des relevés',{style:'Heading1'}));
  const incomplete=selected.filter(observation => observation.status === 'incomplete' || observation.questionnaire?.needsReview === true || !observation.title || !observation.category || !(observation.notes || observation.questionnaire?.observed) || !finite(observation.lat) || !finite(observation.lng) || !observation.permitId || !observation.assetIds?.length).length;
  const selectedPhotos=new Set(selected.flatMap(observation => observation.assetIds || []).filter(id => assetMap.get(id)?.type?.startsWith('image/') && assetMap.get(id)?.kind !== 'photo-annotation'));
  content.push(paragraph(`${selected.length} point(s), ${selectedPhotos.size} photo(s) originale(s), ${incomplete} fiche(s) à compléter. La complétude du carnet ne vaut pas validation scientifique.`));
  const sampleRows=selected.filter(observation => observation.category === 'Échantillon' || observation.questionnaire?.sampleCode || observation.questionnaire?.sampleDescription || observation.questionnaire?.sample).map(observation => [observation.questionnaire?.sampleCode,observation.title,observation.questionnaire?.sampleDescription || observation.questionnaire?.sample,observation.questionnaire?.sampleAnalysis]);
  if (sampleRows.length) content.push(paragraph('Échantillons',{style:'Heading2'}),table(['Code','Point','Description','Analyse attendue'],sampleRows,[2200,2100,3050,2200]));
  const followups=selected.filter(observation => observation.questionnaire?.toVerify || observation.questionnaire?.followup);
  if (followups.length) {content.push(paragraph('Actions à reprendre',{style:'Heading2'}));for(const observation of followups)content.push(pair(observation.title || 'Point sans titre',[observation.questionnaire.toVerify,observation.questionnaire.followup].filter(Boolean).join('\n')));}
  if (day && recap.access.length) {content.push(paragraph('Accès et difficultés',{style:'Heading2'}));for(const access of recap.access)content.push(pair(access.title,access.condition));}

  async function embed(asset,caption) {
    try {
      let image=imageCache.get(asset.id);
      if (!image) {
        const compatible=await compatiblePhoto(asset);mediaBytes+=compatible.bytes.length;
        if (mediaBytes > MAX_REPORT-1024*1024) throw new RangeError('Cet export dépasse 100 Mio. Exportez une journée ou une sélection plus petite.');
        const relationshipId='rIdImage'+(++imageIndex),name=`image${imageIndex}.${compatible.extension}`;
        media.push(['word/media/'+name,compatible.bytes]);mediaTypes.set(compatible.extension,compatible.type);relationships.push(`<Relationship Id="${relationshipId}" Type="${officeRelationship}image" Target="media/${name}"/>`);
        image={...compatible,relationshipId,name,index:imageIndex};imageCache.set(asset.id,image);
      }
      content.push(paragraph(caption,{style:'Caption',keepNext:true}),picture({...image,name:asset.name || image.name}));
    } catch (error) {
      if (error instanceof RangeError) throw error;
      content.push(paragraph(`${caption}\nPhoto non incorporée : ${error.message} Fichier : ${known(asset.name)}. Consultez l’archive complète.`));
    }
  }

  content.push(paragraph('Fiches de terrain',{style:'Heading1'}));
  if (!selected.length) content.push(paragraph('Aucune observation dans cette sélection.'));
  for (const [index,observation] of selected.entries()) {
    content.push(paragraph(`${index+1} ${observation.title || 'Point sans titre'}`,{style:'Heading2'}));
    content.push(pair('Catégorie',observation.category),pair('AERP',observation.permitId ? `${observation.permitId} — ${observation.permitConfirmed ? 'confirmé par l’équipe' : 'à confirmer'}` : 'Non renseigné'),pair('Création',dateTimeLabel(observation.createdAt)));
    content.push(pair('Position',finite(observation.lat) && finite(observation.lng) ? `${observation.lat.toFixed(6)}, ${observation.lng.toFixed(6)}` : null),pair('Précision GPS',finite(observation.accuracy) ? '± '+Math.round(observation.accuracy)+' m' : null));
    content.push(pair('Notes',observation.notes));
    const entries=questionnaireEntries(observation.questionnaire);
    const evidenceKeys=['observed','interpretation','toVerify'];
    for (const key of evidenceKeys) content.push(pair(({observed:'Observé ou mesuré',interpretation:'Interprétation',toVerify:'À vérifier'})[key],observation.questionnaire?.[key]));
    for (const entry of entries.filter(entry => !evidenceKeys.includes(entry.key))) content.push(pair(entry.label,entry.value));
    const ids=[...new Set(observation.assetIds || [])],originals=ids.map(id => assetMap.get(id)).filter(asset => asset && asset.kind !== 'photo-annotation');
    const linkedAnnotations=new Set(Object.values(observation.questionnaire?.photoNotes || {}).map(note => note?.annotatedAssetId).filter(Boolean));
    const orphanedAnnotations=ids.map(id => assetMap.get(id)).filter(asset => asset?.kind === 'photo-annotation' && !linkedAnnotations.has(asset.id) && !originals.some(original => original.id === asset.originalId));
    if (!ids.length) content.push(pair('Pièces jointes',null));
    for (const id of ids.filter(id => !assetMap.has(id))) content.push(paragraph('Pièce absente du stockage : '+id));
    for (const asset of [...originals,...orphanedAnnotations]) {
      if (!asset.type?.startsWith('image/')) {content.push(pair('Pièce jointe',`${known(asset.name)}${asset.type?.startsWith('audio/') ? ' — note vocale à consulter dans l’archive' : ' — fichier à consulter dans l’archive'}`));continue;}
      const note=observation.questionnaire?.photoNotes?.[asset.id] || {};
      const caption=note.caption || asset.caption || 'Légende non renseignée';
      const annotated=note.annotatedAssetId ? assetMap.get(note.annotatedAssetId) : null;
      if (annotated) await embed(annotated,`${caption} — version annotée. Original : ${known(asset.name)}`);
      else if (note.annotatedAssetId) content.push(paragraph('Version annotée absente du stockage : '+note.annotatedAssetId));
      await embed(asset,`${caption}${annotated ? ' — photo originale' : ''}. Fichier : ${known(asset.name)}`);
    }
  }
  content.push(paragraph('Pièces et conservation',{style:'Heading1'}),paragraph('Ce document Word est modifiable. Les photos incorporées sont des copies de travail ; les originaux restent dans le carnet et l’archive complète. Les documents et notes vocales sont nommés dans les fiches et doivent être consultés dans cette archive. Conservez l’archive indépendante avec ce compte rendu.'));
  const sect='<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/><w:cols w:space="708"/></w:sectPr>';
  const entries=[
    ['[Content_Types].xml',`${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...mediaTypes].map(([extension,type]) => `<Default Extension="${extension}" ContentType="${type}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`],
    ['_rels/.rels',`${xmlHeader}<Relationships xmlns="${relationshipRoot}"><Relationship Id="rIdDocument" Type="${officeRelationship}officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml',`${xmlHeader}<w:document ${documentNamespaces}><w:body>${content.join('')}${sect}</w:body></w:document>`],
    ['word/styles.xml',styles],
    ['word/_rels/document.xml.rels',`${xmlHeader}<Relationships xmlns="${relationshipRoot}"><Relationship Id="rIdStyles" Type="${officeRelationship}styles" Target="styles.xml"/>${relationships.join('')}</Relationships>`],
    ...media
  ];
  return storedZip(entries);
}
