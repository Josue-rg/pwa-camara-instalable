'use strict';

const NOMBRE_CACHE = 'pwa-camara-instalable-v1';

const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(NOMBRE_CACHE)
      .then(function (cache) {
        return cache.addAll(ARCHIVOS_CACHE);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(
          claves
            .filter(function (clave) {
              return clave !== NOMBRE_CACHE;
            })
            .map(function (clave) {
              return caches.delete(clave);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function (respuestaCacheada) {
        if (respuestaCacheada) {
          return respuestaCacheada;
        }

        return fetch(event.request)
          .then(function (respuestaRed) {
            if (!respuestaRed || respuestaRed.status !== 200 || respuestaRed.type === 'opaque') {
              return respuestaRed;
            }

            const copia = respuestaRed.clone();
            return caches.open(NOMBRE_CACHE)
              .then(function (cache) {
                return cache.put(event.request, copia);
              })
              .then(function () {
                return respuestaRed;
              })
              .catch(function () {
                return respuestaRed;
              });
          });
      })
  );
});
