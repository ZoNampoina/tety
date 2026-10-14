# Vérifications

Les tests de géométrie et d'archives utilisent uniquement Node.js récent (22 ou supérieur). Depuis la racine du dépôt :

```sh
npm test
```

Les essais navigateur sont facultatifs et nécessitent Playwright avec Chromium :

```sh
npm install --no-save playwright
npx playwright install chromium
```

Puis, dans un terminal Bash :

```sh
TETY_BROWSER_TESTS=1 node --test tests/storage-browser.test.mjs tests/pages-browser.test.mjs
node tests/app-browser.cjs
node tests/audio-browser.cjs
```

Sous PowerShell, utiliser `$env:TETY_BROWSER_TESTS='1'` avant la commande Node. Le test Pages vérifie l'ouverture, le manifeste, la portée du service worker et l'enregistrement après rechargement hors ligne à une adresse contenant `/tety/`.

Un navigateur Chromium ou Edge déjà installé peut être utilisé en définissant `TETY_BROWSER_EXECUTABLE` à son chemin. Une installation existante du module Playwright peut être utilisée en définissant `TETY_PLAYWRIGHT_PATH` à son répertoire. Aucun chemin propre au poste de création n'est requis.

Les scripts `app-browser.cjs` et `audio-browser.cjs` produisent des captures et une archive de test dans le répertoire courant. Les utiliser depuis la racine du dépôt. Ils emploient un GPS et un microphone simulés ; la réception sur téléphone Android physique reste nécessaire.
