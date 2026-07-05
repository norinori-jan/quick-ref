(function (globalScope) {
  const common = globalScope.norinoriSyncCommon || require('../sync-common.js');
  const { APP_NAMES, createPayload } = common;

  function buildCreativePayload(appName, { title, body, tags = [], metadata = {}, content = null, attachments = [] }) {
    return createPayload({
      appName,
      kind: 'creative',
      title,
      body,
      tags: [...new Set([...tags, appName, 'creative'])],
      metadata,
      content,
      attachments
    });
  }

  function buildMusicPayload({ title, body, bpm, key, chords = [], tags = [], metadata = {} }) {
    return buildCreativePayload(APP_NAMES.MUSIC_SUITE, {
      title,
      body,
      tags,
      metadata: { ...metadata, bpm, key, chordCount: chords.length },
      content: { bpm, key, chords }
    });
  }

  function buildIllustPayload({ title, body, imageUrl, tags = [], metadata = {} }) {
    return buildCreativePayload(APP_NAMES.ILLUST_STUDIO, {
      title,
      body,
      tags,
      metadata: { ...metadata, imageUrl },
      content: { imageUrl },
      attachments: imageUrl ? [{ type: 'image', url: imageUrl }] : []
    });
  }

  function buildKanseiPayload({ title, body, draft, tags = [], metadata = {} }) {
    return buildCreativePayload(APP_NAMES.KANSEI, {
      title,
      body,
      tags,
      metadata: { ...metadata, draftKind: draft?.kind || 'note' },
      content: draft || null
    });
  }

  function buildSpeakNativePayload({ title, body, lesson, tags = [], metadata = {} }) {
    return buildCreativePayload(APP_NAMES.SPEAK_NATIVE, {
      title,
      body,
      tags,
      metadata: { ...metadata, lesson },
      content: lesson || null
    });
  }

  const api = {
    buildCreativePayload,
    buildMusicPayload,
    buildIllustPayload,
    buildKanseiPayload,
    buildSpeakNativePayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.norinoriSendersCreative = api;
})(typeof window !== 'undefined' ? window : globalThis);
