// quick-ref Service Worker
const CACHE_NAME = 'quick-ref-v2';
const ASSETS = [
  '/quick-ref/',
  '/quick-ref/index.html',
  '/quick-ref/manifest.json',
  '/quick-ref/sw.js',
  '/quick-ref/icon-192.png',
  '/quick-ref/icon-512.png'
];

// インストール: アセットをキャッシュ
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 有効化: 古いキャッシュを削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ: Stale-While-Revalidate
// キャッシュがあれば即返しつつ、バックグラウンドで更新
self.addEventListener('fetch', (e) => {
  // GET以外・外部リクエストはスルー
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchAndUpdate = fetch(e.request).then(response => {
          if (response && response.status === 200) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetchAndUpdate;
      })
    )
  );
});

