/**
 * quick-ref-bridge.js
 * quick-ref → flow-mind 連携ブリッジ
 *
 * 導入方法（quick-ref/index.html の </body> 直前に追加）:
 *   <script src="https://norinori-jan.github.io/flow-mind/shared/emotion-physics.js"></script>
 *   <script src="https://norinori-jan.github.io/flow-mind/shared/quick-ref-bridge.js"></script>
 *
 * 機能:
 *   1. メモ保存時にテキストの感情帯域を推定 → is_emotion_transfer に emotionMeta 付きで書き込む
 *   2. flow-mind の現在 attractor を読んで、メモに感情タグを自動付与
 *   3. 「flow-mind へ送る」ボタンを既存の送信UIに追加
 *
 * 変更履歴:
 *   1.1.0 - 未使用だった LS_ITEMS 定数を削除（quick-refはIndexedDB管理のため不要だった）
 *         - item.body はcontenteditable由来のHTML文字列のため、
 *           感情推定に渡す前にタグを除去するよう修正
 */
(function() {
  'use strict';

  const ep = window.EmotionPhysics;
  if (!ep) { console.warn('[quick-ref-bridge] EmotionPhysics が読み込まれていません'); return; }

  /** HTML文字列からタグを除去してプレーンテキスト化 */
  function stripHtml(html) {
    return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── メモ保存フック
  // quick-ref の保存処理（saveItem など）の末尾にこの関数を呼ぶ
  function onItemSaved(item) {
    const plainBody = stripHtml(item.body);
    const text = [item.title || '', plainBody].join(' ');

    // ① テキストから感情帯域を推定（HTMLタグ除去済みのテキストで）
    const textBand = ep.estimateBandFromText(text);

    // ② flow-mind の現在 attractor を読む（同 origin の場合のみ動作）
    const fmState = ep.readFlowMindAttractor();

    // 感情タグをメモに付与
    const emotionMeta = {
      textBand:  textBand?.band  || null,
      textLabel: textBand?.label || null,
      fmAttractor: fmState?.attractor?.label || null,
      fmBand:    fmState?.band || null,
      timestamp: Date.now(),
    };

    // item に emotionMeta を埋め込んで保存
    item._emotionMeta = emotionMeta;

    // is_emotion_transfer へも書き込む（flow-mind 側で自動的にノード化される）
    // body はプレーンテキスト化した版を送る（flow-mind側でも二重にタグ除去されるが、念のため）
    ep.writeTransfer('quick-ref', [{ ...item, body: plainBody }], emotionMeta);

    console.log('[quick-ref-bridge] emotionMeta 付与:', emotionMeta);
    return emotionMeta;
  }

  // ── 感情タグ UI（メモカードに帯域チップを表示する）
  function renderEmotionChip(emotionMeta) {
    if (!emotionMeta?.textBand) return '';
    const style = ep.BAND_STYLE[emotionMeta.textBand];
    return `<span style="
      display:inline-block; font-size:10px; font-weight:700; border-radius:100px;
      padding:2px 8px; border:1px solid ${style.color}55;
      color:${style.color}; background:${style.color}12; margin-left:6px;
    ">${style.label}</span>`;
  }

  // ── 「flow-mind へ送る」ボタンの動的追加
  // 既存の quick-ref の detail/export ボタンエリアに呼び出す
  function createSendButton(item) {
    const btn = document.createElement('button');
    btn.textContent = '⬡ flow-mind へ';
    btn.style.cssText = `
      background:rgba(245,200,66,0.12); border:1px solid rgba(245,200,66,0.4);
      border-radius:10px; color:#F5C842; font-size:13px; font-weight:700;
      padding:8px 14px; cursor:pointer;
    `;
    btn.addEventListener('click', () => {
      const fmState = ep.readFlowMindAttractor();
      const plainBody = stripHtml(item.body);
      ep.writeTransfer('quick-ref', [{ ...item, body: plainBody }], {
        textBand:    item._emotionMeta?.textBand || null,
        fmAttractor: fmState?.attractor?.label || null,
        timestamp:   Date.now(),
      });
      btn.textContent = '✓ 送信済み';
      setTimeout(() => { btn.textContent = '⬡ flow-mind へ'; }, 2000);
    });
    return btn;
  }

  // ── flow-mind attractor インジケーター（サイドバーや設定画面に差し込む）
  function createAttractorIndicator() {
    const el = document.createElement('div');
    el.id = 'qr-attractor-indicator';
    el.style.cssText = `
      display:flex; align-items:center; gap:6px;
      font-size:12px; font-weight:700; padding:6px 12px;
      border-radius:100px; border:1px solid rgba(255,255,255,0.1);
      background:rgba(255,255,255,0.04); cursor:default;
    `;

    function update() {
      const state = ep.readFlowMindAttractor();
      if (!state?.attractor) {
        el.style.display = 'none';
        return;
      }
      const style = ep.BAND_STYLE[state.attractor.band] || {};
      el.style.display = 'flex';
      el.style.color = style.color || '#fff';
      el.style.borderColor = (style.color || '#fff') + '44';
      el.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${style.color};display:inline-block;"></span>flow-mind: ${state.attractor.label}`;
    }

    update();
    setInterval(update, 1500);
    return el;
  }

  // ── Public API（quick-ref 本体から呼ぶ）
  window.QuickRefBridge = {
    onItemSaved,
    renderEmotionChip,
    createSendButton,
    createAttractorIndicator,
  };

  console.log('[quick-ref-bridge] loaded');
})();

