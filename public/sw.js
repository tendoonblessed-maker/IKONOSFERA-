/* Stage 0 app-shell-only offline fallback. Never cache private chat content. */
const CACHE_NAME = "ikonosfera-shell-v6";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon-192.png", "/status-emojis.webp?v=2"];
const PRECACHE_TIMEOUT_MS = 8000;
const CACHE_WRITE_TIMEOUT_MS = 1000;

async function addPrecacheAsset(cache, asset) {
  let timeoutId;
  try {
    // Cache.add() has no AbortSignal option. Bound its wait so a stalled
    // mobile network cannot keep the entire Service Worker install pending.
    await Promise.race([
      cache.add(asset),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Precache timed out")), PRECACHE_TIMEOUT_MS);
      })
    ]);
  } catch {
    // Precache entries are independent and optional; online navigation works.
    // The offline fallback is available only when OFFLINE_URL was cached.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Cache Storage is an optional enhancement. A missing icon/atlas or a
    // private-mode/quota error must not prevent the worker from installing.
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
    } catch {
      return;
    }
    await Promise.all(PRECACHE_URLS.map(asset => addPrecacheAsset(cache, asset)));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Keep the previous cache until this version has its own offline shell.
    // A failed/timed-out precache must not remove the last working fallback.
    let currentShellReady = false;
    try {
      const currentCache = await caches.open(CACHE_NAME);
      currentShellReady = Boolean(await currentCache.match(OFFLINE_URL));
    } catch {
      // Without proof of a replacement shell, preserve all previous caches.
    }

    if (currentShellReady) {
      // Cache Storage is optional. Cleanup is best-effort and must not prevent
      // the worker from claiming clients when an old cache cannot be removed.
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("ikonosfera-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name).catch(() => false))
        );
      } catch {
        // Skip cache cleanup; it is not required to serve the app online.
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/status-emojis.webp") {
    // The single 144KB corrected atlas loads from the local cache after installation.
    // This cache contains only public artwork, never user/profile/chat data.
    // Cache Storage is optional: a slow or denied write must not delay the
    // network response that makes the public atlas visible on mobile.
    const responseSource = caches.match(request).catch(() => undefined).then(cached => {
      if (cached) return { response: cached, fromCache: true };
      return fetch(request).then(response => ({ response, fromCache: false }));
    });

    event.respondWith(responseSource.then(({ response }) => response));
    // Keep the worker alive briefly for an optional cache write, but do not
    // make the page wait for Cache Storage. A stalled write is abandoned after
    // one second; the already-fetched response is still returned immediately.
    event.waitUntil(responseSource.then(async ({ response, fromCache }) => {
      if (fromCache || !response.ok) return;
      let timeoutId;
      try {
        await Promise.race([
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())),
          new Promise(resolve => {
            timeoutId = setTimeout(resolve, CACHE_WRITE_TIMEOUT_MS);
          })
        ]);
      } catch {
        // The network response remains usable when caching is denied.
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
    }).catch(() => {}));
    return;
  }
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).then(async response => {
    // A gateway/service outage can return an HTTP response instead of rejecting
    // fetch(). Use the cached offline shell for transient gateway failures, but
    // preserve application errors (for example HTTP 500) for diagnosis.
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      try {
        return (await caches.match(OFFLINE_URL)) ?? response;
      } catch {
        return response;
      }
    }
    return response;
  }).catch(async () => {
    try {
      return (await caches.match(OFFLINE_URL)) ?? Response.error();
    } catch {
      return Response.error();
    }
  }));
});
