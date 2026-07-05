(function (globalScope) {
  const common = globalScope.norinoriSyncCommon || require('../sync-common.js');
  const { APP_NAMES, createPayload } = common;

  function buildFlowchartPayload({ title, body, structure, tags = [], metadata = {} }) {
    return createPayload({
      appName: APP_NAMES.FLOWCHART_LAB,
      kind: 'flowchart',
      title,
      body,
      tags: [...tags, 'flowchart', 'structure'],
      metadata: {
        ...metadata,
        structureType: structure?.type || 'unknown'
      },
      content: structure || null,
      attachments: []
    });
  }

  const api = { buildFlowchartPayload };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.norinoriSendersFlowchartLab = api;
})(typeof window !== 'undefined' ? window : globalThis);
