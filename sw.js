// quick-ref Service Worker v2
// - オフラインキャッシュ
// - Background Sync (iCloud Drive 保存キュー)
// - Periodic Background Sync (定期バックアップ通知)

const CACHE_NAME = 'quick-ref-cache-v2';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: navigate = network-first, assets = cache-first
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 外部API・外部リソースはスキップ
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const c = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(req, c)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const c = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, c));
        return res;
      });
    })
  );
});

// Background Sync: iCloud Driveへの保存をオフライン時にキュー
self.addEventListener('sync', e => {
  if (e.tag === 'icloud-backup') {
    e.waitUntil(syncToICloud());
  }
});

async function syncToICloud() {
  // クライアントにメッセージを送ってデータ取得 → ここでは通知のみ
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'SW_SYNC_ICLOUD' }));
}

// Periodic Background Sync: 毎日バックアップリマインダー
self.addEventListener('periodicsync', e => {
  if (e.tag === 'daily-backup-reminder') {
    e.waitUntil(showBackupReminder());
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
      { action: 'dismiss', title: '後で' }
    ],
    data: { action: 'backup' }
  });
}

// 通知アクション
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'backup' || e.notification.data?.action === 'backup') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({ type: 'TRIGGER_ICLOUD_EXPORT' });
        } else {
          self.clients.openWindow('./index.html?shortcut=export');
        }
      })
    );
  }
});
