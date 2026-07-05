(function (globalScope) {
  function initSyncUi(options = {}) {
    const appNames = options.appNames || [
      'flow-mind',
      'flowchart-lab',
      'music-suite',
      'illust-studio',
      'kansei',
      'speak-native'
    ];

    const endpoint = options.endpoint || globalScope.NORINORI_SYNC_ENDPOINT || '/sync';
    const token = options.token || globalScope.NORINORI_SYNC_TOKEN || '';

    if (!globalScope.norinoriPullFromWorker) {
      console.warn('norinoriPullFromWorker is not loaded');
      return;
    }

    globalScope.addEventListener('load', async () => {
      for (const appName of appNames) {
        try {
          await globalScope.norinoriPullFromWorker.pullFromWorker(appName, { endpoint, token });
        } catch (error) {
          console.warn(`initSyncUi failed for ${appName}`, error);
        }
      }
    });
  }

  globalScope.norinoriInitSyncUi = initSyncUi;
})(typeof window !== 'undefined' ? window : globalThis);
