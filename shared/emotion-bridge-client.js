// shared/emotion-bridge-client.js
// flow-mind ⇄ quick-ref 間の「感情データ専用」軽量ブリッジ。
// fm_graphs等の全データ同期(cloud-sync.js/sync-worker)とは完全に独立したルート。
// emotion-bridge-api(Cloudflare Pages Functions)の /api/emotion/push, /api/emotion/pull を叩くだけ。
(function (global) {
  const LS_ENDPOINT = 'eb_endpoint';
  const LS_TOKEN     = 'eb_token';
  const LS_LAST_PULL_PREFIX = 'eb_last_pull_'; // + selfApp

  function getConfig() {
    return {
      endpoint: localStorage.getItem(LS_ENDPOINT) || '',
      token: localStorage.getItem(LS_TOKEN) || '',
    };
  }

  function setConfig(endpoint, token) {
    localStorage.setItem(LS_ENDPOINT, (endpoint || '').trim());
    localStorage.setItem(LS_TOKEN, (token || '').trim());
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c.endpoint && c.token);
  }

  // selfApp: 'flow-mind' | 'quick-ref'（自分自身のアプリ名）
  async function push(selfApp, payload) {
    const c = getConfig();
    if (!c.endpoint || !c.token) throw new Error('emotion-bridge未設定（エンドポイント/トークン）');
    const res = await fetch(`${c.endpoint.replace(/\/$/, '')}/api/emotion/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': c.token },
      body: JSON.stringify({ source: selfApp, payload }),
    });
    if (!res.ok) throw new Error(`emotion-bridge push failed: ${res.status}`);
    return res.json();
  }

  // selfApp: 'flow-mind' | 'quick-ref'（自分自身のアプリ名。相手の更新だけを取得する）
  // 戻り値: null または { source, payload, timestamp }
  async function pull(selfApp) {
    const c = getConfig();
    if (!c.endpoint || !c.token) return null;
    const sinceKey = LS_LAST_PULL_PREFIX + selfApp;
    const since = Number(localStorage.getItem(sinceKey) || 0);
    const res = await fetch(`${c.endpoint.replace(/\/$/, '')}/api/emotion/pull?for=${selfApp}&since=${since}`, {
      headers: { 'X-Bridge-Token': c.token },
    });
    if (!res.ok) throw new Error(`emotion-bridge pull failed: ${res.status}`);
    const { data } = await res.json();
    if (data) localStorage.setItem(sinceKey, String(data.timestamp));
    return data;
  }

  global.EmotionBridgeClient = { getConfig, setConfig, isConfigured, push, pull };

  console.log('[emotion-bridge-client] loaded');
})(window);