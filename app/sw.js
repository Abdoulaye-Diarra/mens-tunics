/* Service worker minimal : uniquement pour permettre l'installation sur l'écran
   d'accueil (icône + fenêtre autonome). Aucune mise en cache volontaire, pour
   ne jamais servir une version périmée de l'application : chaque requête part
   normalement sur le réseau. */
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });
