import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://ikonosfera.test';

function createWorker({ cacheMatch = async () => null, cacheOpen = async () => ({ put: async () => {} }), fetchImpl = async () => new Response('atlas') } = {}) {
  const listeners = new Map();
  const self = {
    location: new URL(ORIGIN),
    clients: { claim: async () => {} },
    skipWaiting: () => Promise.resolve(),
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const caches = {
    match: cacheMatch,
    open: cacheOpen,
    keys: async () => [],
    delete: async () => true,
  };
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise }, { filename: 'public/sw.js' });
  return listeners;
}

function request(path, { method = 'GET', mode = 'cors', origin = ORIGIN } = {}) {
  return { url: new URL(path, origin).href, method, mode };
}

async function dispatchFetch(listeners, req) {
  let responsePromise;
  listeners.get('fetch')({ request: req, respondWith(value) { responsePromise = Promise.resolve(value); } });
  return responsePromise;
}

test('public emoji atlas still loads when Cache API lookup throws', async () => {
  let networkCalls = 0;
  const listeners = createWorker({
    cacheMatch: async () => { throw new Error('QuotaExceededError'); },
    fetchImpl: async () => { networkCalls++; return new Response('network-atlas', { status: 200 }); },
  });
  const response = await dispatchFetch(listeners, request('/status-emojis.webp?v=2'));
  assert.equal(await response.text(), 'network-atlas');
  assert.equal(networkCalls, 1);
});

test('public emoji atlas response is returned even when cache open or write fails', async () => {
  let networkCalls = 0;
  const listeners = createWorker({
    cacheMatch: async () => null,
    cacheOpen: async () => ({ put: async () => { throw new Error('QuotaExceededError'); } }),
    fetchImpl: async () => { networkCalls++; return new Response('network-atlas', { status: 200 }); },
  });
  const response = await dispatchFetch(listeners, request('/status-emojis.webp?v=2'));
  assert.equal(await response.text(), 'network-atlas');
  assert.equal(networkCalls, 1);
});

test('a cache hit is used without a network request', async () => {
  let networkCalls = 0;
  const cached = new Response('cached-atlas', { status: 200 });
  const listeners = createWorker({
    cacheMatch: async () => cached,
    fetchImpl: async () => { networkCalls++; return new Response('network-atlas'); },
  });
  const response = await dispatchFetch(listeners, request('/status-emojis.webp?v=2'));
  assert.equal(await response.text(), 'cached-atlas');
  assert.equal(networkCalls, 0);
});

test('failed network response is not cached', async () => {
  let puts = 0;
  const listeners = createWorker({
    cacheMatch: async () => null,
    cacheOpen: async () => ({ put: async () => { puts++; } }),
    fetchImpl: async () => new Response('not found', { status: 404 }),
  });
  const response = await dispatchFetch(listeners, request('/status-emojis.webp?v=2'));
  assert.equal(response.status, 404);
  assert.equal(puts, 0);
});

test('private API requests are never intercepted or cached by the service worker', async () => {
  let networkCalls = 0;
  const listeners = createWorker({
    cacheMatch: async () => { throw new Error('should not read cache'); },
    cacheOpen: async () => { throw new Error('should not open cache'); },
    fetchImpl: async () => { networkCalls++; return new Response('private'); },
  });
  const response = await dispatchFetch(listeners, request('/rest/v1/messages?select=*'));
  assert.equal(response, undefined);
  assert.equal(networkCalls, 0);
});

test('non-GET and cross-origin requests remain untouched', async () => {
  const listeners = createWorker();
  assert.equal(await dispatchFetch(listeners, request('/status-emojis.webp', { method: 'POST' })), undefined);
  assert.equal(await dispatchFetch(listeners, request('/status-emojis.webp', { origin: 'https://cdn.example' })), undefined);
});
