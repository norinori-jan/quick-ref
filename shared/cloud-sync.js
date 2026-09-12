/**
 * cloud-sync.js
 * norinori-sync (Cloudflare Workers + KV) を使った、iPhone/Windows共通の同期クライアント。
 * File System Access API のような環境差がなく、fetch が使えればどの端末でも同じように動く。
 *
 * 使い方:
 *   <script src="https://norinori-jan.github.io/flow-mind/shared/cloud-sync.js"></script>
 *   const cs = window.CloudSync;
 *
 *   cs.isConfigured()                          // エンドポイント/トークン設定済みか
 *   cs.setConfig(endpointUrl, token)           // 設定保存（設定画面で1回入力すればOK。全アプリ共通のlocalStorageキー）
 *   cs.getConfig()                             // { endpoint, token }
 *   cs.cloudSave('flow-mind', dataObj)         // 変更のたびに呼ぶ（内部でデバウンス）
 *   const res = await cs.cloudLoad('flow-mind') // 起動時に呼ぶ。{ timestamp, data } | null
 *   cs.getLastSyncedAt('flow-mind')            // 最終同期時刻(ms) | null
 */
(function(global) {
  'use strict';

  // 全アプリ共通のlocalStorageキー（一度設定すれば flow-mind/quick-ref/flowchart-lab/kansei で使い回せる）
  const LS_ENDPOINT = 'cloudsync_endpoint';
  const LS_TOKEN     = 'cloudsync_token';
  const LS_LAST_PREFIX = 'cloudsync_last_';

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

  const timers = {};
  const pendingData = {}; // appName -> 未送信の最新データ（オンライン復帰時に再送）

  /**
   * 変更のたびに呼ぶ。1.2秒デバウンスしてクラウドへPUTする。
   * 未設定の場合は何もしない（エラーにしない＝呼び出し側は気にせず常に呼んでよい）。
   */
  function cloudSave(appName, dataObj) {
    pendingData[appName] = dataObj;
    clearTimeout(timers[appName]);
    timers[appName] = setTimeout(() => attemptSave(appName), 1200);
  }

  async function attemptSave(appName) {
    const c = getConfig();
    if (!c.endpoint || !c.token) return;
    if (!(appName in pendingData)) return;
    const dataObj = pendingData[appName];
    try {
      const res = await fetch(`${c.endpoint}/sync/${encodeURIComponent(appName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${c.token}` },
        body: JSON.stringify({ data: dataObj }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = await res.json();
      localStorage.setItem(LS_LAST_PREFIX + appName, String(out.timestamp || Date.now()));
      delete pendingData[appName];
    } catch (e) {
      console.warn('[cloud-sync] save failed (will retry on reconnect):', e);
    }
  }

  // オンライン復帰時、保留中のデータがあれば自動再送
  global.addEventListener('online', () => {
    Object.keys(pendingData).forEach(appName => attemptSave(appName));
  });

  /**
   * 起動時に呼ぶ。クラウド側のデータを取得する。
   * @returns {Promise<{timestamp:number, data:any}|null>}
   */
  async function cloudLoad(appName) {
    const c = getConfig();
    if (!c.endpoint || !c.token) return null;
    try {
      const res = await fetch(`${c.endpoint}/sync/${encodeURIComponent(appName)}`, {
        headers: { 'Authorization': `Bearer ${c.token}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('[cloud-sync] load failed:', e);
      return null;
    }
  }

  function getLastSyncedAt(appName) {
    const v = localStorage.getItem(LS_LAST_PREFIX + appName);
    return v ? Number(v) : null;
  }

  function setLastSyncedAt(appName, timestamp) {
    localStorage.setItem(LS_LAST_PREFIX + appName, String(timestamp));
  }

  global.CloudSync = {
    getConfig,
    setConfig,
    isConfigured,
    cloudSave,
    cloudLoad,
    getLastSyncedAt,
    setLastSyncedAt,
  };

  console.log('[cloud-sync] loaded');
})(window);

