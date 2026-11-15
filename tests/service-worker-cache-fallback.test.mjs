import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://ikonosfera.test';

function createWorker({
  cacheMatch = async () => null,
  cacheOpen = async () => ({ put: async () => {}, addAll: async () => {} }),
  cacheKeys = async () => [],
  cacheDelete = async () => true,
  clientsClaim = async () => {},
  skipWaiting = async () => {},
  fetchImpl = async () => new Response('atlas'),
} = {}) {
  const listeners = new Map();
  const self = {
    location: new URL(ORIGIN),
    clients: { claim: clientsClaim },
    skipWaiting,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const caches = {
    match: cacheMatch,
    open: cacheOpen,
    keys: cacheKeys,
    delete: cacheDelete,
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

async function dispatchLifecycle(listeners, type) {
  let lifetimePromise;
  listeners.get(type)({ waitUntil(value) { lifetimePromise = Promise.resolve(value); } });
  assert.ok(lifetimePromise, `${type} should register a lifetime promise`);
  await lifetimePromise;
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

test('public emoji atlas response is returned even when cache write fails', async () => {
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

test('public emoji atlas response is returned even when opening the cache fails', async () => {
  let networkCalls = 0;
  const listeners = createWorker({
    cacheMatch: async () => null,
    cacheOpen: async () => { throw new Error('QuotaExceededError'); },
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

test('worker installation succeeds when Cache Storage cannot be opened', async () => {
  let skipWaitingCalls = 0;
  const listeners = createWorker({
    cacheOpen: async () => { throw new Error('SecurityError'); },
    skipWaiting: async () => { skipWaitingCalls++; },
  });
  await dispatchLifecycle(listeners, 'install');
  assert.equal(skipWaitingCalls, 1);
});

test('worker installation succeeds when pre-caching fails', async () => {
  let skipWaitingCalls = 0;
  const listeners = createWorker({
    cacheOpen: async () => ({ addAll: async () => { throw new Error('QuotaExceededError'); } }),
    skipWaiting: async () => { skipWaitingCalls++; },
  });
  await dispatchLifecycle(listeners, 'install');
  assert.equal(skipWaitingCalls, 1);
});

test('worker activation claims clients even when cache enumeration fails', async () => {
  let claimCalls = 0;
  const listeners = createWorker({
    cacheKeys: async () => { throw new Error('SecurityError'); },
    clientsClaim: async () => { claimCalls++; },
  });
  await dispatchLifecycle(listeners, 'activate');
  assert.equal(claimCalls, 1);
});

test('worker activation continues cleanup and claims clients when one cache delete fails', async () => {
  const deleted = [];
  let claimCalls = 0;
  const listeners = createWorker({
    cacheKeys: async () => ['ikonosfera-shell-v4', 'ikonosfera-shell-v5', 'unrelated-cache'],
    cacheDelete: async (name) => {
      deleted.push(name);
      if (name === 'ikonosfera-shell-v4') throw new Error('QuotaExceededError');
      return true;
    },
    clientsClaim: async () => { claimCalls++; },
  });
  await dispatchLifecycle(listeners, 'activate');
  assert.deepEqual(deleted.sort(), ['ikonosfera-shell-v4', 'ikonosfera-shell-v5']);
  assert.equal(claimCalls, 1);
});

test('offline navigation returns Response.error when both network and cache fallback fail', async () => {
  const listeners = createWorker({
    fetchImpl: async () => { throw new TypeError('offline'); },
    cacheMatch: async () => { throw new Error('SecurityError'); },
  });
  const response = await dispatchFetch(listeners, request('/chat', { mode: 'navigate' }));
  assert.equal(response.type, 'error');
  assert.equal(response.status, 0);
});
