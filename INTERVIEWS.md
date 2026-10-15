# Module Entretiens

## Audit de départ — 15 octobre 2026

Tety est une PWA statique publiée depuis `dist/`. Elle ne dépend d'aucun serveur de données. Les données de terrain restent dans IndexedDB pour l'origine et le profil du navigateur utilisés. Les fichiers de l'application, le manifeste et le service worker utilisent des adresses relatives compatibles avec le chemin GitHub Pages `/tety/`.

Avant cette évolution, `app.mjs` proposait l'accueil, la carte, les points, les observations, les missions, les paramètres, le bilan et les échantillons. `storage.mjs` utilisait la base `tety-field-data`, version 1, avec cinq collections : `observations`, `assets`, `missions`, `drafts`, `settings`. Les écritures de points et pièces jointes sont transactionnelles. Le formulaire terrain possède une autosauvegarde et un secours textuel localStorage. Aucune synchronisation distante n'est présente.

Le format `tety-portable-archive`, version 1, valide les collections, les références, les coordonnées et les médias avant import. Il conserve les versions en conflit en remappant leurs identifiants. Les pièces jointes sont des Blob locaux, limités à 25 Mio ; une archive complète est limitée à 100 Mio. Les fichiers JSON exportés sont en clair.

Le jeu initial contient quatre AERP : 41914, 41998, 42230 et 42278. Les trois nouveaux numéros demandés doivent conserver des métadonnées administratives distinctes et un statut à vérifier si aucune source fiable n'est enregistrée. Aucun contour ne peut être fabriqué à partir du nombre de carrés ou du nom d'une localité.

Le script `tools/prepare-release.mjs` calcule la version du cache à partir des ressources de `dist/` et renouvelle la liste de préparation hors ligne. Le workflow `.github/workflows/pages.yml` exécute les tests Node et la vérification syntaxique de l'application, prépare `dist/`, puis publie GitHub Pages après une mise à jour de `main`. Le déploiement ne doit jamais effacer IndexedDB. Un changement d'adresse publique exige un transfert préalable par archive.

## Principes de réception

- Une personne, une réunion et un entretien sont des objets distincts. Une réunion rassemble plusieurs entretiens ; une personne peut revenir plusieurs fois.
- Un entretien lié à plusieurs permis possède un identifiant unique et reste consultable depuis chacun de ces permis.
- Une déclaration et sa source restent distinctes d'un fait observé ou administrativement vérifié. Les réponses contradictoires sont conservées séparément.
- Les anciennes observations, missions, pièces jointes, réglages et archives doivent rester exploitables après mise à jour.
- Une confirmation d'enregistrement correspond à une écriture terminée. La reprise après interruption peut conserver la dernière écriture validée ; la dernière frappe interrompue avant validation dépend du secours disponible et du navigateur.
- Les fonctions essentielles et les exports doivent fonctionner hors ligne, après préparation complète de la PWA.

## Vérifications de départ

Les 49 tests Node existants passent avant modification. Ils couvrent les jeux de permis, la géométrie et le GPS indicatifs, les archives et conflits, les brouillons et références, les médias, les outils terrain, les cartes préparées et les exports Word.

Les tests navigateur existants vérifient IndexedDB réel et son rollback, le chemin `/tety/`, l'ouverture hors ligne, la conservation des points et les cartes préparées. Playwright et Microsoft Edge sont disponibles sur le poste de réception. Le premier lancement dans le bac à sable Windows s'est arrêté avant ouverture de page ; la réception nécessite un navigateur autorisé à démarrer.

## Scénarios de réception du module

1. Sur une largeur de 390 pixels, ouvrir Entretiens, créer un maire et une réunion, puis démarrer un entretien rapide associé au permis 40378. Répondre par suggestion et complément libre, puis revenir au carnet.
2. Réutiliser cette personne pour un second entretien. Vérifier les deux identifiants et leurs réponses propres. Ajouter d'autres interlocuteurs à la même réunion sans mélanger les déclarations.
3. Créer un entretien associé aux permis 39985 et 40378. Affecter une réponse à un permis et une autre à l'ensemble sélectionné. Vérifier les deux dossiers et l'absence de duplication.
4. Ajouter un numéro manuel inédit et vérifier qu'il reste disponible après rechargement, sans géométrie ni statut supposé.
5. Répondre oui à l'orpaillage pour afficher les sous-questions ; répondre non pour les masquer, puis revenir sur oui et retrouver les réponses déjà saisies.
6. Basculer Rapide/Complet, retrouver toutes les catégories et reprendre une question signalée. Modifier une réponse et contrôler son historique et son horodatage.
7. Ajouter une photo légendée, un document, une note, une position et le lien vers une observation existante. Recharger et contrôler les références.
8. Couper le réseau après préparation, créer et modifier un entretien, fermer sa page puis la rouvrir. Les dernières réponses confirmées doivent être présentes.
9. Créer des témoignages incompatibles sur un même permis et sujet. La comparaison doit afficher chaque personne, chaque réponse, sa portée et son état, avec une indication de vérification utile.
10. Exporter la fiche, le compte rendu de réunion, la comparaison et la synthèse du permis. Contrôler les personnes, dates, permis, sources, informations manquantes et actions à entreprendre. Ouvrir les formats effectivement proposés et vérifier qu'ils contiennent du texte réutilisable.
11. Exporter une archive complète, l'importer dans un autre contexte navigateur, puis réimporter une version en conflit. Les anciennes données et les nouveaux liens doivent tous être conservés.
12. Vérifier à nouveau les anciens parcours : nouveau point, GPS simulé, photo, brouillon, carte, mission, bilan, échantillon, sauvegarde et export Word.

Les essais automatisés complètent une réception sur téléphone Android physique : clavier, caméra, GPS réel, permissions, fermeture forcée du processus, redémarrage, installation et reprise en mode avion restent à contrôler sur l'appareil de mission.

## Réalisation livrée

L'onglet Entretiens ouvre la liste, les interlocuteurs, les réunions et la synthèse comparative. Les dossiers de permis donnent accès aux entretiens associés. La sélection d'une personne enregistrée crée un nouvel entretien ; les réponses de ses rencontres précédentes ne sont pas recopiées. Une copie de sa fiche source et des questions effectivement posées protège l'attribution des témoignages contre les modifications ultérieures de modèles.

La bibliothèque comprend **77 questions, huit thèmes et treize fonctions proposées**. Le profil classe les questions pertinentes sans interdire l'accès aux autres catégories. Le mode Rapide présente une question et des choix cliquables ; le mode Complet permet d'approfondir le même entretien. Les questions conditionnelles masquées gardent leurs réponses, consultables en affichant toutes les questions. Des modèles locaux, des suggestions et des correspondances documentaires sont personnalisables.

Les réponses comprennent leur portée, leur provenance, leur fiabilité, une date source, des pièces et observations liées, un complément et un indicateur de reprise. Les notes générales et notes horodatées restent indépendantes. Les photos originales, légendes, documents et positions sont conservés localement. L'historique garde les changements ; les frappes successives proches sont regroupées pour éviter de produire une entrée par caractère.

Les trois titres fournis sont ajoutés uniquement s'ils sont absents : 39985, 40378 et 40466. Le nombre fourni est un nombre déclaré, distinct des carrés géoréférencés disponibles. Leur statut reste à vérifier et leur géométrie n'est pas inventée. Les permis déjà enregistrés sont conservés. La saisie manuelle permet d'ajouter un autre numéro sans contour supposé.

La base passe à la version 2 par ajout des collections `interviewPeople`, `interviewMeetings` et `interviews`, sans suppression ni réinitialisation des cinq collections antérieures. Les archives de version 1 existantes restent importables ; les nouvelles archives conservent aussi les entretiens, les personnes, les réunions et les références. Les conflits préservent les deux versions, y compris une saisie récente encore présente seulement dans le secours local. Réimporter le même contenu ne doit pas créer de copies supplémentaires.

Les rapports proposent une fiche individuelle, un compte rendu de réunion, une comparaison, une synthèse par permis et les informations à compléter. La synthèse sépare informations confirmées, déclarations non vérifiées, contradictions, manques et actions. Les formats disponibles sont CSV, DOCX, HTML imprimable et archive JSON complète. Les noms, dates, permis, portées et sources restent visibles. Les témoignages différents ne sont jamais fusionnés en une certitude.

## Réception automatisée finale — 15 octobre 2026

| Contrôle | Résultat |
| --- | --- |
| Tests Node | **82 / 82 réussis** : 49 tests hérités et 33 nouveaux tests de modèles, archives et rapports |
| Syntaxe des modules de `dist/` et du service worker | Réussie |
| Tests navigateur `node:test` | **5 / 5 réussis** : stockage réel, Pages, carte et deux parcours Entretiens |
| Parcours terrain `app-browser.cjs` | Réussi : GPS simulé, photo, brouillon, reprise, hors ligne, secours, archives, conflit, transfert PC, portrait, paysage, bureau, reprise audio et mode sombre |
| Parcours audio `audio-browser.cjs` | Réussi : segments effectivement écrits puis note reconstituée après rechargement |
| Migration réelle IndexedDB v1 vers v2 | Réussie : observation, photo binaire, mission, brouillon et réglages antérieurs comparés sans modification |
| Personnes et réunions | Réussi : trois personnes et quatre entretiens d'une réunion, dont deux rencontres distinctes pour la même personne |
| Permis et réponses conditionnelles | Réussi : plusieurs permis, portée limitée à 40378, numéro manuel, métadonnées des titres ajoutés, D1 Oui/Non/Oui et conservation de D2 |
| Hors ligne et interruption | Réussi : fermeture de la page, réouverture préparée sans réseau, modification, rechargement et réponse retrouvée |
| Secours après échec IndexedDB | Réussi : transaction interrompue, dernière saisie exportée immédiatement en JSON et HTML, fermeture et réouverture possibles |
| Comparaison et exports | Réussi : réponses et sources séparées, divergence signalée, téléchargements CSV/DOCX/HTML/JSON, réunion, fiche individuelle, manques et cinq groupes de synthèse |
| Archives et collisions | Réussi : transfert intégral entre contextes, réimport identique sans duplication, conflit conservé et secours récent pris en compte dans export et import |
| Android et ordinateur | Réussi en navigateur : largeur 390 pixels, comparaison à 1440 pixels, absence de débordement horizontal et inspection visuelle des captures |

Les tests utilisent des profils navigateur temporaires et des données fictives ; aucun entretien de test n'est ajouté aux données d'un utilisateur. Les captures et exports de réception sont produits dans `work/qa/`, hors de `dist/`. Les anciens sélecteurs de test « Notes » et « Carte locale » ont été alignés sur les libellés existants « Notes libres » et « Carte de terrain » ; l'ouverture d'une photo attend désormais la fin réelle du rendu.

Les premiers essais navigateur avaient révélé une animation Leaflet survivant à la destruction de la carte. Le contrôle de cycle de vie a été corrigé et le test dédié passe. Les contrôles de conservation ont également exercé les erreurs de transaction et les versions concurrentes, au lieu de se limiter à la saisie sans incident.

## Limites et réception sur appareil

- Les essais Android sont des simulations navigateur. La caméra, le microphone, le GPS, les permissions, le clavier et les restrictions de stockage doivent encore être reçus sur le téléphone réel, y compris après arrêt forcé et redémarrage.
- Une frappe interrompue avant son écriture effective reste soumise aux capacités du navigateur. Le secours textuel est limité en taille et ne remplace pas les médias ni une archive indépendante. Un stockage plein doit conduire à exporter et à conserver les fichiers.
- Les rapports réutilisables citent les pièces ; ils ne remplacent pas les originaux. Conserver l'archive complète pour les photographies, documents et historique. Les données personnelles et archives restent en clair sur l'appareil ou dans les fichiers exportés.
- Le PDF passe par « Imprimer / PDF » du navigateur. Le module ne produit pas de classeur XLSX et conserve un tableau CSV réutilisable.
- La dictée dépend du clavier et de l'appareil. L'enregistrement audio spécifique aux entretiens n'est pas intégré ; l'import d'un fichier audio reste possible. Les notes vocales du module terrain existant demeurent disponibles.
- Les divergences explicites sont signalées pour examen humain ; le logiciel n'établit pas la véracité d'un témoignage et ne décide pas de la conformité réglementaire d'un dossier PTPF ou PRSE.
- Aucune synchronisation distante n'est ajoutée. Les transferts entre appareils et les copies indépendantes passent par l'archive complète.

## Publication

La livraison conserve le mécanisme GitHub Pages du dépôt. Avant publication, la liste des ressources du service worker doit être régénérée avec `node tools/prepare-release.mjs`, puis les contrôles ci-dessus doivent rester satisfaisants. Le workflow Pages vérifie les tests et la syntaxe de tous les modules avant de publier `dist/`. Les données locales ne font pas partie du déploiement.
