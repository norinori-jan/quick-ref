import { loadEcosystemTags } from './ecosystem.js';

const tags = loadEcosystemTags();
console.log(tags);

function generateIcon(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#F7F7F8';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#1C1C1E';
  ctx.font = `${size * 0.35}px -apple-system`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QR', size / 2, size / 2);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `icon-${size}.png`;
  a.click();
}

window.generateIcon = generateIcon;
window.addEventListener("unhandledrejection", (event) => {
  console.warn("IndexedDB error detected:", event.reason);
  indexedDB.deleteDatabase("quick-ref-db");
  console.log("quick-ref-db deleted for recovery.");
});
// ════════════════════════════════════════════════════════
// RECEIVER — 他リポジトリからのデータ受信
// ════════════════════════════════════════════════════════

function checkIncomingTransfers() {
  // 1. illust-studio → quick-ref（画像）
  const illust = localStorage.getItem('is_transfer');
  if (illust) {
    try {
      const data = JSON.parse(illust);
      addIncomingCard({
        type: 'image',
        title: data.title || 'illust-studio',
        image: data.image,
        source: data.source || 'illust-studio',
        timestamp: data.timestamp
      });
      localStorage.removeItem('is_transfer');
    } catch (e) {
      console.warn('is_transfer parse error', e);
    }
  }

  // 2. music-suite → quick-ref（楽曲データ）
  const ms = localStorage.getItem('ms_transfer');
  if (ms) {
    try {
      const data = JSON.parse(ms);
      addIncomingCard({
        type: 'music',
        title: data.title || 'music-suite',
        bpm: data.bpm,
        score: data.score,
        source: data.source || 'music-suite',
        timestamp: data.timestamp
      });
      localStorage.removeItem('ms_transfer');
    } catch (e) {
      console.warn('ms_transfer parse error', e);
    }
  }

  // 3. kansei → quick-ref（旅行記）
  const ks = localStorage.getItem('kansei_draft_result');
  if (ks) {
    try {
      const data = JSON.parse(ks);
      addIncomingCard({
        type: 'text',
        title: data.title || 'kansei',
        content: data.content,
        source: data.source || 'kansei',
        timestamp: data.timestamp
      });
      localStorage.removeItem('kansei_draft_result');
    } catch (e) {
      console.warn('kansei_draft_result parse error', e);
    }
  }
}

// ════════════════════════════════════════════════════════
// カード生成（簡易版）
// ════════════════════════════════════════════════════════

function addIncomingCard(obj) {
  const wrap = document.getElementById('cards');
  if (!wrap) return;

  const card = document.createElement('div');
  card.className = 'card';

  // タイトル
  const h = document.createElement('h3');
  h.textContent = obj.title;
  card.appendChild(h);

  // 中身
  if (obj.type === 'image') {
    const img = document.createElement('img');
    img.src = obj.image;
    img.style.width = '100%';
    card.appendChild(img);
  }

  if (obj.type === 'music') {
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(obj.score, null, 2);
    card.appendChild(pre);

    const bpm = document.createElement('div');
    bpm.textContent = `BPM: ${obj.bpm}`;
    card.appendChild(bpm);
  }

  if (obj.type === 'text') {
    const p = document.createElement('p');
    p.textContent = obj.content;
    card.appendChild(p);
  }

  // ソース
  const src = document.createElement('div');
  src.style.fontSize = '12px';
  src.style.opacity = '0.6';
  src.textContent = `from: ${obj.source}`;
  card.appendChild(src);

  wrap.prepend(card);
}

// ════════════════════════════════════════════════════════
// 起動時に受信チェック
// ════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
  checkIncomingTransfers();
});


