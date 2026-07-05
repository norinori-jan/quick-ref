(function (globalScope) {
  const APP_NAMES = Object.freeze({
    QUICK_REF: 'quick-ref',
    FLOW_MIND: 'flow-mind',
    FLOWCHART_LAB: 'flowchart-lab',
    MUSIC_SUITE: 'music-suite',
    ILLUST_STUDIO: 'illust-studio',
    KANSEI: 'kansei',
    SPEAK_NATIVE: 'speak-native',
    SECURITY_HUB: 'security-hub',
    CRYPTO_VAULT: 'crypto-vault',
    WHITEHACKER_LAB: 'whitehacker-lab'
  });

  const SYNC_KEYS = Object.freeze({
    TRANSFER_PREFIX: 'nr_sync_',
    LAST_SYNC_AT: 'nr_sync_last_at',
    LAST_PAYLOAD: 'nr_sync_last_payload'
  });

  function createPayload({ appName, kind, title, body, tags = [], metadata = {}, content = null, attachments = [], source = appName, target = APP_NAMES.QUICK_REF, timestamp = new Date().toISOString() }) {
    return {
      schemaVersion: 1,
      appName,
      kind,
      title,
      body,
      tags,
      metadata,
      content,
      attachments,
      source,
      target,
      timestamp
    };
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload must be an object' };
    if (payload.schemaVersion !== 1) return { ok: false, error: 'unsupported schemaVersion' };
    if (typeof payload.appName !== 'string' || !payload.appName.trim()) return { ok: false, error: 'appName is required' };
    if (typeof payload.kind !== 'string' || !payload.kind.trim()) return { ok: false, error: 'kind is required' };
    if (typeof payload.title !== 'string' || !payload.title.trim()) return { ok: false, error: 'title is required' };
    if (typeof payload.source !== 'string' || !payload.source.trim()) return { ok: false, error: 'source is required' };
    if (typeof payload.target !== 'string' || !payload.target.trim()) return { ok: false, error: 'target is required' };
    if (typeof payload.timestamp !== 'string' || !payload.timestamp.trim()) return { ok: false, error: 'timestamp is required' };
    if (!Array.isArray(payload.tags)) return { ok: false, error: 'tags must be an array' };
    if (!Array.isArray(payload.attachments)) return { ok: false, error: 'attachments must be an array' };
    if (payload.metadata && typeof payload.metadata !== 'object') return { ok: false, error: 'metadata must be an object' };
    return { ok: true };
  }

  function getStorageKey(appName) {
    return `${SYNC_KEYS.TRANSFER_PREFIX}${appName}`;
  }

  function saveLocalPayload(payload) {
    try {
      localStorage.setItem(getStorageKey(payload.appName), JSON.stringify(payload));
      localStorage.setItem(SYNC_KEYS.LAST_PAYLOAD, JSON.stringify(payload));
      localStorage.setItem(SYNC_KEYS.LAST_SYNC_AT, new Date().toISOString());
    } catch (error) {
      console.warn('saveLocalPayload failed', error);
    }
  }

  function loadLocalPayload(appName) {
    try {
      const raw = localStorage.getItem(getStorageKey(appName));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('loadLocalPayload failed', error);
      return null;
    }
  }

  const api = {
    APP_NAMES,
    SYNC_KEYS,
    createPayload,
    validatePayload,
    getStorageKey,
    saveLocalPayload,
    loadLocalPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.norinoriSyncCommon = api;
})(typeof window !== 'undefined' ? window : globalThis);
