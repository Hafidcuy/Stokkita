/* Stokita Service Worker
   - Meng-cache "app shell" supaya aplikasi bisa dibuka offline.
   - HTML/JS/CSS selalu diambil dari jaringan lebih dulu (network-first)
     supaya update GitHub Pages langsung terpakai; offline fallback ke cache.
   - Aset statis (ikon, gambar, manifest) memakai stale-while-revalidate.
   - Request lintas origin (Supabase, Google Fonts) dibiarkan langsung. */

const VERSION = "v1";
const CACHE = "stokita-cache-" + VERSION;

const PRECACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./lucide.js",
  "./supabase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            fetch(url, { cache: "reload" })
              .then((res) => {
                if (res && res.ok) return cache.put(url, res);
              })
              .catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & Google Fonts lewat langsung

  const isCore =
    req.mode === "navigate" ||
    req.destination === "script" ||
    req.destination === "style";

  if (isCore) {
    // Network-first: konten selalu terbaru saat online, cache saat offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          if (req.mode === "navigate") {
            const shell =
              (await caches.match("./index.html")) || (await caches.match("./"));
            if (shell) return shell;
          }
          return Response.error();
        })
    );
    return;
  }

  // Stale-while-revalidate untuk ikon/gambar/manifest.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
