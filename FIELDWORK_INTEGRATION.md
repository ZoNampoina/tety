# Notes de terrain et carnet Word

Modules autonomes dans `dist/fieldwork.mjs`, `dist/fieldwork.css` et `dist/word-report.mjs`.

## Saisie

`templateFields(draft)` retourne du HTML échappé, à insérer dans `#point-form`. Tous les champs utilisent `name="q_..."` et sont donc compatibles avec la sauvegarde actuelle du questionnaire. Le modèle choisi utilise `questionnaire.template`; s’il manque, la catégorie donne le modèle par défaut. Un changement de modèle conserve les anciennes valeurs. Relancer le rendu après le changement du sélecteur `q_template` pour afficher ses champs.

Le bouton `data-action="sample-code"` doit appeler `suggestSampleCode({observations,drafts,date})`, affecter le résultat à `state.draft.questionnaire.sampleCode`, sauvegarder le brouillon, puis refaire le rendu. Il n’écrase pas automatiquement un code déjà saisi. La recherche considère tous les points et brouillons de l’appareil pour éviter les doublons entre missions. Les codes attribués indépendamment sur plusieurs appareils peuvent coïncider ; leur duplication doit être signalée à l’import ou à la consultation.

`labelForField(key)` donne le libellé français d’un champ connu. `questionnaireEntries(questionnaire)` prépare des champs lisibles et exclut `photoNotes`. Les trois rubriques de preuve sont `observed`, `interpretation` et `toVerify`. Les informations anciennes restent disponibles sans migration.

## Bilan

`dailyRecap({observations,assets,missions,missionId},day)` retourne le bilan des points **créés** à cette date locale et dans la mission demandée. `day` utilise `YYYY-MM-DD`; `localDay()` fournit la date locale courante. Le résultat expose `total`, `incomplete`, `photos`, `audio`, `samples`, `actions`, `access`, `byPermit`, `byCategory` et `missingAssets`.

`recapMarkup(recap)` retourne du HTML échappé. Le bouton `data-action="word-day"` déclenche l’export de la journée choisie. Les liens vers `#point?id=...` ouvrent les points pour complément.

## Word

`await createWordReport({mission,permits,observations,assets,day})` retourne un Blob du vrai format DOCX, avec texte modifiable, styles Word et images incorporées. Fournir uniquement la sélection voulue. `mission.id` et `day`, s’ils sont fournis, restreignent aussi les points ; le jour est celui de leur création locale.

Le résultat se télécharge par la fonction existante `deliver(blob, filename + '.docx')`. L’export reste local et fonctionne hors réseau sans dépendance ou service externe. Il utilise OpenXML et un ZIP non comprimé pour conserver les images originales sans perte. Plafonds : 25 Mio par photo et 100 Mio par document. En cas de volume trop important, exporter une journée ou une sélection plus petite.

Les légendes et versions annotées utilisent le contrat `observation.questionnaire.photoNotes = {[originalAssetId]:{caption,annotatedAssetId}}`. La version annotée est une pièce séparée avec `kind:'photo-annotation'` et `originalId`, également présente dans `assetIds`. Le document montre l’annotée et l’originale sous une légende explicite. Chaque fichier est incorporé une seule fois dans le package, même s’il apparaît dans plusieurs fiches. Les JPEG et PNG sont incorporés directement ; les autres formats d’image lisibles par le navigateur sont convertis en PNG pour Word. Les pièces absentes ou illisibles sont signalées dans le document. Les audios et documents sont nommés et restent dans l’archive complète.

Les IDs contenus dans `photoNotes` doivent être remappés lors d’une restauration avec conflit, comme `assetIds` et `originalId`. Les légendes ne modifient pas les Blob originaux.

Documentation de référence : Microsoft Open XML [structure du document](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document), [insertion d’image](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-insert-a-picture-into-a-word-processing-document).

## Vérification

Inclure `tests/fieldwork.test.mjs` et `tests/word-report.test.mjs` dans la commande de tests. Ils vérifient les modèles, l’échappement, les codes, le jour local, les missions, les statistiques, le drapeau manuel de revue du soir et les pièces absentes ; les tests Word inspectent le vrai ZIP, les relations d’images et les fichiers incorporés.

Vérification indépendante effectuée avec `zipfile`, `lxml` et `python-docx` : package intègre, tous les XML parsables, 54 paragraphes modifiables, 2 tableaux et 2 images dans le document de démonstration. Le renderer LibreOffice de la compétence a été tenté, mais LibreOffice est absent de cet ordinateur. Le document a donc été rendu par Word installé, dans une instance invisible, puis son PDF converti avec Poppler. Les 4 pages PNG ont été inspectées ; la pagination du tableau d’échantillons a été corrigée puis vérifiée à nouveau. Ces fichiers sont uniquement des contrôles de mise en page, hors application et hors publication.
