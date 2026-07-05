(function (globalScope) {
  const common = globalScope.norinoriSyncCommon;
  if (!common) {
    console.warn('norinoriSyncCommon is not loaded');
    return;
  }

  async function sendToWorker(payload, options = {}) {
    const endpoint = options.endpoint || globalScope.NORINORI_SYNC_ENDPOINT || '/sync';
    const token = options.token || globalScope.NORINORI_SYNC_TOKEN || '';
    const appName = payload?.appName || options.appName || common.APP_NAMES.QUICK_REF;
    const url = `${endpoint}/${encodeURIComponent(appName)}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({}))
    };
  }

  globalScope.norinoriAppBridge = { sendToWorker };
})(typeof window !== 'undefined' ? window : globalThis);
