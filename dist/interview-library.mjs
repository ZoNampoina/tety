// Questionnaire templates are versioned source data. Answers keep their own question snapshot.
export const LIBRARY_VERSION = 1;
export const ROLES = Object.freeze(['Chef de district','Maire','Adjoint au maire','Chef de fokontany','Autorité traditionnelle','Représentant des orpailleurs','Responsable communautaire','Agent des Mines','Agent de l’Environnement','Agent des Eaux et Forêts','Propriétaire foncier','Habitant','Autre, à préciser']);
export const SPECIAL_ANSWERS = Object.freeze([{id:'unknown',label:'Ne sait pas'},{id:'not-applicable',label:'Non applicable'},{id:'refused',label:'Refuse de répondre'},{id:'verify',label:'À vérifier'},{id:'skipped',label:'À reprendre'}]);
export const THEMES = Object.freeze([
  {id:'A',label:'Occupation des sols et situation foncière',destination:'Occupation des sols',destinations:{PTPF:'Occupation des sols',PRSE:'Usages et enjeux fonciers'}},
  {id:'B',label:'Accès et infrastructures',destination:'Milieu et logistique',destinations:{PTPF:'Milieu et logistique',PRSE:'Infrastructures et accès'}},
  {id:'C',label:'Ressources en eau et environnement',destination:'Enjeux environnementaux',destinations:{PTPF:'Milieu et mesures à étudier',PRSE:'Enjeux environnementaux'}},
  {id:'D',label:'Activités minières et orpaillage',destination:'Contexte minier et contraintes',destinations:{PTPF:'Contexte minier et contraintes',PRSE:'Activités et risques miniers'}},
  {id:'E',label:'Population et économie locale',destination:'Moyens humains et économie',destinations:{PTPF:'Moyens humains et économie',PRSE:'Développement et emploi local'}},
  {id:'F',label:'Aspects sociaux et acceptabilité',destination:'Consultation et actions sociales',destinations:{PTPF:'Concertation et contraintes sociales',PRSE:'Consultation et actions sociales'}},
  {id:'G',label:'Administration et gouvernance locale',destination:'Coordination et vérifications',destinations:{PTPF:'Coordination et vérifications',PRSE:'Gouvernance et suivi'}},
  {id:'H',label:'Questions libres',destination:'Informations complémentaires',destinations:{PTPF:'Informations complémentaires',PRSE:'Informations complémentaires'}}
].map(theme => Object.freeze({...theme,destinations:Object.freeze(theme.destinations)})));

const land=['Maire','Adjoint au maire','Chef de fokontany','Propriétaire foncier','Autorité traditionnelle','Habitant'];
const local=['Maire','Adjoint au maire','Chef de fokontany','Responsable communautaire','Habitant'];
const mine=['Représentant des orpailleurs','Agent des Mines','Chef de fokontany'];
const environment=['Agent de l’Environnement','Agent des Eaux et Forêts','Chef de fokontany','Habitant'];
const administration=['Chef de district','Maire','Adjoint au maire','Agent des Mines','Agent de l’Environnement','Agent des Eaux et Forêts'];
const yes={questionId:'D1',values:['Oui',true,'yes']};
const question=(id,theme,label,type='text',extra={}) => {
  const category=THEMES.find(item => item.id===theme);
  return {id,theme,label,type,essential:false,priority:'normal',roles:[],options:[],suggestions:[],allowOther:true,allowComplement:true,destination:category.destination,destinations:{...category.destinations},...extra};
};
const rapid={essential:true,priority:'high'};
export const QUESTIONS = Object.freeze([
  question('A1','A','Quels villages et hameaux sont concernés ?','text',{...rapid,roles:land,suggestions:['Village principal','Hameaux dispersés','À localiser avec les habitants']}),
  question('A2','A','Comment les terrains sont-ils occupés ?','multi',{...rapid,roles:land,options:['Rizières','Cultures vivrières','Cultures de rente','Jachères','Pâturages','Forêt','Savane','Habitations','Orpaillage','Terrain dégradé','Lieu sacré','Cimetière']}),
  question('A3','A','Quelles activités agricoles ou économiques utilisent ces terrains ?','multi',{roles:land,options:['Riziculture','Cultures vivrières','Élevage','Pêche','Commerce','Artisanat','Orpaillage']}),
  question('A4','A','Qui sont les propriétaires, occupants ou gestionnaires à consulter ?','text',{...rapid,roles:land,suggestions:['Occupants à identifier','Propriétaire déclaré','Gestion coutumière','Commune','Service foncier']}),
  question('A5','A','Quels régimes fonciers sont déclarés ou documentés ?','multi',{roles:land,options:['Titre foncier présenté','Certificat foncier présenté','Occupation coutumière déclarée','Domaine public déclaré','Domaine privé déclaré','Situation non connue']}),
  question('A6','A','Existe-t-il des litiges ou conflits fonciers ?','boolean',{...rapid,roles:land,options:['Oui','Non']}),
  question('A7','A','Quels terrains, parties, motifs et démarches sont concernés par ces litiges ?','text',{roles:land,condition:{questionId:'A6',values:['Oui',true,'yes']}}),
  question('A8','A','Y a-t-il des terrains coutumiers, lieux sacrés ou interdits locaux ?','boolean',{...rapid,roles:land,options:['Oui','Non']}),
  question('A9','A','Où se trouvent les cimetières et lieux culturellement sensibles ?','location',{roles:land,suggestions:['Localisation à confirmer avec un accompagnateur','Coordonnées relevées sur place']}),
  question('A10','A','Quelles autorités ou personnes doivent être consultées avant une intervention ?','text',{roles:land,suggestions:['Chef de fokontany','Autorité traditionnelle','Propriétaire ou occupant','Commune','Service foncier']}),
  question('A11','A','Quel document ou constat peut étayer la situation foncière ?','observation',{roles:land,suggestions:['Document présenté','Visite à organiser','Copie à demander']}),
  question('B1','B','Quelles voies permettent d’accéder à la zone ?','multi',{...rapid,roles:local,options:['Route bitumée','Piste carrossable','Piste moto','Sentier pédestre','Voie fluviale']}),
  question('B2','B','Quel est l’état des pistes et le moyen de transport adapté ?','select',{...rapid,roles:local,options:['Voiture légère','4 × 4 nécessaire','Moto','À pied','Pirogue','Accès impossible actuellement']}),
  question('B3','B','À quelles périodes l’accès devient-il difficile ou impossible ?','text',{...rapid,roles:local,suggestions:['Saison des pluies','Période cyclonique','Après fortes pluies','Toute l’année selon déclaration']}),
  question('B4','B','Quels ponts, gués, rivières et passages difficiles faut-il franchir ?','location',{roles:local,suggestions:['Pont à contrôler','Gué saisonnier','Traversée en pirogue','Passage à reconnaître']}),
  question('B5','B','Quels transports locaux sont disponibles et auprès de qui ?','multi',{roles:local,options:['4 × 4','Camion','Moto','Pirogue','Portage','Aucun service connu']}),
  question('B6','B','Quelles possibilités d’hébergement et de stockage sécurisé existent ?','text',{roles:local,suggestions:['Hébergement chez l’habitant','Petit hôtel','Campement à étudier','Local communal proposé','Stockage à identifier']}),
  question('B7','B','Quelle couverture mobile est déclarée sur place ?','multi',{roles:local,options:['Appels possibles','Données mobiles possibles','Couverture intermittente','Aucune couverture connue','Opérateur à préciser']}),
  question('B8','B','Quelles sources d’électricité et d’approvisionnement sont disponibles ?','multi',{roles:local,options:['Réseau électrique','Solaire','Groupe électrogène','Carburant disponible localement','Approvisionnement extérieur nécessaire']}),
  question('B9','B','Quels prestataires locaux peuvent aider à la logistique ?','text',{roles:local,suggestions:['Guide','Chauffeur','Piroguier','Hébergeur','Fournisseur','Mécanicien']}),
  question('B10','B','Quel coût logistique a été communiqué ?','number',{roles:local,unit:'MGA',destination:'Éléments à examiner pour le budget',destinations:{PTPF:'Éléments à examiner pour le budget',PRSE:'Moyens et budget à examiner'},suggestions:['Devis à demander','Tarif déclaré à confirmer']}),
  question('B11','B','Quelle durée de trajet a été déclarée ou mesurée ?','number',{roles:local,unit:'minutes'}),
  question('C1','C','Quels cours d’eau, sources et points d’eau sont utilisés par les habitants ?','location',{...rapid,roles:environment,suggestions:['Rivière','Source','Puits','Borne-fontaine','Prélèvement GPS à réaliser']}),
  question('C2','C','Quels sont les usages de l’eau ?','multi',{roles:environment,options:['Boisson','Cuisine','Lessive','Irrigation','Élevage','Pêche','Orpaillage']}),
  question('C3','C','Existe-t-il des zones humides ou inondables ?','boolean',{...rapid,roles:environment,options:['Oui','Non']}),
  question('C4','C','Quels secteurs et périodes sont concernés par les inondations ?','text',{roles:environment,condition:{questionId:'C3',values:['Oui',true,'yes']},suggestions:['Saison des pluies','Crues rapides','Témoignage historique à dater']}),
  question('C5','C','Quels risques naturels sont signalés ?','multi',{...rapid,roles:environment,options:['Érosion','Glissement de terrain','Inondation','Crue','Cyclone','Sécheresse']}),
  question('C6','C','Quelles forêts, zones sensibles ou restrictions connues doivent être localisées ?','location',{...rapid,roles:environment,suggestions:['Forêt','Zone humide','Aire protégée déclarée à vérifier','Zone de conservation communautaire déclarée']}),
  question('C7','C','Quelles espèces ou habitats sensibles sont connus et par quelle source ?','text',{roles:environment,suggestions:['Observation directe à documenter','Nom local à préciser','Information du service technique à demander']}),
  question('C8','C','Quelles zones sont déjà dégradées et depuis quand ?','observation',{roles:environment,suggestions:['Défrichement','Érosion visible','Ancien chantier','Site abandonné']}),
  question('C9','C','Une pollution ancienne ou actuelle est-elle signalée ?','boolean',{roles:environment,options:['Oui','Non']}),
  question('C10','C','Quels lieux, sources possibles et éléments de preuve concernent cette pollution ?','observation',{roles:environment,condition:{questionId:'C9',values:['Oui',true,'yes']},suggestions:['Déclaration à vérifier','Photo','Document présenté','Analyse à réaliser']}),
  question('C11','C','Quelles restrictions locales portent sur l’eau, le bois ou les autres ressources ?','text',{roles:environment,suggestions:['Règle coutumière déclarée','Restriction administrative à vérifier','Usage communautaire prioritaire']}),
  question('C12','C','Quels documents ou études environnementales sont disponibles ?','observation',{roles:environment,suggestions:['Étude présentée','Inventaire à demander','Carte à consulter','Service compétent à contacter']}),
  question('D1','D','Existe-t-il des activités d’orpaillage ?','boolean',{...rapid,roles:mine,options:['Oui','Non']}),
  question('D2','D','Où sont situés les sites d’orpaillage signalés ?','location',{...rapid,roles:mine,condition:yes,suggestions:['Site actif','Ancien site','Localisation déclarée à vérifier']}),
  question('D3','D','Combien d’orpailleurs sont estimés sur les sites ?','number',{roles:mine,condition:yes,unit:'personnes',suggestions:['Estimation déclarée','Comptage observé']}),
  question('D4','D','Comment les orpailleurs sont-ils organisés ?','multi',{roles:mine,condition:yes,options:['Individuels','Familles','Groupement déclaré','Association','Organisation à préciser']}),
  question('D5','D','Les sites sont-ils actifs ou abandonnés ?','select',{roles:mine,condition:yes,options:['Actifs','Abandonnés','Activité saisonnière','Situation variable selon le site']}),
  question('D6','D','Depuis quelle date ou période ces activités existent-elles ?','date',{roles:mine,condition:yes,suggestions:['Date exacte inconnue','Période approximative à préciser']}),
  question('D7','D','Quelles substances sont recherchées ou déclarées ?','multi',{roles:mine,condition:yes,options:['Or','Pierres précieuses','Pierres fines','Autre substance à préciser']}),
  question('D8','D','Quelles techniques sont pratiquées ?','multi',{roles:mine,condition:yes,options:['Lavage à la batée','Sluice','Fouille manuelle','Puits','Galerie','Pompage','Mécanisation signalée']}),
  question('D9','D','Quelles autorisations sont déclarées ou quels documents ont été présentés ?','observation',{roles:mine,condition:yes,suggestions:['Autorisation déclarée sans document','Document présenté à vérifier','Information administrative à demander'],help:'Une autorisation déclarée ou photographiée ne vaut pas vérification administrative.'}),
  question('D10','D','Quels groupements et personnes ressources peuvent confirmer les informations ?','text',{roles:mine,condition:yes}),
  question('D11','D','Des conflits miniers ou difficultés avec les usagers sont-ils signalés ?','boolean',{...rapid,roles:mine,options:['Oui','Non']}),
  question('D12','D','Quels conflits, parties et démarches sont rapportés ?','text',{roles:mine,condition:{questionId:'D11',values:['Oui',true,'yes']}}),
  question('D13','D','Quels antécédents d’exploitation ou anciens travaux sont connus ?','text',{roles:mine,suggestions:['Travaux anciens signalés','Site visité','Archive à rechercher']}),
  question('D14','D','Quels secteurs présentent des indices miniers signalés ou observés ?','location',{roles:mine,suggestions:['Indice déclaré','Affleurement observé','Échantillon à analyser']}),
  question('D15','D','Quelle vérification administrative reste nécessaire et auprès de quel service ?','text',{roles:['Agent des Mines','Chef de district'],suggestions:['BCMM à consulter','Service régional des Mines','Document à authentifier']}),
  question('E1','E','Quelles sont les principales activités économiques locales ?','multi',{...rapid,roles:local,options:['Agriculture','Élevage','Pêche','Commerce','Artisanat','Transport','Orpaillage','Emploi salarié']}),
  question('E2','E','Quelle main-d’œuvre est disponible et à quelles périodes ?','text',{...rapid,roles:local,suggestions:['Disponibilité saisonnière','Disponibilité à préciser','Recrutement à discuter localement']}),
  question('E3','E','Quelles qualifications ou compétences locales sont disponibles ?','multi',{roles:local,options:['Guidage','Conduite','Mécanique','Maçonnerie','Menuiserie','Cuisine','Portage','Secourisme','Relevés de terrain']}),
  question('E4','E','Quels fournisseurs ou prestataires peuvent être consultés ?','text',{roles:local}),
  question('E5','E','Quelles cultures et périodes culturales influencent la disponibilité locale ?','text',{roles:local,suggestions:['Préparation des rizières','Repiquage','Récolte','Période de soudure à préciser']}),
  question('E6','E','Quelles contraintes saisonnières affectent les activités et les prix ?','text',{roles:local,suggestions:['Pluies','Récoltes','Crues','Cyclones','Approvisionnement difficile']}),
  question('E7','E','Quels besoins de développement sont prioritaires selon l’interlocuteur ?','multi',{...rapid,roles:local,options:['Eau','Santé','Éducation','Accès routier','Électricité','Emploi','Formation','Soutien agricole']}),
  question('E8','E','Quelles collaborations locales seraient envisageables ?','text',{roles:local,suggestions:['Emploi local','Formation','Prestations locales','Partage d’informations','Concertation à organiser']}),
  question('F1','F','Quelles sont les attentes de la population à l’égard du projet ?','multi',{...rapid,roles:local,options:['Information régulière','Emploi local','Respect des terres','Protection de l’eau','Amélioration des accès','Appui communautaire','Formation']}),
  question('F2','F','Quelles préoccupations sont exprimées concernant la recherche minière ?','multi',{...rapid,roles:[...local,'Autorité traditionnelle'],options:['Accès aux terres','Qualité de l’eau','Cultures','Lieux sacrés','Sécurité','Poussière','Bruit','Répartition des bénéfices','Information insuffisante']}),
  question('F3','F','Des tensions sociales ou conflits sont-ils signalés ?','boolean',{...rapid,roles:local,options:['Oui','Non']}),
  question('F4','F','Quels faits, groupes concernés et démarches sont rapportés ?','text',{roles:local,condition:{questionId:'F3',values:['Oui',true,'yes']}}),
  question('F5','F','Quels besoins communautaires et actions sociales sont proposés ?','text',{roles:local,suggestions:['Priorités à discuter avec les groupes concernés','Proposition de l’interlocuteur','Engagement non décidé']}),
  question('F6','F','Comment organiser les consultations et rendre compte de leurs suites ?','multi',{roles:[...local,'Autorité traditionnelle'],options:['Réunion communautaire','Entretiens individuels','Information au fokontany','Consultation des femmes','Consultation des jeunes','Réunion avec les orpailleurs','Compte rendu partagé']}),
  question('F7','F','Comment les réclamations peuvent-elles être reçues et suivies ?','text',{roles:local,suggestions:['Personne de contact','Registre local','Numéro de téléphone consenti','Délai et responsable à définir']}),
  question('F8','F','Quelles personnes ou quels groupes doivent être associés aux échanges ?','text',{...rapid,roles:[...local,'Autorité traditionnelle'],suggestions:['Occupants','Propriétaires','Femmes','Jeunes','Orpailleurs','Groupes vulnérables','Autorités traditionnelles']}),
  question('G1','G','Quels risques administratifs ou sécuritaires doivent être anticipés ?','multi',{...rapid,roles:administration,options:['Sécurité des déplacements','Conflit foncier','Conflit minier','Autorisation à vérifier','Coordination insuffisante','Accès sensible']}),
  question('G2','G','Quels services techniques et interlocuteurs faut-il coordonner ?','text',{...rapid,roles:administration,suggestions:['District','Commune','Mines','Environnement','Eaux et Forêts','Service foncier','BCMM']}),
  question('G3','G','Quels conflits antérieurs et modes de résolution sont connus ?','text',{roles:administration}),
  question('G4','G','Quels autres projets interviennent dans la zone ?','text',{roles:administration,suggestions:['Projet public','Projet privé','Projet communautaire','Périmètre et contacts à vérifier']}),
  question('G5','G','Quelles modalités de concertation et de transmission des informations sont recommandées ?','text',{roles:administration,suggestions:['Réunion de coordination','Information écrite','Point de contact unique','Calendrier à convenir']}),
  question('G6','G','Quels documents administratifs sont disponibles et auprès de qui ?','observation',{roles:administration,suggestions:['Document présenté','Copie à demander','Référence à vérifier']}),
  question('G7','G','Quelles recommandations les autorités formulent-elles ?','text',{...rapid,roles:administration}),
  question('G8','G','Quels points nécessitent une autorisation ou une vérification complémentaire ?','text',{...rapid,roles:administration,suggestions:['Document à authentifier','Statut du permis à vérifier','Service compétent à consulter','Démarche locale à préciser']}),
  question('G9','G','Quelle date ou période est proposée pour le suivi ?','date',{roles:administration}),
  question('H1','H','Quelle information ou observation complémentaire souhaitez-vous ajouter ?','text',{roles:[],suggestions:['Observation inattendue','Recommandation','Autre localité','Autre permis']}),
  question('H2','H','Quel point doit être approfondi ou vérifié après cet entretien ?','text',{...rapid,roles:[],suggestions:['Visite complémentaire','Document à obtenir','Personne à revoir','Localisation à préciser']}),
  question('H3','H','Quelle photo, pièce ou observation de terrain complète cet entretien ?','observation',{roles:[]})
].map(item => Object.freeze({...item,options:Object.freeze(item.options),suggestions:Object.freeze(item.suggestions),roles:Object.freeze(item.roles),destinations:Object.freeze(item.destinations),...(item.condition?{condition:Object.freeze({...item.condition,values:Object.freeze(item.condition.values)})}:{})})));

const normalize=value => String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[’']/g,'').trim();
export function answerValue(answer) {return answer && typeof answer==='object' && !Array.isArray(answer) ? answer.value : answer;}
export function isQuestionVisible(question,answers={}) {
  if (!question?.condition) return true;
  const condition=question.condition,answer=answers[condition.questionId];
  if (answer && typeof answer==='object' && answer.status && answer.status!=='answered') return false;
  const values=Array.isArray(answerValue(answer)) ? answerValue(answer) : [answerValue(answer)];
  return values.some(value => condition.values?.some(expected => normalize(value)===normalize(expected)));
}

/** All categories remain available with includeAll; conditions never remove a saved answer. */
export function getQuestions({role='',mode='complete',answers={},questions=QUESTIONS,theme='',search='',includeAll=false,includeHidden=false}={}) {
  const roleKey=normalize(role),needle=normalize(search),quick=['quick','rapid','rapide'].includes(mode);
  const selected=questions.filter(item => (!theme || item.theme===theme) && (includeAll || !quick || item.essential) && (includeHidden || isQuestionVisible(item,answers)) && (!needle || normalize([item.label,item.theme,...(item.options||[]),...(item.suggestions||[])].join(' ')).includes(needle)));
  const score=item => ((item.roles||[]).some(value => normalize(value)===roleKey)?100:0)+(item.essential?10:0)+(item.priority==='high'?2:0);
  return selected.map((item,index)=>({item,index})).sort((a,b)=>score(b.item)-score(a.item)||a.index-b.index).map(({item})=>item);
}

export function suggestionsFor(question,{suggestions={}}={}) {
  return [...new Set([...(question?.suggestions||[]),...(suggestions[question?.id]||[])].map(value=>String(value).trim()).filter(Boolean))];
}

export function destinationFor(question,{mappings={},document=''}={}) {
  const mapping=mappings[question?.id] ?? mappings[question?.theme];
  if (typeof mapping==='string') return mapping;
  return mapping?.[document] || mapping?.destination || question?.destinations?.[document] || question?.destination || 'Informations complémentaires';
}
