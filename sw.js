'use strict';

// ============================================================
// sw.js — FLUJO C (cache del shell, C1-C3)
// Corre en segundo plano. Su trabajo es que la app abra sin red
// y que los archivos del mismo origen se guarden al vuelo.
// ============================================================

// El nombre es la versión: al cambiarlo, ACTIVATE borra el cache viejo.
const NOMBRE_CACHE = 'pwa-camara-instalable-v1';

// El "shell": lo mínimo para abrir la app sin conexión (C1).
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// C1. INSTALL: descarga y guarda el shell. skipWaiting lo activa ya.
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

// C2. ACTIVATE: borra caches de otras versiones y toma el control
// de las pestañas abiertas (clients.claim).
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

// C3. FETCH: cache-first para GET del mismo origen. Si no está en
// cache, va a la red y guarda una copia para la próxima.
self.addEventListener('fetch', function (event) {
  // C3. Solo GET: la cámara no pasa por fetch y los POST no se tocan.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  // C3. Solo archivos propios; lo externo va directo a la red.
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
            // C3. Solo se guarda una copia si la respuesta es válida.
            if (!respuestaRed || respuestaRed.status !== 200 || respuestaRed.type === 'opaque') {
              return respuestaRed;
            }

            // clone(): el body solo se puede leer una vez; una copia va
            // al cache y la otra se entrega a la página.
            const copia = respuestaRed.clone();
            return caches.open(NOMBRE_CACHE)
              .then(function (cache) {
                return cache.put(event.request, copia);
              })
              .then(function () {
                return respuestaRed;
              })
              .catch(function () {
                // C3. Si falla el guardado, igual se entrega la respuesta.
                return respuestaRed;
              });
          });
      })
  );
});
