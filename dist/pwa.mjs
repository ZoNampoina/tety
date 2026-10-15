/** Wait for this registration, even when an older root worker already controls the page. */
export function waitForActiveWorker(registration, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const watched = new Set();
    const finish = (worker, cause) => {
      clearTimeout(timer);
      registration.removeEventListener('updatefound', inspect);
      for (const candidate of watched) candidate.removeEventListener('statechange', inspect);
      if (cause) reject(cause); else resolve(worker);
    };
    const inspect = () => {
      if (registration.active?.state === 'activated') return finish(registration.active);
      for (const candidate of [registration.installing, registration.waiting, registration.active]) {
        if (candidate && !watched.has(candidate)) {
          watched.add(candidate);
          candidate.addEventListener('statechange', inspect);
        }
      }
      if (watched.size && [...watched].every(candidate => candidate.state === 'redundant')) {
        finish(null, new Error('Le service hors ligne de Tety n’a pas pu être installé.'));
      }
    };
    const timer = setTimeout(() => finish(null, new Error('Le service hors ligne de Tety n’a pas été activé à temps.')), timeoutMs);
    registration.addEventListener('updatefound', inspect);
    inspect();
  });
}

export async function registerOfflineWorker(base, { serviceWorkers = navigator.serviceWorker, timeoutMs = 20000 } = {}) {
  const registration = await serviceWorkers.register(new URL('sw.js', base).href, {
    scope: base.pathname,
    updateViaCache: 'none'
  });
  const worker = await waitForActiveWorker(registration, timeoutMs);
  return { registration, worker };
}
