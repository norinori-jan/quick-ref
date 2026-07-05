(function (globalScope) {
  const common = globalScope.norinoriSyncCommon || require('../sync-common.js');
  const { APP_NAMES, createPayload } = common;

  function buildFlowMindPayload({ title, body, nodes = [], edges = [], tags = [], metadata = {} }) {
    return createPayload({
      appName: APP_NAMES.FLOW_MIND,
      kind: 'mind-map',
      title,
      body,
      tags: [...tags, 'flow-mind', 'mind-map'],
      metadata: {
        ...metadata,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        graph: { nodes, edges }
      },
      content: { nodes, edges },
      attachments: []
    });
  }

  const api = { buildFlowMindPayload };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.norinoriSendersFlowMind = api;
})(typeof window !== 'undefined' ? window : globalThis);
