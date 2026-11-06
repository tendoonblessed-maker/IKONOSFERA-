/* Stage 0 app-shell-only offline fallback. Never cache private chat content. */
const CACHE_NAME = "ikonosfera-shell-v6";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon-192.png", "/status-emojis.webp?v=2"];

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
    await Promise.all(PRECACHE_URLS.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch {
        // Precache entries are independent; online navigation still works.
        // The offline fallback is available only when OFFLINE_URL was cached.
      }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Keep activation usable when Cache Storage is denied by the browser.
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
    // Cache Storage is optional: quota/private-mode failures must not hide a
    // successfully downloaded public image from the messenger UI.
    event.respondWith(caches.match(request).catch(() => undefined).then(async cached => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch {
          // The network response remains usable even when caching is denied.
        }
      }
      return response;
    }));
    return;
  }
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(async () => {
    try {
      return (await caches.match(OFFLINE_URL)) ?? Response.error();
    } catch {
      return Response.error();
    }
  }));
});
