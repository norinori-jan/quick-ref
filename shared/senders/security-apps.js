(function (globalScope) {
  const common = globalScope.norinoriSyncCommon || require('../sync-common.js');
  const { APP_NAMES, createPayload } = common;

  function buildSecurityMetadataPayload(appName, { title, body, tags = [], metadata = {} }) {
    return createPayload({
      appName,
      kind: 'security-metadata',
      title,
      body,
      tags: [...new Set([...tags, 'security', 'metadata-only'])],
      metadata: {
        ...metadata,
        safeOnly: true,
        contentMode: 'metadata-only'
      },
      content: null,
      attachments: []
    });
  }

  function buildSecurityHubPayload(input) {
    return buildSecurityMetadataPayload(APP_NAMES.SECURITY_HUB, input);
  }

  function buildCryptoVaultPayload(input) {
    return buildSecurityMetadataPayload(APP_NAMES.CRYPTO_VAULT, input);
  }

  function buildWhitehackerPayload(input) {
    return buildSecurityMetadataPayload(APP_NAMES.WHITEHACKER_LAB, input);
  }

  const api = {
    buildSecurityMetadataPayload,
    buildSecurityHubPayload,
    buildCryptoVaultPayload,
    buildWhitehackerPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.norinoriSendersSecurity = api;
})(typeof window !== 'undefined' ? window : globalThis);
