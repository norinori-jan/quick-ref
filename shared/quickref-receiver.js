(function (globalScope) {
  const common = globalScope.norinoriSyncCommon;
  if (!common) {
    console.warn('norinoriSyncCommon is not loaded');
    return;
  }

  function buildCardFromPayload(payload) {
    const wrap = document.getElementById('cards') || document.getElementById('cardList') || document.querySelector('[data-sync-receiver]');
    if (!wrap) return null;

    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = payload.title || '同期受信';
    card.appendChild(title);

    if (payload.body) {
      const snippet = document.createElement('div');
      snippet.className = 'card-snippet';
      snippet.textContent = payload.body;
      card.appendChild(snippet);
    }

    if (payload.kind === 'image' || payload.content?.imageUrl) {
      const img = document.createElement('img');
      img.src = payload.content?.imageUrl || payload.metadata?.imageUrl || '';
      img.alt = payload.title;
      img.style.width = '100%';
      img.style.maxHeight = '220px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '10px';
      img.style.marginBottom = '8px';
      card.appendChild(img);
    }

    if (payload.kind === 'flowchart' || payload.content?.nodes) {
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.innerHTML = `<span>構造:${payload.content?.nodes?.length || 0} nodes</span>`;
      card.appendChild(meta);
    }

    if (payload.kind === 'mind-map' || payload.content?.nodes) {
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.innerHTML = `<span>mind-map:${payload.content?.nodes?.length || 0} nodes</span>`;
      card.appendChild(meta);
    }

    const chips = document.createElement('div');
    chips.className = 'chips';
    const appChip = document.createElement('span');
    appChip.className = 'chip';
    appChip.textContent = payload.appName;
    chips.appendChild(appChip);

    (payload.tags || []).slice(0, 3).forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = tag;
      chips.appendChild(chip);
    });

    card.appendChild(chips);

    const metaLine = document.createElement('div');
    metaLine.className = 'card-meta';
    metaLine.innerHTML = `<span>from:${payload.source}</span><span>${new Date(payload.timestamp).toLocaleString()}</span>`;
    card.appendChild(metaLine);

    wrap.prepend(card);
    return card;
  }

  function processPayload(payload) {
    const validation = common.validatePayload(payload);
    if (!validation.ok) {
      console.warn('invalid payload', validation.error, payload);
      return false;
    }

    buildCardFromPayload(payload);
    return true;
  }

  function handleIncomingTransfers() {
    const legacyKeys = ['is_transfer', 'ms_transfer', 'kansei_draft_result'];
    legacyKeys.forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const payload = {
            schemaVersion: 1,
            appName: key === 'is_transfer' ? common.APP_NAMES.ILLUST_STUDIO : key === 'ms_transfer' ? common.APP_NAMES.MUSIC_SUITE : common.APP_NAMES.KANSEI,
            kind: key === 'is_transfer' ? 'image' : key === 'ms_transfer' ? 'music' : 'text',
            title: parsed.title || parsed.source || 'legacy-transfer',
            body: parsed.body || parsed.content || '',
            tags: parsed.tags || [],
            metadata: parsed.metadata || {},
            content: parsed.content || parsed.score || parsed.image || null,
            attachments: parsed.attachments || [],
            source: parsed.source || key,
            target: common.APP_NAMES.QUICK_REF,
            timestamp: parsed.timestamp || new Date().toISOString()
          };
          processPayload(payload);
        }
      } catch (error) {
        console.warn(`legacy transfer parse failed for ${key}`, error);
      }
      localStorage.removeItem(key);
    });

    const recent = localStorage.getItem(common.SYNC_KEYS.LAST_PAYLOAD);
    if (recent) {
      try {
        const payload = JSON.parse(recent);
        processPayload(payload);
      } catch (error) {
        console.warn('last payload parse failed', error);
      }
    }

    Object.values(common.APP_NAMES).forEach(appName => {
      const raw = localStorage.getItem(common.getStorageKey(appName));
      if (!raw) return;
      try {
        const payload = JSON.parse(raw);
        processPayload(payload);
      } catch (error) {
        console.warn(`sync payload parse failed for ${appName}`, error);
      }
    });
  }

  globalScope.norinoriQuickRefReceiver = {
    handleIncomingTransfers,
    processPayload,
    buildCardFromPayload
  };

  function initReceiver() {
    if (globalScope.__norinoriSyncReceiverInitialized) return;
    globalScope.__norinoriSyncReceiverInitialized = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', handleIncomingTransfers, { once: true });
    } else {
      handleIncomingTransfers();
    }
  }

  initReceiver();
})(typeof window !== 'undefined' ? window : globalThis);
