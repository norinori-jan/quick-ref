/**
 * push-client.js
 * push-worker への購読登録/解除を行うクライアント側ヘルパー。
 * quick-ref の設定画面から呼び出す想定（他アプリでも使い回せるよう汎用化してある）。
 *
 * 導入方法:
 *   <script src="./shared/push-client.js"></script>
 *   const pc = window.PushClient;
 *
 * 使い方:
 *   pc.isConfigured()                         エンドポイント/トークン設定済みか
 *   pc.setConfig(endpointUrl, token)           設定保存(cloud-sync.jsと同じ考え方。ただし別トークン)
 *   await pc.subscribe('quick-ref')            通知を許可して購読登録
 *   await pc.unsubscribe()                     購読解除
 *   await pc.getStatus()                       'unsupported' | 'default' | 'denied' | 'subscribed' | 'not-subscribed'
 */
(function (global) {
  'use strict';

  const LS_ENDPOINT = 'pushclient_endpoint';
  const LS_TOKEN = 'pushclient_token';

  function getConfig() {
    return {
      endpoint: (localStorage.getItem(LS_ENDPOINT) || '').replace(/\/$/, ''),
      token: localStorage.getItem(LS_TOKEN) || '',
    };
  }

  function setConfig(endpoint, token) {
    localStorage.setItem(LS_ENDPOINT, (endpoint || '').trim().replace(/\/$/, ''));
    localStorage.setItem(LS_TOKEN, (token || '').trim());
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.endpoint && c.token);
  }

  async function getStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'default') return 'default';
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'not-subscribed';
  }

  async function fetchVapidPublicKey() {
    const c = getConfig();
    const res = await fetch(`${c.endpoint}/push/vapid-public-key`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.publicKey;
  }

  async function subscribe(appName) {
    if (!isConfigured()) throw new Error('通知サーバーの設定(エンドポイント/トークン)が未設定です');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('この端末・ブラウザは通知に対応していません');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('通知が許可されませんでした');

    const publicKey = await fetchVapidPublicKey();
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
    }

    const c = getConfig();
    const res = await fetch(`${c.endpoint}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.token}` },
      body: JSON.stringify({ appName, subscription: sub.toJSON() }),
    });
    if (!res.ok) throw new Error(`購読登録に失敗しました (HTTP ${res.status})`);
    return true;
  }

  async function unsubscribe() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const c = getConfig();
    if (isConfigured()) {
      try {
        await fetch(`${c.endpoint}/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.token}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch (e) {
        console.warn('[push-client] unsubscribe (server) failed:', e);
      }
    }
    await sub.unsubscribe();
  }

  global.PushClient = {
    isConfigured,
    setConfig,
    getConfig,
    getStatus,
    subscribe,
    unsubscribe,
  };

  console.log('[push-client] loaded');
})(window);

