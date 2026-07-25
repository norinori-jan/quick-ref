// quick-ref Service Worker v2
// - オフラインキャッシュ
// - Background Sync (iCloud Drive 保存キュー)
// - Periodic Background Sync (定期バックアップ通知)
// - Push通知
// - 通知クリックでアプリを開く

const CACHE_NAME = 'quick-ref-cache-v2';
const APP_SHELL = ['./', './index.html', './manifest.json'];

/* ------------------------------
   Install
------------------------------ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ------------------------------
   Activate
------------------------------ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* ------------------------------
   Fetch
------------------------------ */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 外部リソースはスキップ
  if (url.origin !== self.location.origin) return;

  // navigate は network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // assets は cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      });
    })
  );
});

/* ------------------------------
   Background Sync (iCloud Drive)
------------------------------ */
self.addEventListener('sync', (event) => {
  if (event.tag === 'icloud-backup') {
    event.waitUntil(syncToICloud());
  }
});

async function syncToICloud() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  clients.forEach((client) =>
    client.postMessage({ type: 'SW_SYNC_ICLOUD' })
  );
}

/* ------------------------------
   Periodic Background Sync
------------------------------ */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-backup-reminder') {
    event.waitUntil(showBackupReminder());
  }
});

async function showBackupReminder() {
  if (Notification.permission !== 'granted') return;

  await self.registration.showNotification('クイック参照 バックアップ', {
    body: '📦 今日のデータをiCloud Driveにバックアップしますか？',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'backup-reminder',
    actions: [
      { action: 'backup', title: '今すぐバックアップ' },
      { action: 'dismiss', title: '後で' },
    ],
    data: { action: 'backup' },
  });
}

/* ------------------------------
   Push通知
------------------------------ */
self.addEventListener('push', (event) => {
  let data = { title: '通知', body: '' };

  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    console.warn('[sw] push payload parse error:', e);
  }

  const options = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || './' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'クイック参照', options)
  );
});

/* ------------------------------
   通知クリック（Push通知用）
------------------------------ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

/* ------------------------------
   通知クリック（バックアップ通知用）
------------------------------ */
self.addEventListener('notificationclick', (event) => {
  if (event.action !== 'backup' && event.notification.data?.action !== 'backup') return;

  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
        clients[0].postMessage({ type: 'TRIGGER_ICLOUD_EXPORT' });
      } else {
        self.clients.openWindow('./index.html?shortcut=export');
      }
    })
  );
});
