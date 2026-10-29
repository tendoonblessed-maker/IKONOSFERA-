/* Stage 0 app-shell-only offline fallback. Never cache private chat content. */
const CACHE_NAME = "ikonosfera-shell-v6";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png", "/status-emojis.webp?v=2"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name.startsWith("ikonosfera-") && name !== CACHE_NAME).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/status-emojis.webp?v=2") {
    // The single 144KB corrected atlas loads from the local cache after installation.
    // This cache contains only public artwork, never user/profile/chat data.
    event.respondWith(caches.match(request).then(cached =>
      cached ?? fetch(request).then(async response => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
    ));
    return;
  }
  if (request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(async () => {
    return (await caches.match(OFFLINE_URL)) ?? Response.error();
  }));
});
