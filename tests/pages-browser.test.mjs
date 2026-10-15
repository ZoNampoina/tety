import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname } from 'node:path';

const require = createRequire(import.meta.url);
const { getChromium, launchOptions } = require('./browser-runtime.cjs');

test('GitHub Pages project path keeps app, manifest, worker and offline data under /tety/', { skip: process.env.TETY_BROWSER_TESTS !== '1' }, async () => {
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/tety/')) {
      response.writeHead(404).end();
      return;
    }
    const name = pathname.slice('/tety/'.length) || 'index.html';
    if (name.includes('..')) {
      response.writeHead(400).end();
      return;
    }
    try {
      const data = await readFile(new URL(`../dist/${name}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': types[extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await getChromium().launch(launchOptions());
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}/tety/`;
    await page.goto(base);
    await page.getByText('Vos périmètres', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.notice')?.textContent.includes('Application préparée hors ligne'));
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const ready = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const manifest = await (await fetch('./manifest.webmanifest')).json();
      const manifestURL = new URL('./manifest.webmanifest', location.href);
      return {
        id: new URL(manifest.id, new URL(manifest.start_url, manifestURL).origin + '/').pathname,
        scope: new URL(registration.scope).pathname,
        worker: new URL(registration.active.scriptURL).pathname,
        start: new URL(manifest.start_url, manifestURL).pathname,
        manifestScope: new URL(manifest.scope, manifestURL).pathname,
        count: (await (await fetch('./permits.json')).json()).length
      };
    });
    assert.deepEqual(ready, { id: '/tety/', scope: '/tety/', worker: '/tety/sw.js', start: '/tety/', manifestScope: '/tety/', count: 4 });
    await context.setOffline(true);
    await page.reload();
    await page.getByText('Vos périmètres', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Nouveau point/ }).first().click();
    await page.getByRole('textbox', { name: 'Titre de l’observation' }).fill('Essai GitHub Pages hors ligne');
    await page.getByRole('button', { name: 'Enregistrer le point', exact: true }).click();
    await page.getByRole('heading', { name: 'Observations', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Observations', exact: true }).waitFor();
    assert.ok(await page.getByText('Essai GitHub Pages hors ligne', { exact: true }).count());
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
