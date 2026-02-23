"use strict";

const SW_VERSION = "v14";
const ASSET_CACHE = `auth-assets-${SW_VERSION}`;
const OFFLINE_FALLBACK_URL = "/offline.html";
const PRECACHE_ASSETS = [
  OFFLINE_FALLBACK_URL,
  "/manifest.webmanifest",
  "/images/icon-192.png",
  "/images/icon-512.png",
  "/images/favicon-32.png",
  "/images/favicon-16.png",
  "/images/off.svg",
];

const STATIC_FILE_PATTERN = /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      await cache.addAll(PRECACHE_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("auth-assets-") && name !== ASSET_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/admin/api/")) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  if (url.pathname === "/health") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(
        () =>
          new Response(JSON.stringify({ status: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  const isAssetRequest =
    ["style", "script", "image", "font", "worker"].includes(request.destination) ||
    STATIC_FILE_PATTERN.test(url.pathname);

  if (!isAssetRequest) return;

  event.respondWith(staleWhileRevalidate(request));
});

async function handleNavigationRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(ASSET_CACHE);
    const offlineResponse = await cache.match(OFFLINE_FALLBACK_URL);
    if (offlineResponse) return offlineResponse;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkFetch.catch(() => null);
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  return new Response("Offline", { status: 503, statusText: "Offline" });
}
