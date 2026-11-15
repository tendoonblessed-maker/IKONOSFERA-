/* Stage 0 app-shell-only offline fallback. Never cache private chat content. */
const CACHE_NAME = "ikonosfera-shell-v6";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // Pre-caching is an offline enhancement, not a prerequisite for installing
    // the worker. Storage restrictions must not prevent the app from updating.
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([OFFLINE_URL, "/icon-192.png", "/status-emojis.webp?v=2"]);
    } catch {
      // The worker can still serve network requests without an offline cache.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Only retire previous app-shell versions. Other caches on this origin may
    // belong to independently deployed features and must remain untouched.
    try {
      const names = await caches.keys();
      const staleNames = names.filter((name) =>
        /^ikonosfera-shell-v\d+$/.test(name) && name !== CACHE_NAME
      );
      await Promise.all(staleNames.map(async (name) => {
        try {
          await caches.delete(name);
        } catch {
          // Continue cleaning other old shell caches and claim clients below.
        }
      }));
    } catch {
      // Cache enumeration may be unavailable in private/restricted contexts.
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
    event.respondWith((async () => {
      // Cache Storage is an optimization only. Safari private mode, quota
      // pressure, or a transient storage failure must not break the network
      // response for this public asset.
      let cached = null;
      try {
        cached = await caches.match(request);
      } catch {
        // Continue with the network when cache lookup is unavailable.
      }
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch {
          // Do not turn a successful public-asset response into a failed fetch.
        }
      }
      return response;
    })());
    return;
  }
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(async () => {
    try {
      // Only this app-shell cache may supply the offline document. A global
      // caches.match() could return a stale or unrelated same-origin entry.
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    } catch {
      return Response.error();
    }
  }));
});
