(function (globalScope) {
  const common = globalScope.norinoriSyncCommon;
  if (!common) {
    console.warn('norinoriSyncCommon is not loaded');
    return;
  }

  async function pullFromWorker(appName, options = {}) {
    const endpoint = options.endpoint || globalScope.NORINORI_SYNC_ENDPOINT || '/sync';
    const token = options.token || globalScope.NORINORI_SYNC_TOKEN || '';
    const url = `${endpoint}/${encodeURIComponent(appName)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        globalScope.norinoriQuickRefReceiver?.processPayload(payload);
        return payload;
      }
      return null;
    } catch (error) {
      console.warn(`pullFromWorker failed for ${appName}`, error);
      return null;
    }
  }

  async function pullAllFromWorker(appNames = [], options = {}) {
    const results = [];
    for (const appName of appNames) {
      const payload = await pullFromWorker(appName, options);
      if (payload) results.push(payload);
    }
    return results;
  }

  globalScope.norinoriPullFromWorker = { pullFromWorker, pullAllFromWorker };
})(typeof window !== 'undefined' ? window : globalThis);
