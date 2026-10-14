# Validation de la première livraison

Vérifications sur le poste de développement le 13 octobre 2026.

- 25 tests de géométrie, dates, CSV et validation d’archives réussis.
- Essai dans IndexedDB réel réussi : résolution après commit, annulation d’une transaction avec fichier et point, conflit restauré sans écrasement, persistance après réouverture et protection des pièces utilisées.
- Parcours navigateur réussi à 390 × 844, en paysage et sur PC : GPS simulé vers le 42278, photographie importée, brouillon repris après réouverture, point incomplet conservé, création et lecture hors ligne et rechargement hors ligne.
- Archive avec photographie transférée à un second navigateur préparé, importée et consultée hors connexion ; conflits conservés.
- MediaRecorder testé avec microphone synthétique : segments stockés pendant la note et note reconstruite après interruption par rechargement. Un essai ciblé et le parcours général ont réussi.
- Affichage clair et sombre et carte avec exclusion de la lacune du 42278 vérifiés visuellement.

Ces résultats concernent le navigateur automatisé Chromium/Edge du poste, pas un appareil Android physique. Installer sur le téléphone de mission et appliquer RECEPTION_ANDROID.md avant une descente. La caméra réelle, les permissions système, le GPS sans réseau, le bouton Retour Android, le verrouillage, le redémarrage et les éventuelles restrictions du constructeur restent à valider sur l’appareil.

Les dernières fractions de note audio ou de saisie non encore validées par le stockage peuvent être perdues en cas d’arrêt brutal. Une archive indépendante reste nécessaire.

## Livraison V2 — 14 octobre 2026

- 49 tests unitaires de données, archives, géométrie, OSM, modèles, bilan, photos et DOCX réussis.
- Carte testée dans un navigateur isolé : extraits OSM de test conservés dans IndexedDB et relus hors réseau ; précision GPS exposée par un getter, arrêt des suivis, pause et reprise de trace vérifiés.
- Interface locale essayée : échantillon fictif saisi puis relu, photo légendée et annotée avec original conservé, plusieurs coches rapides et élément personnalisé retrouvés, bilan et téléchargement DOCX depuis son bouton.
- DOCX contrôlé indépendamment (ZIP/XML/python-docx), rendu dans Word puis PDF ; quatre pages inspectées, tableaux et images sans coupure ni chevauchement.
- Mise à jour du service worker essayée en conservant une observation existante. Les nouvelles ressources locales et le moteur de carte sont inclus dans le cache versionné.

Les essais GPS automatisés et les jeux de données fictifs ne remplacent pas la réception sur un téléphone Android physique.

