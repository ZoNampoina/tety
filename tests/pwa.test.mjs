import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { registerOfflineWorker, waitForActiveWorker } from '../dist/pwa.mjs';

test('Tety has a permanent origin-relative identity distinct from the shared root', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
  const manifestURL = new URL('https://zonampoina.github.io/tety/manifest.webmanifest');
  const startURL = new URL(manifest.start_url, manifestURL);
  // The manifest specification resolves id against start_url's origin, not its directory.
  assert.equal(new URL(manifest.id, startURL.origin + '/').pathname, '/tety/');
  assert.equal(startURL.pathname, '/tety/');
  assert.equal(new URL(manifest.scope, manifestURL).pathname, '/tety/');
});

class Worker extends EventTarget {
  constructor(state) { super(); this.state = state; }
  transition(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class Registration extends EventTarget {
  constructor(worker) { super(); this.installing = worker; this.active = null; this.waiting = null; }
}

test('registration stays in Tety and waits for its worker despite an already-ready root worker', async () => {
  const worker = new Worker('installing');
  const registration = new Registration(worker);
  let called;
  const serviceWorkers = {
    get ready() { throw new Error('The shared root registration must never be used'); },
    async register(url, options) { called = { url, options }; return registration; }
  };
  let resolved = false;
  const pending = registerOfflineWorker(new URL('https://zonampoina.github.io/tety/'), { serviceWorkers });
  pending.then(() => { resolved = true; });
  await Promise.resolve();
  assert.deepEqual(called, { url: 'https://zonampoina.github.io/tety/sw.js', options: { scope: '/tety/', updateViaCache: 'none' } });
  assert.equal(resolved, false);
  registration.installing = null;
  registration.active = worker;
  worker.transition('activated');
  const result = await pending;
  assert.equal(result.registration, registration);
  assert.equal(result.worker, worker);
});

test('failed or stalled installation reports an error instead of waiting indefinitely', async () => {
  const worker = new Worker('installing');
  const registration = new Registration(worker);
  const failed = waitForActiveWorker(registration);
  worker.transition('redundant');
  await assert.rejects(failed, /pas pu être installé/);
  await assert.rejects(waitForActiveWorker(new Registration(null), 5), /activé à temps/);
});

async function workerHarness() {
  const source = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
  const cacheName = source.match(/const CACHE='([^']+)'/)[1];
  const handlers = new Map();
  const collections = new Map([
    [cacheName, new Map([['./index.html', { app: 'Tety' }]])],
    ['tety-shell-previous', new Map()],
    ['soratro-cache-foreign', new Map([['composition', 'preserved']])],
    ['unrelated-backup', new Map([['personal', 'preserved']])]
  ]);
  const network = [];
  const deleted = [];
  const caches = {
    async keys() { return [...collections.keys()]; },
    async delete(name) { deleted.push(name); return collections.delete(name); },
    async open(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      return { async match(key) { return collections.get(name).get(key); } };
    }
  };
  runInNewContext(source, {
    URL, caches,
    fetch: async request => { network.push(request); return { network: true }; },
    self: {
      location: new URL('https://zonampoina.github.io/tety/sw.js'),
      addEventListener(name, handler) { handlers.set(name, handler); },
      clients: { async claim() {} }
    }
  });
  return { handlers, collections, deleted, network, cacheName };
}

test('worker activation only removes obsolete Tety shell caches', async () => {
  const harness = await workerHarness();
  let pending;
  harness.handlers.get('activate')({ waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual(harness.deleted, ['tety-shell-previous']);
  assert.ok(harness.collections.has(harness.cacheName));
  assert.equal(harness.collections.get('soratro-cache-foreign').get('composition'), 'preserved');
  assert.equal(harness.collections.get('unrelated-backup').get('personal'), 'preserved');
});

test('worker serves Tety offline and never intercepts sibling or root navigations', async () => {
  const harness = await workerHarness();
  const fetchEvent = pathname => {
    let response;
    harness.handlers.get('fetch')({
      request: { url: new URL(pathname, 'https://zonampoina.github.io').href, method: 'GET', mode: 'navigate' },
      respondWith(value) { response = value; }
    });
    return response;
  };
  assert.equal((await fetchEvent('/tety/')).app, 'Tety');
  assert.equal((await fetchEvent('/tety/index.html')).app, 'Tety');
  for (const path of ['/soratro/', '/', '/tety-other/', '/tety', 'https://example.com/tety/']) {
    assert.equal(fetchEvent(path), undefined, path);
  }
  assert.deepEqual(harness.network, []);
});
