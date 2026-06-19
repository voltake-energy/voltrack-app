// VoltTrack Service Worker
// Tujuan: (1) offline cache supaya app boleh dibuka tanpa internet
//         (2) terima request "tunjuk notifikasi" dari halaman utama (local notification)
// NOTA: Ini BUKAN push notification jarak jauh. Notifikasi hanya boleh
// dipaparkan bila app dibuka/aktif atau baru sahaja ditutup (background singkat).
// Untuk notifikasi sebenar walaupun app tertutup total, perlukan backend + Firebase Push (fasa akan datang).

const CACHE_NAME = 'volttrack-cache-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// --- INSTALL: simpan fail asas ke cache ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// --- ACTIVATE: buang cache versi lama ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- FETCH: cuba cache dulu, kalau tiada baru pergi network ---
self.addEventListener('fetch', (event) => {
  // CDN (Tailwind/Chart.js/FontAwesome) biar terus ke network - jangan cache
  const url = event.request.url;
  const isCDN = url.includes('cdn.tailwindcss.com') ||
                url.includes('cdn.jsdelivr.net') ||
                url.includes('cdnjs.cloudflare.com');

  if (isCDN) return; // biar browser handle terus

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // simpan copy baru ke cache untuk next time offline
        if (response && response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => cached); // kalau offline & tiada cache, gagal senyap
    })
  );
});

// --- MESSAGE: terima arahan dari halaman utama untuk papar notifikasi ---
// Halaman utama akan panggil: navigator.serviceWorker.controller.postMessage({...})
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, urgency } = data.payload || {};
    self.registration.showNotification(title || 'VoltTrack', {
      body: body || '',
      tag: tag || 'volttrack-notif',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: urgency === 'urgent' ? [200, 100, 200] : [100],
      requireInteraction: urgency === 'urgent',
      renotify: true,
    });
  }
});

// --- NOTIFICATION CLICK: bawa balik ke app bila notifikasi diklik ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      if (clientsArr.length > 0) {
        return clientsArr[0].focus();
      }
      return self.clients.openWindow('./index.html');
    })
  );
});
