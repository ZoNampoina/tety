# Tety

Carnet de reconnaissance des AERP 41914, 41998, 42230 et 42278 de MANAJARY S.A.R.L. PWA conçue d’abord pour Android, avec consultation et traitement sur PC.

## Préparer le téléphone

1. Ouvrir l’adresse GitHub Pages fournie par le déploiement dans Chrome Android. Le dépôt et le site GitHub sont publics ; vos observations et médias restent locaux au navigateur.
2. Attendre la confirmation « Application préparée hors ligne ».
3. Menu de Chrome → Installer l’application ou Ajouter à l’écran d’accueil. Le bouton Installer de Tety lance l’invite quand le navigateur la propose.
4. Dans les paramètres de Tety, demander le stockage persistant. Un refus n’empêche pas la saisie, mais renforce la nécessité des archives.
5. Faire un point d’essai, joindre une photo, exporter une sauvegarde, puis vérifier la fermeture et la réouverture en mode avion.
6. Conserver une archive indépendante hors du téléphone avant la descente. Le guide RECEPTION_ANDROID.md détaille les essais sur appareil réel.

## Ce qui fonctionne localement

Création de points incomplets, reprise des brouillons, GPS si le téléphone peut obtenir une position, photos par caméra ou import, documents, notes vocales, questionnaires dépliables, suggestions classées selon l’usage du carnet, missions, lecture et modification, carte des périmètres et observations, exports CSV et GeoJSON, bilan de mission Markdown et archives intégrales.

Les archives `.tety.json` contiennent aussi les photographies, fichiers audio, documents, brouillons et périmètres. Elles s’importent sur un autre appareil préparé. Les versions en conflit sont conservées avec de nouveaux identifiants ; les observations de toutes les missions sont affichées après restauration. Les configurations de périmètres en conflit se comparent dans les paramètres.

L’archive est plafonnée à 100 Mio et chaque fichier à 25 Mio. Les données exportées sont en clair. La carte propose des fonds en ligne et des extraits vectoriels OSM préparés hors ligne. Les contours reconstruits et les accès restent à vérifier sur le terrain. Les suggestions sont locales et explicables, sans service d’IA externe.

## Données AERP

Les données proviennent des CSV et des captures fournis dans le carnet. Le CSV corrigé du 42278 contient 96 carrés. La lacune intérieure est exclue du périmètre représenté.

Le 42278 affiche une échéance au 19 octobre 2026. La date d’octroi, le statut actuel, le dernier FA payé, le dossier en cours et les substances ne sont pas inventés. Les limites sont indicatives : datum, projection et interprétation exacte des points doivent être confirmés. L’AERP proposé par GPS exige une confirmation explicite.

## Installation et vérification

Les fichiers `dist/` sont statiques et ne chargent aucune dépendance externe. Sur PC, `npm start` ou `node serve.cjs` lance http://127.0.0.1:4173. Une adresse HTTPS est nécessaire pour une installation sur Android et les permissions matérielles. Ne pas ouvrir index.html directement avec file://.

`npm test` lance les tests des données, de la géométrie et des archives avec Node récent. Les tests navigateur supplémentaires utilisent Playwright et un navigateur Chromium/Edge. Les tests navigateur sont facultatifs. Installer Playwright sur le poste de test et choisir le navigateur via TETY_BROWSER_EXECUTABLE si nécessaire. Aucun navigateur ni paquet externe n’est chargé par la PWA publiée.

Les tests automatiques couvrent le stockage réel, le GPS simulé, les photos importées, la saisie et la réouverture hors ligne, la reprise des brouillons, les conflits, le transfert entre deux navigateurs préparés et l’affichage mobile et PC. Ils ne remplacent pas les essais physiques Android.

## Maintenance

Le dépôt https://github.com/ZoNampoina/tety contient les sources. Dans Settings → Pages, choisir GitHub Actions comme source. Les tests sont lancés à chaque mise à jour de main. Le workflow Pages teste puis publie dist à chaque mise à jour de main, après activation de Pages dans les réglages. Il peut aussi être lancé depuis Actions. L’adresse est fournie par ce job de déploiement.

Une seule base de code. Voir ARCHITECTURE.md pour le stockage, le service worker et l’évolution future vers Capacitor. Avant de publier une modification de l’application, lancer node tools/prepare-release.mjs pour changer la version du cache selon le contenu des fichiers. Les mises à jour sont proposées depuis les paramètres après sauvegarde du brouillon ; elles ne modifient pas la base IndexedDB.

Les observations appartiennent au navigateur et à l’adresse utilisés. Changer d’adresse, de profil ou d’appareil exige un transfert par archive.

## Migration depuis la version Sites

Avant de changer d’adresse, exporter une archive complète depuis la version Sites puis l’importer dans la version GitHub Pages. Les deux adresses ont des stockages distincts. Ne pas effacer l’ancienne version avant d’avoir contrôlé les points et photographies restaurés.

## Version 2

Les améliorations de carte, notes, photos, échantillons, bilan, checklist, export Word et logo sont décrites dans [EVOLUTIONS_V2.md](EVOLUTIONS_V2.md). Le fond satellite public est une mosaïque Landsat de l’année 2000. Les cartes préparées hors ligne sont des extraits vectoriels OSM, avec leur source, date et couverture.

