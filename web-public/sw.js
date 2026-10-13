// Sojourner's service worker (the web build only). tools/vite-web-pwa.ts
// writes the two lines above this into dist-web/sw.js: __VERSION__ (changes
// whenever any file does) and __PRECACHE__ ([{url, revision}]).
//
// What it does, and no more:
//  - keeps the app's own files, so Sojourner opens with no network;
//  - serves them from there first;
//  - waits for the reader before replacing itself ("A new version is ready"),
//    because a page and a backend of different versions must not mix;
//  - never touches another origin. The books are read from
//    data.gentleking.org by the backend's own cache (src/web/), and a
//    service worker in between would only get in the way of its Range reads.

const APP = `sojourner-app-${self.__VERSION__}`;
const RUNTIME = "sojourner-runtime";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP);
      // `reload` so a stale HTTP cache cannot hand over an old file under a
      // new version's name.
      await Promise.all(
        self.__PRECACHE__.map(async ({ url }) => {
          const response = await fetch(new Request(url, { cache: "reload" }));
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          await cache.put(url, response);
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("sojourner-app-") && name !== APP) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const app = await caches.open(APP);
      // The app is a hash-routed single page: every navigation is "/".
      // `ignoreVary`: a server that answers `Vary: Origin` (vite preview)
      // would otherwise keep a module import, which sends an Origin, from
      // matching the file kept without one. Every file here has its own name.
      const kept = await app.match(request.mode === "navigate" ? "/" : request, { ignoreSearch: request.mode === "navigate", ignoreVary: true });
      if (kept) return kept;

      // The Atlas's data and other files fetched on demand: kept as read
      // (and refreshed in the background).
      const runtime = await caches.open(RUNTIME);
      const seen = await runtime.match(request, { ignoreVary: true });
      const fetching = fetch(request).then((response) => {
        if (response.ok) runtime.put(request, response.clone());
        return response;
      });
      if (seen) {
        fetching.catch(() => {});
        return seen;
      }
      return fetching;
    })(),
  );
});
