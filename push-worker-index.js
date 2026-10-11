/**
 * push-worker
 * quick-ref のデイリーレビュー通知など、エコシステム共通のPush通知送信基盤。
 *
 * ルート:
 *   GET  /push/vapid-public-key           公開鍵を返す（クライアントのpushManager.subscribeで使う）
 *   POST /push/subscribe                  購読を登録  { appName, subscription }
 *   POST /push/unsubscribe                購読を解除  { endpoint }
 *
 * すべて Authorization: Bearer <AUTH_TOKEN> が必要。
 */

import { sendPushNotification } from './webpush.js';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function checkAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return token && token === env.AUTH_TOKEN;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuf)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default {
  async fetch(request, env, ctx) {
    const origin = env.CORS_ORIGIN || '*';
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    // 公開鍵の配布だけは認証不要
    if (url.pathname === '/push/vapid-public-key' && method === 'GET') {
      return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, origin);
    }

    // それ以外は認証必須
    if (!checkAuth(request, env)) {
      return json({ error: 'Unauthorized' }, 401, origin);
    }

    // 購読登録
    if (url.pathname === '/push/subscribe' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400, origin);
      }

      const { appName, subscription } = body || {};
      if (
        !appName ||
        !subscription?.endpoint ||
        !subscription?.keys?.p256dh ||
        !subscription?.keys?.auth
      ) {
        return json(
          { error: 'appName と subscription(endpoint, keys.p256dh, keys.auth) が必要です' },
          400,
          origin,
        );
      }

      const key = 'sub:' + (await sha256Hex(subscription.endpoint));
      await env.PUSH_KV.put(
        key,
        JSON.stringify({
          appName,
          subscription,
          savedAt: Date.now(),
        }),
      );

      return json({ ok: true }, 200, origin);
    }

    // 購読解除
    if (url.pathname === '/push/unsubscribe' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Invalid JSON' }, 400, origin);
      }

      const { endpoint } = body || {};
      if (!endpoint) {
        return json({ error: 'endpoint が必要です' }, 400, origin);
      }

      const key = 'sub:' + (await sha256Hex(endpoint));
      await env.PUSH_KV.delete(key);

      return json({ ok: true }, 200, origin);
    }

    // 未定義ルート
    return json({ error: 'Not found' }, 404, origin);
  },

  /**
   * Cronトリガー(wrangler.tomlで毎朝の時刻を設定)。
   * KVに登録済みの購読すべてにリマインダー通知を送る。
   * 失効した購読(404/410が返ってきたもの)はこの実行中にKVから削除する。
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      sendDailyReminders(env).catch(err => {
        console.error('Daily reminder failed:', err);
      }),
    );
  },
};

async function sendDailyReminders(env) {
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT, // 'mailto:xxx@example.com'
  };

  let cursor;
  const keysToDelete = [];

  do {
    const list = await env.PUSH_KV.list({ prefix: 'sub:', cursor });

    for (const entry of list.keys) {
      const raw = await env.PUSH_KV.get(entry.name);
      if (!raw) continue;

      const { subscription, appName } = JSON.parse(raw);

      const payload = {
        title: '📋 デイリーレビュー',
        body: `${appName || 'quick-ref'} に見返したい項目があります。開いて確認しましょう。`,
        url: appName === 'quick-ref' ? '/quick-ref/?shortcut=review' : '/',
      };

      try {
        const result = await sendPushNotification(subscription, payload, vapid);
        if (result?.expired) {
          keysToDelete.push(entry.name);
        }
      } catch (e) {
        console.warn('push send failed for', entry.name, e);
      }
    }

    cursor = list.cursor;
  } while (cursor);

  for (const key of keysToDelete) {
    await env.PUSH_KV.delete(key);
  }
}
