console.log("main.js loaded");

async function testFlowMind() {
  const payload = {
    message: "Quick-Ref からのテスト送信",
    timestamp: Date.now()
  };

  const result = await sendToFlowMind(payload);
  console.log("FlowMind response:", result);
}

testFlowMind();
/* ─────────────────────────────
   INIT（アプリ初期化）
───────────────────────────── */
async function init() {
  try {
    await openDB();
    allItems = await dbGetAll();
    attachmentMeta = await dbGetAllAttachmentMeta();

    updateLockButton();
    // initThemeMode();
    renderTagFilter();
    renderAll();
    wireEvents();
    loadSettings();
    updateAIBadge();
    updateiCloudStatus();
    updateAutoToggleBtn();
    checkImportHash();

    /* flow-mind attractor indicator */
    const indicator = window.QuickRefBridge?.createAttractorIndicator();
    if (indicator) document.querySelector('.header-actions').prepend(indicator);

  } catch (err) {
    console.error(err);
    document.getElementById('loadingOverlay').textContent =
      'DB起動に失敗しました。リロードしてください。';
    return;
  }

  document.getElementById('loadingOverlay').classList.add('hidden');
}

/* ─────────────────────────────
   Service Worker 登録
───────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(e =>
      console.warn('SW登録失敗:', e)
    )
  );
}
