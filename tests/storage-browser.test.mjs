import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getChromium, launchOptions } = require('./browser-runtime.cjs');

test('real IndexedDB commits, reloads, atomic rollback and loss-preserving restore', { skip: process.env.TETY_BROWSER_TESTS !== '1' }, async () => {
  const chromium = getChromium();
  const source = await readFile(new URL('../dist/storage.mjs', import.meta.url));
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/storage.mjs' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/storage.mjs' ? source : '<!doctype html><title>Tety storage verification</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch(launchOptions());
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result = await page.evaluate(async () => {
      const store = await import('/storage.mjs');
      const db = await store.openStore();
      const originalTransaction = db.transaction.bind(db);
      let complete = false;
      db.transaction = (...args) => {
        const tx = originalTransaction(...args);
        if (args[1] === 'readwrite') tx.addEventListener('complete', () => { complete = true; });
        return tx;
      };
      await store.put('missions', { id: 'm', title: 'Première mission' });
      complete = false;
      const saved = await store.saveObservation({ id: 'o', missionId: 'm', lat: null, lng: null, assetIds: [], notes: 'Donnée initiale' }, [{ id: 'a', blob: new Blob(['photo terrain'], { type: 'image/jpeg' }), name: 'terrain.jpg', kind: 'photo' }]);
      if (!complete) throw Error('Promise resolved before transaction commit');
      const archiveText = await (await store.exportArchive()).text();
      // Deliberately fail after an asset write has been scheduled. Both records
      // must roll back together and callers must receive a rejected Promise.
      db.transaction = (...args) => {
        const tx = originalTransaction(...args);
        if (args[1] === 'readwrite') {
          const objectStore = tx.objectStore.bind(tx);
          tx.objectStore = name => {
            const collection = objectStore(name);
            if (name === 'observations') collection.put = () => { tx.abort(); throw new DOMException('forced abort', 'AbortError'); };
            return collection;
          };
        }
        return tx;
      };
      let rollbackRejected = false;
      try { await store.saveObservation({ id: 'rolled-back', assetIds: [] }, [{ id: 'rolled-back-file', blob: new Blob(['must not remain']), type: 'text/plain' }]); }
      catch { rollbackRejected = true; }
      db.transaction = originalTransaction;
      if (!rollbackRejected || await store.get('observations', 'rolled-back') || await store.get('assets', 'rolled-back-file')) throw Error('Atomic rollback failed');
      await store.saveObservation({ ...saved, notes: 'Modification locale' });
      const restored = await store.importArchive(new Blob([archiveText], { type: 'application/json' }));
      const observations = await store.readAll('observations');
      if (observations.length !== 2 || new Set(observations.map(item => item.notes)).size !== 2) throw Error('Restore overwrote local data');
      let protectedAsset = false;
      try { await store.remove('assets', 'a'); } catch (cause) { protectedAsset = cause.code === 'REFERENCE_IN_USE'; }
      return { complete, rollbackRejected, restored, protectedAsset, count: observations.length };
    });
    assert.equal(result.rollbackRejected, true);
    assert.equal(result.protectedAsset, true);
    assert.equal(result.restored.conflicts, 1);
    assert.equal(result.count, 2);
    await page.reload();
    assert.equal(await page.evaluate(async () => (await (await import('/storage.mjs')).readAll('observations')).length), 2);
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
