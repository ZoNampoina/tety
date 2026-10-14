# Architecture de Tety

Tety est une application Web progressive unique, conçue d'abord pour Android puis adaptée aux écrans PC. La livraison est un ensemble de fichiers statiques dans `dist/`, sans serveur de données ni compte nécessaire pour les observations de terrain. Une adresse HTTPS stable est nécessaire pour les capacités de PWA et les permissions navigateur en utilisation réelle sur Android.

## Modules

| Fichier | Rôle |
| --- | --- |
| `index.html`, `style.css`, `manifest.webmanifest`, icônes | Interface responsive, navigation inférieure, modes de lecture et installation autonome |
| `app.mjs` | Parcours terrain, formulaires, missions, permissions du téléphone, médias, exports et navigation |
| `storage.mjs` | Base locale IndexedDB, écritures transactionnelles, brouillons de secours et archives portables |
| `geo.mjs` | Analyse des CSV, diagnostics, géométrie indicative et propositions d'AERP autour d'une position |
| `permits.json` | Jeu initial des quatre AERP issu des références du carnet et du CSV corrigé |
| `sw.js` | Préparation de la coque de l'application et ouverture locale sans réseau |
| `tests/` | Vérifications automatisées des données, des archives et de la géométrie ; elles complètent la réception sur Android physique |

## Données locales et conservation

La base `tety-field-data` comporte les collections `observations`, `assets`, `missions`, `drafts` et `settings`. Les médias sont conservés comme objets Blob. L'écriture d'une observation contrôle la présence de ses références et valide la transaction avant de confirmer l'enregistrement. Une pièce ou mission encore référencée ne peut pas être supprimée par les opérations protégées du module.

Les champs du formulaire alimentent un brouillon automatiquement. Une copie textuelle de secours dans localStorage complète IndexedDB ; cette copie ne remplace pas les médias ni une archive indépendante. Les changements de visibilité et de page déclenchent une tentative de conservation. Les garanties de réception portent sur les écritures réellement terminées : aucun navigateur ne peut promettre une dernière écriture après qu'Android a supprimé son processus.

Les notes vocales doivent conserver leurs segments avec un identifiant stable de session et de brouillon, puis finaliser le fichier à l'arrêt. Le passage à l'arrière-plan arrête la note. L'état temporaire de l'interface et les segments encore non validés ne sont pas une sauvegarde ; leur reprise et l'absence de rattachement au mauvais point font partie de la réception Android.

## Archives et transferts

Le format portable `tety-portable-archive`, version 1, regroupe les cinq collections et les médias encodés en base64. Chaque média possède une taille et une empreinte SHA-256 contrôlées avant import. L'import contrôle le format, les identifiants, les références et les fichiers avant d'écrire. Les collisions doivent préserver les fiches locales, créer des copies et remapper les relations. Les collections de permis importées doivent rester accessibles à l'interface même lorsqu'une version différente était déjà présente.

Les limites sont de 25 Mio par pièce et 100 Mio par archive JSON. L'encodage base64 augmente la taille du fichier ; un lot de médias inférieur à 100 Mio peut donc dépasser la limite d'archive. Le format n'est ni un ZIP ni un fichier chiffré. Les exports CSV, GeoJSON et bilan sont des vues de consultation : seule l'archive complète transporte les pièces jointes et les brouillons.

## Géométrie et prudence scientifique

Les coordonnées originales `x`, `y`, `lat`, `lng` sont conservées. Les contours dérivés utilisent une hypothèse explicite de points au centre de carrés et une transformation locale ajustée aux couples de coordonnées. Le datum et la projection de la source ne sont pas déduits comme des certitudes. Une surface ou longueur est conditionnelle à l'unité et au pas renseignés. Les diagnostics de comptage, grille et ajustement accompagnent la géométrie.

La reconnaissance GPS fournit une proposition AERP à confirmer, en tenant compte de la précision de position et de l'écart de l'ajustement. Elle ne constitue pas une validation des limites légales. Les observations de terrain, déclarations et interprétations sont distinguées dans le questionnaire. Les suggestions sont classées d'après les repères utilisés localement ; elles ne produisent pas de conclusion géologique nouvelle.

## Hors ligne et mises à jour

Le service worker prépare les ressources statiques ; IndexedDB conserve les données de terrain séparément de cette coque. Aucune carte distante n'est requise pour les périmètres locaux. La préparation doit être suivie d'un essai d'ouverture en mode avion. Un déploiement doit versionner son cache de coque et activer une version complète, avec conservation des brouillons et médias avant bascule ; mélanger des modules de deux versions serait un défaut de fiabilité.

Changer d'adresse, de domaine ou de profil navigateur change l'origine de stockage. Le transfert vers un autre appareil ou une nouvelle adresse doit passer par une archive exportée puis restaurée. Le stockage persistant accordé par le navigateur réduit certains risques d'éviction ; il ne remplace pas cette copie indépendante.

## Extension ultérieure avec Capacitor

Une future application Android empaquetée peut réutiliser l'interface et les modules de données. Les opérations GPS, caméra, microphone, partage et stockage sont les frontières à isoler derrière des adaptateurs avant d'ajouter des extensions natives. Le format d'archive et les contrats des observations doivent rester compatibles, avec une migration explicite si le schéma change.

Cette livraison ne revendique pas un APK. Le gain éventuel d'un emballage natif doit être évalué sur la conservation, les permissions et l'énergie après réception de la PWA. Le guide `RECEPTION_ANDROID.md` est la liste des essais encore à réaliser sur les téléphones de mission ; il ne prétend pas qu'une vérification physique a déjà eu lieu.
