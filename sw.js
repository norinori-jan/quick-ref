/* ─────────────────────────────
   quick-ref / Service Worker (統合版)
   - オフラインキャッシュ
   - バージョン管理
   - iCloudバックアップトリガー
   - Share Target / Shortcut連携補助
───────────────────────────── */

const CACHE_VERSION = 'qr-cache-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/sw.js',
  '/shared/senders/flow-mind.js',
  '/shared/senders/flowchart-lab.js',
  '/shared/senders/creative-apps.js',
  '/shared/senders/security-apps.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const STATIC_ASSETS = [
  '/styles.css',
  '/manifest.json'
];

const CACHE_WHITELIST = [CACHE_VERSION];

/* ─────────────────────────────
   インストール
───────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll([...APP_SHELL, ...STATIC_ASSETS].filter(Boolean));
      self.skipWaiting();
    })()
  );
});

/* ─────────────────────────────
   アクティベート
───────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => !CACHE_WHITELIST.includes(k))
          .map(k => caches.delete(k))
      );
      self.clients.claim();
    })()
  );
});

/* ─────────────────────────────
   fetch: オフライン対応
───────────────────────────── */
self.addEventListener('fetch', event => {
  const req = event.request;

  // POST / PUT / DELETE はそのままネットへ
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API系はネット優先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch (_) {
          return new Response(
            JSON.stringify({ error: 'offline', message: 'APIはオフラインです' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
    return;
  }

  // App Shell / 静的ファイルは cache-first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (
          res.ok &&
          (req.url.startsWith(self.location.origin) ||
            req.url.endsWith('.js') ||
            req.url.endsWith('.css') ||
            req.url.endsWith('.html'))
        ) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (_) {
        // オフライン時の簡易フォールバック
        if (url.pathname === '/' || url.pathname === '/index.html') {
          const shell = await cache.match('/index.html');
          if (shell) return shell;
        }
        return new Response('オフラインです。キャッシュがありません。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});

/* ─────────────────────────────
   メッセージ: iCloudバックアップなど
───────────────────────────── */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (!data.type) return;

  // ページ側からの明示的トリガー
  if (data.type === 'REQUEST_ICLOUD_EXPORT') {
    broadcast({ type: 'TRIGGER_ICLOUD_EXPORT' });
  }

  // 定期バックアップ予約（例: periodic sync の代替）
  if (data.type === 'SCHEDULE_ICLOUD_SYNC') {
    // ここでは簡易的に即時通知だけ
    broadcast({ type: 'SW_SYNC_ICLOUD' });
  }
});

/* ─────────────────────────────
   Push / Periodic Sync の拡張余地
───────────────────────────── */
// ここでは実装しないが、必要なら:
// self.addEventListener('periodicsync', ...);
// self.addEventListener('push', ...);

/* ─────────────────────────────
   クライアント一斉通知
───────────────────────────── */
async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}

/* ─────────────────────────────
   Share Target (Android Chrome 用)
   ※ manifest.json 側で設定している前提
───────────────────────────── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'POST') return;

  const url = new URL(req.url);
  if (url.pathname !== '/share-target') return;

  event.respondWith(
    (async () => {
      try {
        const formData = await req.formData();
        const text = formData.get('text') || '';
        const title = formData.get('title') || '';
        const urlShared = formData.get('url') || '';

        const clients = await self.clients.matchAll({ type: 'window' });
        const target =
          clients.find(c => c.url.includes('/index.html')) || clients[0];

        if (target) {
          target.postMessage({
            type: 'SHARE_TARGET',
            text,
            title,
            url: urlShared
          });
          await target.focus();
        }

        return Response.redirect('/index.html', 303);
      } catch (e) {
        return new Response('Share Target error', { status: 500 });
      }
    })()
  );
});
