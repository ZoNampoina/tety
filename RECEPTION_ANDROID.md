# Réception Android de Tety

Ce guide décrit les vérifications à réaliser sur un téléphone physique avant une descente. Il ne constitue pas un compte rendu de tests réussis. Les vérifications sur ordinateur ou dans un navigateur automatisé ne valident pas les interruptions, les permissions, la caméra et le partage propres à Android.

## Préparer la réception

- Utiliser une adresse HTTPS stable et Chrome Android à jour. Le serveur local d'un ordinateur sert à la démonstration sur cet ordinateur ; une adresse HTTP du réseau local ne donne pas les mêmes permissions Android.
- Noter le modèle du téléphone, la version Android, la version Chrome et l'adresse de Tety.
- Installer Tety depuis Chrome et attendre l'indication de préparation hors ligne.
- Créer une mission de réception distincte des observations de terrain, avec un titre reconnaissable et des données d'essai clairement identifiées.
- Exporter une archive de référence et vérifier que le fichier figure réellement dans l'emplacement choisi. Une feuille de partage ouverte n'est pas une preuve de sauvegarde.

## Vérifications indispensables avant le départ

| Essai | Manipulation sur Android | Résultat à constater |
| --- | --- | --- |
| Installation | Installer depuis Chrome, fermer Chrome, lancer depuis l'icône | Tety s'ouvre en application autonome, avec les cinq destinations en bas de l'écran |
| Premier lancement hors ligne | Activer le mode avion, couper aussi le Wi-Fi, fermer puis relancer Tety | Accueil, permis, carte locale, missions et observations s'ouvrent sans chargement distant |
| Point incomplet | Saisir uniquement un titre puis enregistrer | Le point apparaît et reste modifiable ; GPS, pièce jointe et questionnaire ne sont pas obligatoires |
| Brouillon | Saisir titre, notes et un champ du questionnaire ; revenir à l'accueil puis reprendre | Les valeurs exactes sont présentes, sans doublon involontaire |
| Plusieurs brouillons | Créer deux brouillons différents puis reprendre chacun | Les deux restent accessibles ; reprendre le second ne masque pas définitivement le premier |
| Latitude seule | Saisir une latitude, quitter puis reprendre avant de saisir la longitude | Le formulaire reste utilisable et demande de compléter la paire ; aucune page blanche |
| Retour Android | Utiliser Retour depuis un formulaire, une fiche et une fenêtre, puis revenir | La navigation est cohérente et le texte saisi reste disponible |
| Clavier tactile | Saisir une longue note et des coordonnées en portrait puis paysage | Aucun champ ni bouton nécessaire n'est inaccessible ; le clavier ne masque pas durablement Enregistrer |
| Écran verrouillé | Pendant la saisie, verrouiller puis déverrouiller après une minute | Le brouillon conserve le dernier texte dont l'enregistrement a été confirmé |
| Arrêt de l'application | Après confirmation d'enregistrement, fermer Tety depuis les applications récentes puis relancer | Observations, brouillons et pièces jointes restent présents |
| Redémarrage | Redémarrer le téléphone en mode avion puis rouvrir | Le carnet déjà enregistré et la coque de l'application restent disponibles |
| GPS autorisé | À l'extérieur, autoriser la position et relever un point en mode avion | Latitude, longitude et précision sont affichées ; la proposition AERP est présentée comme indicative et à confirmer |
| GPS refusé ou absent | Refuser la permission, puis essayer à l'intérieur | Message compréhensible, possibilité de réessayer et saisie manuelle toujours disponible |
| Photo | Prendre une photographie depuis Tety puis reprendre le formulaire | Photo visible et conservée après enregistrement, fermeture et réouverture |
| Import | Importer deux images, un PDF et un fichier audio en mode avion | Les pièces apparaissent, s'ouvrent et restent attachées au bon point |
| Note vocale | Enregistrer 20 secondes, arrêter, écouter puis relancer Tety | Audio audible, correctement rattaché et conservé |
| Interruption vocale | Pendant une note, changer d'application puis verrouiller ; revenir ensuite | Tety indique l'arrêt ; les segments déjà stockés sont récupérables, sans affecter un autre brouillon |
| Permission micro | Refuser le micro puis autoriser et recommencer | Aucun état bloqué ; l'import d'un audio reste possible |
| Export sans réseau | Exporter une archive depuis Tety en mode avion | Le fichier JSON est récupérable dans un autre emplacement ou appareil et contient les médias |
| Partage annulé | Annuler la feuille de partage | La date de dernière sauvegarde n'est pas avancée comme si un fichier avait été conservé |
| Transfert PC | Importer l'archive Android dans Tety sur PC, puis exporter/importer en sens inverse | Titres, coordonnées, questionnaires, missions et médias correspondent exactement |
| Conflit | Modifier un même point sur Android et PC avant réimport | Les deux versions sont conservées et accessibles ; aucune version locale n'est écrasée silencieusement |
| Archive endommagée | Importer une copie volontairement tronquée ou un média dont le contrôle est modifié | Import refusé avant modification du carnet ; données locales intactes |
| Stockage insuffisant | Tester sur un appareil ou profil de réception à faible espace disponible | Échec signalé, aucune fausse confirmation, données déjà enregistrées conservées et possibilité d'export |
| Lisibilité | Consulter en plein soleil en clair, sombre et texte agrandi | Textes, précision GPS, boutons et avertissements sont lisibles ; gestes utilisables d'une main |
| Mise à jour | Avec un brouillon et des médias, appliquer une mise à jour puis passer en mode avion | Aucun mélange de versions, brouillon conservé et application encore ouvrable hors ligne |

## Contrôles des permis et de la carte

- Comparer les quatre identifiants, titulaires, localisations, dates et nombres de carrés avec les sources conservées du carnet. Le CSV corrigé du 42278 doit compter 96 carrés.
- Vérifier l'échéance affichée du 42278 au 19 octobre 2026. Le compteur dépend de la date du téléphone ; ce compteur ne confirme pas le statut administratif actuel.
- Un point situé hors des carrés ne doit pas recevoir une certitude juridique. Plusieurs candidats doivent nécessiter un choix de l'équipe.
- Lors d'un import de géométrie de réception comportant un trou, celui-ci doit rester visuellement vide. Ce jeu d'essai ne doit pas être présenté comme un permis réel.
- La carte locale représente les périmètres et les observations. Elle ne fournit pas de pistes, de villages, d'itinéraires ni de sécurité de traversée.

## Trace de réception

Pour chaque essai, consigner : date, appareil, version, résultat obtenu, résultat attendu, anomalie et décision. Joindre, si utile, une capture d'écran et une archive de la mission de réception. Marquer chaque ligne « réussi », « échoué » ou « non testé » ; ne pas transformer un essai non effectué en validation.

Avant la descente, la séquence minimale est : ouverture en mode avion, brouillon interrompu, photo, note vocale, fermeture/réouverture, export et restauration sur l'autre appareil. Une anomalie de conservation de données dans cette séquence doit être corrigée avant utilisation opérationnelle.

## Limites à garder dans la réception

Le stockage navigateur peut être effacé par l'utilisateur, le système ou une politique de l'appareil. Une archive indépendante reste nécessaire. Les archives sont des fichiers JSON non chiffrés, avec les médias encodés ; le format impose 25 Mio par pièce et 100 Mio par archive. Les dernières données encore en cours d'écriture au moment d'un arrêt brutal peuvent ne pas avoir été validées. La disponibilité des permissions, le GPS sans réseau et la gestion d'énergie varient selon le téléphone : ils doivent être constatés sur l'appareil de mission.

## Réception des fonctions V2

- Essayer Plan, Relief, Satellite (année 2000) et Local hors ligne ; préparer un seul AERP puis couper le réseau et rouvrir la carte.
- Zoomer au pincement, déplacer, sélectionner un permis et une observation, vérifier le cercle de précision GPS ; démarrer, mettre en pause et terminer une trace, puis exporter GPX.
- Remplir chaque modèle, changer de modèle et vérifier que les champs restent conservés ; tester un code d’échantillon déjà utilisé.
- Légender et annoter une photo ; retrouver l’original et la version annotée après fermeture puis après transfert d’archive.
- Cocher rapidement plusieurs éléments de checklist, ajouter un élément, puis rouvrir la mission.
- Vérifier le bilan local de journée et ouvrir son DOCX dans Word ou une application compatible.

