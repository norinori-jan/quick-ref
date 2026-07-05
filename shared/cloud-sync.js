(function (globalScope) {
  const common = globalScope.norinoriSyncCommon || require('./sync-common.js');
  const { APP_NAMES, validatePayload, saveLocalPayload } = common;

  class CloudSyncClient {
    constructor({ endpoint = '/sync', storage = window.localStorage, appName = APP_NAMES.QUICK_REF } = {}) {
      this.endpoint = endpoint;
      this.storage = storage;
      this.appName = appName;
      this.queue = [];
    }

    async send(payload, options = {}) {
      const validation = validatePayload(payload);
      if (!validation.ok) {
        throw new Error(validation.error);
      }

      saveLocalPayload(payload);
      this.queue.push(payload);
      if (options.dryRun) return payload;
      return this.flush();
    }

    async flush() {
      if (!this.queue.length) return [];
      const batch = this.queue.splice(0);
      const results = [];
      for (const payload of batch) {
        const targetUrl = `${this.endpoint}/${encodeURIComponent(payload.target || this.appName)}`;
        try {
          const response = await fetch(targetUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const body = await response.json().catch(() => ({}));
          results.push({ ok: response.ok, status: response.status, body });
        } catch (error) {
          results.push({ ok: false, error: error.message });
        }
      }
      return results;
    }

    async get(appName = this.appName) {
      const targetUrl = `${this.endpoint}/${encodeURIComponent(appName)}`;
      try {
        const response = await fetch(targetUrl, { method: 'GET' });
        if (!response.ok) return null;
        return response.json();
      } catch (error) {
        console.warn('CloudSyncClient.get failed', error);
        return null;
      }
    }
  }

  const api = { CloudSyncClient };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.norinoriCloudSync = api;
})(typeof window !== 'undefined' ? window : globalThis);
