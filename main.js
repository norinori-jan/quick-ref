/* ─────────────────────────────
   IndexedDB 基盤
───────────────────────────── */
const DB_NAME = 'quickref_db_v3';
const DB_VERSION = 3;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }

      if (!db.objectStoreNames.contains('attachments')) {
        const store = db.createObjectStore('attachments', { keyPath: 'id' });
        store.createIndex('itemId', 'itemId');
      }
    };

    req.onsuccess = e => {
      db = e.target.result;
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

function dbPut(item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const req = tx.objectStore('items').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ─────────────────────────────
   添付ファイル
───────────────────────────── */
function dbPutAttachment(att) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').put(att);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function dbGetAttachments(itemId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attachments', 'readonly');
    const idx = tx.objectStore('attachments').index('itemId');
    const req = idx.getAll(itemId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dbDeleteAttachment(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attachments', 'readwrite');
    tx.objectStore('attachments').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function dbDeleteAttachmentsByItemId(itemId) {
  return dbGetAttachments(itemId).then(list =>
    Promise.all(list.map(a => dbDeleteAttachment(a.id)))
  );
}

function dbGetAllAttachmentMeta() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('attachments', 'readonly');
    const req = tx.objectStore('attachments').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ─────────────────────────────
   暗号化（PIN）
───────────────────────────── */
const PIN_META_KEY = 'qr_pin_meta';
let sessionKey = null;
let decryptedCache = new Map();

async function setupPin(pin) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 200000,
      hash: 'SHA-256'
    },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const meta = {
    salt: Array.from(salt),
    createdAt: Date.now()
  };
  localStorage.setItem(PIN_META_KEY, JSON.stringify(meta));
  sessionKey = derived;
}

async function tryUnlockWithPin(pin) {
  const meta = JSON.parse(localStorage.getItem(PIN_META_KEY) || '{}');
  if (!meta.salt) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const salt = new Uint8Array(meta.salt);
  const derived = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 200000,
      hash: 'SHA-256'
    },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  sessionKey = derived;
  return true;
}

function lockSession() {
  sessionKey = null;
  decryptedCache.clear();
}

/* ─────────────────────────────
   暗号化：本文・fields
───────────────────────────── */
async function encryptToItemFields(body, fields) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encBody = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    new TextEncoder().encode(body)
  );

  const encFields = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    new TextEncoder().encode(JSON.stringify(fields))
  );

  return {
    iv: Array.from(iv),
    encBody: Array.from(new Uint8Array(encBody)),
    encFields: Array.from(new Uint8Array(encFields))
  };
}

async function decryptItemContent(item) {
  if (!item.encBody) return null;
  const iv = new Uint8Array(item.iv);

  const bodyBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    new Uint8Array(item.encBody)
  );
  const fieldsBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sessionKey,
    new Uint8Array(item.encFields)
  );

  return {
    body: new TextDecoder().decode(bodyBuf),
    fields: JSON.parse(new TextDecoder().decode(fieldsBuf))
  };
}

/* ─────────────────────────────
   QuickRefBridge（Flow-Mind連携）
───────────────────────────── */
window.QuickRefBridge = {
  createSendButton(item) {
    const btn = document.createElement('button');
    btn.textContent = 'Flow-Mindへ送信';
    btn.className = 'flowmind-btn';
    btn.onclick = () => this.sendToFlowMind(item);
    return btn;
  },

  sendToFlowMind(item) {
    const payload = {
      id: item.id,
      title: item.title,
      tags: item.tags,
      body: decryptedCache.get(item.id)?.body || item.body || ''
    };
    console.log('Flow-Mind送信:', payload);
  },

  createAttractorIndicator() {
    const el = document.createElement('span');
    el.textContent = '🌀';
    el.style.fontSize = '18px';
    return el;
  },

  onItemSaved(item) {
    console.log('Flow-Mind: 保存通知', item);
  }
};

/* ─────────────────────────────
   ユーティリティ
───────────────────────────── */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}
/* ─────────────────────────────
   検索（N-gram / bigram）
───────────────────────────── */
function bigrams(text) {
  const t = (text || '').toLowerCase().replace(/[\s\u3000]+/g, '');
  const s = new Set();
  for (let i = 0; i < t.length - 1; i++) s.add(t.slice(i, i + 2));
  return s;
}

function searchItems(items, query) {
  if (!query.trim()) return items;
  const q = query.trim().toLowerCase();
  const qBi = bigrams(q);

  return items.filter(it => {
    const text = `${it.title || ''} ${it.body || ''} ${(it.tags || []).join(' ')}`.toLowerCase();

    if (text.includes(q)) return true;

    if (q.length >= 2) {
      const tBi = bigrams(text);
      let m = 0;
      for (const b of qBi) if (tBi.has(b)) m++;
      return m / qBi.size >= 0.5;
    }
    return false;
  }).sort((a, b) => {
    const aT = (a.title || '').toLowerCase().includes(q) ? 1 : 0;
    const bT = (b.title || '').toLowerCase().includes(q) ? 1 : 0;
    if (bT !== aT) return bT - aT;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function highlightText(text, query) {
  if (!query.trim()) return escapeHtml(text);
  const q = escapeHtml(query.trim());
  const escaped = escapeHtml(text);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return escaped.replace(re, m => `<mark>${m}</mark>`);
}

/* ─────────────────────────────
   タグフィルタ
───────────────────────────── */
let allItems = [];
let attachmentMeta = [];
let filterTag = null;
let searchQuery = '';
let linkFilterActive = false;

function getAllTagsSorted() {
  const s = new Set();
  allItems.forEach(i => (i.tags || []).forEach(t => s.add(t)));
  return [...s].sort();
}

function renderTagFilter() {
  const row = document.getElementById('tagFilterRow');
  const allTags = getAllTagsSorted();
  const chips = ['__all__', ...allTags].map(tag => {
    const label = tag === '__all__' ? 'すべて' : tag;
    const active = filterTag === tag ? 'active' : '';
    return `<button class="filter-chip ${active}" data-tag="${escapeHtml(tag)}">${escapeHtml(label)}</button>`;
  });

  row.innerHTML =
    chips.join('') +
    `<button class="filter-chip${linkFilterActive ? ' active' : ''}" id="linkFilterBtn">🔗 リンク集</button>`;

  row.querySelectorAll('.filter-chip[data-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterTag = btn.dataset.tag;
      renderTagFilter();
      renderAll();
    });
  });

  document.getElementById('linkFilterBtn').addEventListener('click', () => {
    linkFilterActive = !linkFilterActive;
    renderTagFilter();
    renderAll();
  });
}

/* ─────────────────────────────
   カード描画
───────────────────────────── */
function renderAll() {
  const list = document.getElementById('cardList');
  const empty = document.getElementById('emptyState');

  let items = [...allItems];

  if (filterTag && filterTag !== '__all__') {
    items = items.filter(i => (i.tags || []).includes(filterTag));
  }

  if (linkFilterActive) {
    const links = getLinks();
    items = items.filter(i => (links[i.id] || []).length > 0);
  }

  items = searchItems(items, searchQuery);

  if (!items.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    document.getElementById('countLabel').textContent = '0件';
    return;
  }

  empty.style.display = 'none';
  document.getElementById('countLabel').textContent = `${items.length}件`;

  list.innerHTML = items
    .map(item => {
      const cached = decryptedCache.get(item.id);
      const body = cached ? cached.body : (item.body || '');
      const snippet = body.replace(/<[^>]+>/g, '').slice(0, 80);
      const tagsHtml = (item.tags || [])
        .map(t => `<span class="chip">#${escapeHtml(t)}</span>`)
        .join('');

      return `
        <div class="card" data-id="${item.id}">
          <div class="card-title">${highlightText(item.title || '(無題)', searchQuery)}</div>
          <div class="card-snippet">${highlightText(snippet, searchQuery)}</div>
          <div class="chips">${tagsHtml}</div>
          <div class="card-meta">
            <span>${item.url ? '🔗 URLあり' : ''}</span>
            <span>${item.sensitive ? '🔒 保護' : ''}</span>
          </div>
        </div>`;
    })
    .join('');

  list.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => openEdit(el.dataset.id));
  });
}

/* ─────────────────────────────
   編集シート：新規
───────────────────────────── */
let editingId = null;
let draftTags = [];
let draftFields = [];
let draftSensitive = false;
let draftImages = [];
let draftAudios = [];
let draftVideos = [];
let pendingDeleteAttIds = [];
let objURLs = [];

function revokeAllObjURLs() {
  objURLs.forEach(u => URL.revokeObjectURL(u));
  objURLs = [];
}

function openNew() {
  editingId = null;
  draftTags = [];
  draftFields = [];
  draftSensitive = false;
  draftImages = [];
  draftAudios = [];
  draftVideos = [];
  pendingDeleteAttIds = [];
  revokeAllObjURLs();

  document.getElementById('sheetTitle').textContent = '新規追加';
  document.getElementById('fTitle').value = '';
  document.getElementById('fBody').innerHTML = '';
  document.getElementById('tagInput').value = '';
  document.getElementById('inputUrl').value = '';
  document.getElementById('sensitiveToggle').checked = false;
  document.getElementById('dangerZone').style.display = 'none';
  document.getElementById('fieldRows').innerHTML = '';
  document.getElementById('imgThumbs').innerHTML = '';
  document.getElementById('audioList').innerHTML = '';
  document.getElementById('videoList').innerHTML = '';
  document.getElementById('relatedSection').innerHTML = '';

  renderTagChips();
  renderTagSuggestions();
  openSheet();
}

/* ─────────────────────────────
   編集シート：既存項目
───────────────────────────── */
async function openEdit(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  let plainBody = '';
  let plainFields = [];

  if (item.sensitive) {
    const ok = await ensureUnlocked();
    if (!ok) return;

    const cached = decryptedCache.get(item.id) || (await decryptItemContent(item));
    if (cached) {
      plainBody = cached.body || '';
      plainFields = cached.fields || [];
    }
  } else {
    plainBody = item.body || '';
    plainFields = item.fields || [];
  }

  editingId = id;
  draftTags = [...(item.tags || [])];
  draftFields = [...plainFields];
  draftSensitive = !!item.sensitive;

  revokeAllObjURLs();
  draftImages = [];
  draftAudios = [];
  draftVideos = [];
  pendingDeleteAttIds = [];
  stopRecordingIfActive();

  document.getElementById('sheetTitle').textContent = '編集';
  document.getElementById('fTitle').value = item.title || '';
  document.getElementById('fBody').innerHTML = plainBody;
  document.getElementById('tagInput').value = '';
  document.getElementById('inputUrl').value = item.url || '';
  document.getElementById('sensitiveToggle').checked = draftSensitive;
  document.getElementById('dangerZone').style.display = '';

  renderTagChips();
  renderTagSuggestions();
  renderFieldRows();

  document.getElementById('imgThumbs').innerHTML = '';
  document.getElementById('audioList').innerHTML = '';
  document.getElementById('videoList').innerHTML = '';

  await loadExistingImages(id);
  await loadExistingAudios(id);
  await loadExistingVideos(id);

  openSheet();

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:10px;';
  const btn = window.QuickRefBridge?.createSendButton(item);
  if (btn) wrap.appendChild(btn);
  document.getElementById('relatedSection').insertAdjacentElement('afterend', wrap);

  setTimeout(() => renderRelatedItems(item), 80);
}

/* ─────────────────────────────
   編集シート開閉
───────────────────────────── */
function openSheet() {
  document.getElementById('editSheet').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('fTitle').focus(), 300);
}

function closeSheet() {
  stopRecordingIfActive();
  revokeAllObjURLs();
  pendingDeleteAttIds = [];
  document.getElementById('editSheet').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

/* ─────────────────────────────
   タグ入力
───────────────────────────── */
function renderTagChips() {
  const el = document.getElementById('tagChips');
  el.innerHTML = draftTags
    .map(t => `<span class="chip" data-tag="${escapeHtml(t)}">#${escapeHtml(t)} <button class="chip-del">✕</button></span>`)
    .join('');

  el.querySelectorAll('.chip-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.parentElement.dataset.tag;
      draftTags = draftTags.filter(x => x !== tag);
      renderTagChips();
      renderTagSuggestions();
    });
  });
}

function renderTagSuggestions() {
  const el = document.getElementById('tagSuggestions');
  const input = document.getElementById('tagInput').value.trim().toLowerCase();
  const all = getAllTagsSorted().filter(t => !draftTags.includes(t));

  const filtered = input
    ? all.filter(t => t.toLowerCase().includes(input))
    : all.slice(0, 10);

  el.innerHTML = filtered
    .map(t => `<span class="chip suggestion" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`)
    .join('');

  el.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      draftTags.push(btn.dataset.tag);
      document.getElementById('tagInput').value = '';
      renderTagChips();
      renderTagSuggestions();
    });
  });
}

function commitTagInput() {
  const v = document.getElementById('tagInput').value.trim();
  if (!v) return;
  if (!draftTags.includes(v)) draftTags.push(v);
  document.getElementById('tagInput').value = '';
  renderTagChips();
  renderTagSuggestions();
}

/* ─────────────────────────────
   構造化項目
───────────────────────────── */
function renderFieldRows() {
  const el = document.getElementById('fieldRows');
  el.innerHTML = draftFields
    .map((f, i) => `
      <div class="field-row" data-i="${i}">
        <input type="text" class="field-key" placeholder="項目名" value="${escapeHtml(f.key)}">
        <input type="text" class="field-value" placeholder="値" value="${escapeHtml(f.value)}">
        <button class="field-del">✕</button>
      </div>
    `)
    .join('');

  el.querySelectorAll('.field-row').forEach(row => {
    const i = Number(row.dataset.i);
    row.querySelector('.field-key').addEventListener('input', e => {
      draftFields[i].key = e.target.value;
    });
    row.querySelector('.field-value').addEventListener('input', e => {
      draftFields[i].value = e.target.value;
    });
    row.querySelector('.field-del').addEventListener('click', () => {
      draftFields.splice(i, 1);
      renderFieldRows();
    });
  });
}
/* ─────────────────────────────
   画像添付
───────────────────────────── */
function renderImageThumbs() {
  const el = document.getElementById('imgThumbs');
  el.innerHTML = '';

  draftImages.forEach((img, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'img-thumb-wrap';

    const thumb = document.createElement('img');
    thumb.className = 'img-thumb';
    thumb.src = img.url;
    thumb.addEventListener('click', () => openImgPreview(img.url));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'img-thumb-del';
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (img.isExisting && img.attId) pendingDeleteAttIds.push(img.attId);
      URL.revokeObjectURL(img.url);
      draftImages.splice(i, 1);
      renderImageThumbs();
    });

    wrap.appendChild(thumb);
    wrap.appendChild(del);
    el.appendChild(wrap);
  });
}

function addBlobToDraft(blob, name) {
  if (blob.size > 5 * 1024 * 1024) {
    showToast('画像サイズが大きすぎます(上限5MB)');
    return;
  }
  const url = URL.createObjectURL(blob);
  objURLs.push(url);
  draftImages.push({
    tempId: crypto.randomUUID(),
    blob,
    url,
    name: name || 'image.jpg',
    isExisting: false
  });
  renderImageThumbs();
}

async function loadExistingImages(itemId) {
  const atts = await dbGetAttachments(itemId);
  atts
    .filter(a => a.type === 'image')
    .forEach(a => {
      const url = URL.createObjectURL(a.blob);
      objURLs.push(url);
      draftImages.push({
        tempId: crypto.randomUUID(),
        blob: a.blob,
        url,
        name: a.name,
        isExisting: true,
        attId: a.id
      });
    });
  renderImageThumbs();
}

async function saveImageAttachments(itemId) {
  for (const img of draftImages) {
    if (!img.isExisting) {
      await dbPutAttachment({
        id: crypto.randomUUID(),
        itemId,
        type: 'image',
        blob: img.blob,
        mimeType: img.blob.type || 'image/jpeg',
        name: img.name,
        createdAt: Date.now()
      });
    }
  }
}

/* ─────────────────────────────
   音声添付
───────────────────────────── */
let mediaRecorder = null;
let recChunks = [];
let recSeconds = 0;
let recTimerInterval = null;

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function stopRecordingIfActive() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  if (recTimerInterval) {
    clearInterval(recTimerInterval);
    recTimerInterval = null;
  }
  document.getElementById('recStatus').classList.remove('active');
  mediaRecorder = null;
  recChunks = [];
  recSeconds = 0;
}

function addAudioToDraft(blob, name, type = 'audio', meta = {}) {
  const url = URL.createObjectURL(blob);
  objURLs.push(url);
  draftAudios.push({
    tempId: crypto.randomUUID(),
    blob,
    url,
    name,
    type,
    meta,
    isExisting: false
  });
  renderAudioList();
}

async function loadExistingAudios(itemId) {
  const atts = await dbGetAttachments(itemId);
  atts
    .filter(a => a.type === 'audio' || a.type === 'music-ref')
    .forEach(a => {
      const url = a.type === 'music-ref' ? null : URL.createObjectURL(a.blob);
      if (url) objURLs.push(url);
      draftAudios.push({
        tempId: crypto.randomUUID(),
        blob: a.blob,
        url,
        name: a.name,
        type: a.type,
        meta: a.meta || {},
        isExisting: true,
        attId: a.id
      });
    });
  renderAudioList();
}

async function saveAudioAttachments(itemId) {
  for (const aud of draftAudios) {
    if (!aud.isExisting) {
      await dbPutAttachment({
        id: crypto.randomUUID(),
        itemId,
        type: aud.type,
        blob: aud.blob,
        mimeType: aud.blob ? aud.blob.type : 'application/json',
        name: aud.name,
        meta: aud.meta,
        createdAt: Date.now()
      });
    }
  }
}

function renderAudioList() {
  const el = document.getElementById('audioList');
  el.innerHTML = '';

  draftAudios.forEach((aud, i) => {
    const row = document.createElement('div');
    row.className = 'audio-row';

    const name = document.createElement('span');
    name.className = 'audio-name';
    name.textContent = aud.name;

    const play = document.createElement('button');
    play.className = 'audio-play-btn';
    play.textContent = '▶︎';
    play.addEventListener('click', () => {
      if (!aud.url) {
        alert('music-suite素材はJSONのため再生できません');
        return;
      }
      const audio = new Audio(aud.url);
      audio.play();
    });

    const del = document.createElement('button');
    del.className = 'audio-del-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      if (aud.isExisting && aud.attId) pendingDeleteAttIds.push(aud.attId);
      if (aud.url) URL.revokeObjectURL(aud.url);
      draftAudios.splice(i, 1);
      renderAudioList();
    });

    row.appendChild(name);
    row.appendChild(play);
    row.appendChild(del);
    el.appendChild(row);
  });
}

/* ─────────────────────────────
   動画添付
───────────────────────────── */
function addVideoToDraft(file, name) {
  if (file.size > 20 * 1024 * 1024) {
    showToast('動画サイズが大きすぎます(上限20MB)');
    return;
  }
  const url = URL.createObjectURL(file);
  objURLs.push(url);
  draftVideos.push({
    tempId: crypto.randomUUID(),
    blob: file,
    url,
    name: name || 'video.mp4',
    isExisting: false
  });
  renderVideoList();
}

async function loadExistingVideos(itemId) {
  const atts = await dbGetAttachments(itemId);
  atts
    .filter(a => a.type === 'video')
    .forEach(a => {
      const url = URL.createObjectURL(a.blob);
      objURLs.push(url);
      draftVideos.push({
        tempId: crypto.randomUUID(),
        blob: a.blob,
        url,
        name: a.name,
        isExisting: true,
        attId: a.id
      });
    });
  renderVideoList();
}

function renderVideoList() {
  const el = document.getElementById('videoList');
  el.innerHTML = '';

  draftVideos.forEach((vid, i) => {
    const row = document.createElement('div');
    row.className = 'video-row';

    const name = document.createElement('span');
    name.className = 'video-name';
    name.textContent = vid.name;

    const play = document.createElement('button');
    play.className = 'video-play-btn';
    play.textContent = '▶︎';
    play.addEventListener('click', () => {
      const video = document.createElement('video');
      video.src = vid.url;
      video.controls = true;
      video.style.width = '100%';
      const overlay = document.createElement('div');
      overlay.className = 'video-preview-overlay';
      overlay.appendChild(video);
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
      video.play();
    });

    const del = document.createElement('button');
    del.className = 'video-del-btn';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      if (vid.isExisting && vid.attId) pendingDeleteAttIds.push(vid.attId);
      URL.revokeObjectURL(vid.url);
      draftVideos.splice(i, 1);
      renderVideoList();
    });

    row.appendChild(name);
    row.appendChild(play);
    row.appendChild(del);
    el.appendChild(row);
  });
}

async function saveVideoAttachments(itemId) {
  for (const vid of draftVideos) {
    if (!vid.isExisting) {
      await dbPutAttachment({
        id: crypto.randomUUID(),
        itemId,
        type: 'video',
        blob: vid.blob,
        mimeType: vid.blob.type || 'video/mp4',
        name: vid.name,
        createdAt: Date.now()
      });
    }
  }
}

/* ─────────────────────────────
   music-suite 連携
───────────────────────────── */
document.getElementById('musicSuiteBtn').addEventListener('click', () => {
  let data = null;

  if (location.hash.startsWith('#import=')) {
    try {
      data = JSON.parse(atob(location.hash.slice(8)));
      history.replaceState(null, '', location.pathname);
    } catch (_) {}
  }

  if (!data) {
    for (const k of ['ms_transfer', 'music_transfer', 'ms_export']) {
      const r = localStorage.getItem(k);
      if (r) {
        try {
          data = JSON.parse(r);
          localStorage.removeItem(k);
          break;
        } catch (_) {}
      }
    }
  }

  if (!data) {
    alert('music-suiteからの転送データが見つかりません。');
    return;
  }

  const name = `${data.source || 'music-suite'} ${data.key || ''}${
    data.bpm ? ' ' + data.bpm + 'BPM' : ''
  }`.trim();

  const jsonBlob = new Blob([JSON.stringify(data)], {
    type: 'application/json'
  });

  draftAudios.push({
    tempId: crypto.randomUUID(),
    blob: jsonBlob,
    url: null,
    name,
    type: 'music-ref',
    meta: { bpm: data.bpm, key: data.key, source: data.source },
    isExisting: false
  });

  renderAudioList();
});
/* ─────────────────────────────
   関連項目（AI + 自動検出）
───────────────────────────── */
function extractNgrams(text, n = 2) {
  const t = (text || '').toLowerCase().replace(/[\s\u3000]+/g, '');
  const g = new Set();
  for (let i = 0; i <= t.length - n; i++) g.add(t.slice(i, i + n));
  return g;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  const i = [...a].filter(x => b.has(x)).length;
  return i / new Set([...a, ...b]).size;
}

function relatedScore(a, b) {
  if (a.id === b.id) return 0;

  const ts = jaccard(new Set(a.tags || []), new Set(b.tags || []));
  const getT = it => {
    const c = decryptedCache.get(it.id);
    return `${it.title || ''} ${c ? c.body : it.body || ''} ${(it.tags || []).join(' ')}`;
  };
  const tx = jaccard(extractNgrams(getT(a), 2), extractNgrams(getT(b), 2));

  return Math.round((ts * 60 + tx * 40) * 100);
}

function findRelated(item, limit = 5) {
  return allItems
    .filter(it => it.id !== item.id)
    .map(it => ({ item: it, score: relatedScore(item, it) }))
    .filter(x => x.score > 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function renderRelatedItems(item) {
  const el = document.getElementById('relatedSection');
  if (!el) return;

  const confirmed = getLinkedItems(item.id);
  const cIds = new Set(confirmed.map(c => c.id));
  const auto = findRelated(item, 6).filter(r => !cIds.has(r.item.id));

  if (!confirmed.length && !auto.length) {
    el.innerHTML = '<p class="related-empty">関連する項目が自動検出されませんでした。</p>';
    setupAiRelatedBtn(item);
    return;
  }

  const mkCard = (relItem, score, isConf) => {
    const cached = decryptedCache.get(relItem.id);
    const snippet = relItem.sensitive
      ? '🔒 保護中'
      : ((cached ? cached.body : relItem.body || '').replace(/<[^>]+>/g, '').slice(0, 45));

    const tagsHtml = (relItem.tags || [])
      .map(t => `<span class="related-tag">#${escapeHtml(t)}</span>`)
      .join('');

    return `
      <div class="related-card${isConf ? ' confirmed' : ''}" data-id="${relItem.id}">
        <div class="related-main">
          <div class="related-header">
            <span class="related-icon">${isConf ? '🔗' : '💭'}</span>
            <span class="related-title">${escapeHtml(relItem.title || '(無題)')}</span>
            ${score != null ? `<span class="related-score">${score}%</span>` : ''}
          </div>
          ${snippet ? `<div class="related-snippet">${escapeHtml(snippet)}</div>` : ''}
          ${tagsHtml ? `<div class="related-tags">${tagsHtml}</div>` : ''}
        </div>
        <div class="related-actions">
          <button class="related-open-btn" data-id="${relItem.id}">→</button>
          ${
            isConf
              ? `<button class="related-unlink-btn" data-id="${relItem.id}">×</button>`
              : `<button class="related-link-btn" data-id="${relItem.id}">🔗</button>`
          }
        </div>
      </div>`;
  };

  el.innerHTML =
    confirmed.map(it => mkCard(it, null, true)).join('') +
    auto.map(r => mkCard(r.item, r.score, false)).join('');

  el.querySelectorAll('.related-open-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      closeSheet();
      await openEdit(btn.dataset.id);
    })
  );

  el.querySelectorAll('.related-link-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      addLink(item.id, btn.dataset.id);
      renderRelatedItems(item);
      renderAll();
    })
  );

  el.querySelectorAll('.related-unlink-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!confirm('このリンクを削除しますか？')) return;
      removeLink(item.id, btn.dataset.id);
      renderRelatedItems(item);
      renderAll();
    })
  );

  setupAiRelatedBtn(item);
}

/* ─────────────────────────────
   AI 関連項目ボタン
───────────────────────────── */
function setupAiRelatedBtn(item) {
  const btn = document.getElementById('aiRelatedBtn');
  if (!btn) return;

  btn.onclick = async () => {
    const geminiKey = localStorage.getItem('ml_gemini');
    const claudeKey = localStorage.getItem('ml_claude');
    const proxyUrl = localStorage.getItem('kansei_proxy_url');
    const openaiKey = localStorage.getItem('ml_openai');

    if (!geminiKey && !claudeKey && !proxyUrl && !openaiKey) {
      alert('APIキーが設定されていません。⚙️設定から入力してください。');
      return;
    }

    btn.disabled = true;
    btn.textContent = '✨ 検索中…';

    try {
      const candidates = allItems
        .filter(it => it.id !== item.id && !it.sensitive)
        .slice(0, 60)
        .map(it => `${it.id.slice(0, 8)}: ${it.title} [${(it.tags || []).join(',')}]`)
        .join('\n');

      const prompt = `以下の「対象項目」と意味的に関連する項目を「候補一覧」から選んでください。
対象: タイトル: ${item.title} タグ: ${(item.tags || []).join(', ')}
候補:
${candidates}

IDプレフィックス(8文字)を最大5つ、JSON配列のみ返してください:
["xxxxxxxx"]`;

      let raw = '';

      if (geminiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }]
            })
          }
        );
        const d = await res.json();
        raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      } else {
        const ep = proxyUrl || 'https://api.anthropic.com/v1/messages';
        const headers = { 'Content-Type': 'application/json' };
        if (!proxyUrl && claudeKey) {
          headers['x-api-key'] = claudeKey;
          headers['anthropic-version'] = '2023-06-01';
        }
        const res = await fetch(ep, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 256,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const d = await res.json();
        raw = d.content?.[0]?.text || '[]';
      }

      const ids = JSON.parse(raw.replace(/```json|```/g, '').trim());
      let added = 0;

      ids.forEach(sid => {
        const found = allItems.find(it => it.id.startsWith(sid) && it.id !== item.id);
        if (found && !(getLinks()[item.id] || []).includes(found.id)) {
          addLink(item.id, found.id);
          added++;
        }
      });

      renderRelatedItems(item);
      renderAll();

      btn.textContent = added > 0 ? `✨ ${added}件のつながりを発見` : '✨ 新たなつながりなし';
    } catch (e) {
      alert(`AI検索失敗: ${e.message}`);
      btn.textContent = '✨ AIでさらに探す';
    } finally {
      btn.disabled = false;
    }
  };
}

/* ─────────────────────────────
   AIモデル設定
───────────────────────────── */
const LS = {
  CLAUDE: 'ml_claude',
  GEMINI: 'ml_gemini',
  OPENAI: 'ml_openai',
  PROXY: 'kansei_proxy_url',
  MODEL: 'kansei_model'
};

const MODELS = {
  claude: {
    label: 'Claude',
    detail: 'claude-sonnet-4-6',
    endpoint: 'https://api.anthropic.com/v1/messages'
  },
  gemini: {
    label: 'Gemini',
    detail: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
  },
  openai: {
    label: 'OpenAI',
    detail: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions'
  }
};

let activeModel = localStorage.getItem(LS.MODEL) || 'claude';
let lastAiResult = '';

const AI_PROMPTS = {
  summarize: t => `以下のメモを3行で要約してください。\n\n${t}`,
  organize: t => `以下のメモを見出しと箇条書きで整理してください。\n\n${t}`,
  expand:   t => `以下のメモを補足して理解を深める内容にしてください。\n\n${t}`,
  question: t => `以下のメモを学習するための質問を5つ生成してください。\n\n${t}`
};

/* ─────────────────────────────
   AI呼び出し
───────────────────────────── */
async function callAI(userPrompt) {
  const proxyUrl = localStorage.getItem(LS.PROXY) || '';
  const m = MODELS[activeModel];
  const apiKey = localStorage.getItem(LS[activeModel.toUpperCase()]) || '';

  if (!apiKey && !proxyUrl) {
    throw new Error(`${m.label}のAPIキーが未設定です`);
  }

  if (activeModel === 'gemini') {
    const res = await fetch(`${m.endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userPrompt }] }]
      })
    });
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (activeModel === 'openai') {
    const res = await fetch(m.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content || '';
  }

  const ep = proxyUrl || m.endpoint;
  const headers = { 'Content-Type': 'application/json' };
  if (!proxyUrl && apiKey) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  const res = await fetch(ep, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });
  const d = await res.json();
  return d.content?.[0]?.text || '';
}

/* ─────────────────────────────
   AI構造化（音声 → メモ）
───────────────────────────── */
async function callStructureAPI(text) {
  const prompt = `以下の話し言葉のメモを、クイック参照アプリ用のデータに整理してください。
必ずJSONのみ返してください:
{"title":"一行タイトル","tags":["タグ1","タグ2"],"body":"詳細メモ","fields":[{"key":"項目名","value":"値"}]}

ルール:
- title 15字以内
- tags 2〜4個
- fields は構造化できるものだけ（なければ空配列）

既存タグ候補: ${getAllTagsSorted().slice(0, 10).join(',')}
メモ: ${text}`;

  const result = await callAI(prompt).catch(() => null);
  if (!result) {
    return {
      title: text.slice(0, 30),
      tags: [],
      body: text,
      fields: []
    };
  }

  try {
    return JSON.parse(result.replace(/```json|```/g, '').trim());
  } catch (_) {
    return {
      title: text.slice(0, 30),
      tags: [],
      body: text,
      fields: []
    };
  }
}

/* ─────────────────────────────
   iCloud 保存 / 自動同期
───────────────────────────── */
const ICLOUD_AUTO_KEY = 'qr_icloud_auto';

async function doExport() {
  const payload = {
    exportedAt: Date.now(),
    items: allItems,
    attachments: attachmentMeta
  };
  const blob = new Blob([JSON.stringify(payload)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = `quick-ref-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  document.getElementById('icloudGuideFilename').textContent = filename;
  document.getElementById('icloudGuide').classList.add('open');
}

async function doImport(file) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);

    const items = json.items || [];
    const atts = json.attachments || [];

    let count = 0;
    for (const item of items) {
      if (!item.id) item.id = crypto.randomUUID();
      await dbPut(item);
      count++;
    }

    for (const a of atts) {
      if (!a.id) a.id = crypto.randomUUID();
      await dbPutAttachment(a);
    }

    await reload();
    return { ok: true, msg: `${count}件をインポートしました` };
  } catch (e) {
    return { ok: false, msg: 'インポートに失敗しました' };
  }
}

async function saveToiCloud() {
  try {
    await doExport();
    showToast('iCloud Drive に保存しました');
  } catch (_) {
    showToast('保存に失敗しました');
  }
}

function setupPeriodicSync() {
  localStorage.setItem(ICLOUD_AUTO_KEY, '1');
  updateAutoToggleBtn();
  showToast('自動保存を有効化しました');
}

function cancelPeriodicSync() {
  localStorage.removeItem(ICLOUD_AUTO_KEY);
  updateAutoToggleBtn();
  showToast('自動保存を停止しました');
}

function updateiCloudStatus() {
  const desc = document.getElementById('icloudMenuDesc');
  if (localStorage.getItem(ICLOUD_AUTO_KEY)) {
    desc.textContent = '自動保存 ON（定期的にバックアップ）';
  } else {
    desc.textContent = 'ファイルアプリ経由で自動バックアップ';
  }
}

function updateAutoToggleBtn() {
  const btn = document.getElementById('icloudAutoToggleBtn');
  if (!btn) return;
  const on = !!localStorage.getItem(ICLOUD_AUTO_KEY);
  btn.textContent = on ? '✅ 自動保存ON' : '⏰ 自動保存設定';
  btn.style.background = on ? 'rgba(52,199,89,0.12)' : '';
  btn.style.color = on ? '#1A8C3A' : '';
  btn.style.borderColor = on ? 'rgba(52,
    btn.style.borderColor = on ? 'rgba(52,199,89,0.3)' : '';
}

/* ─────────────────────────────
   Siri Shortcuts ガイド
───────────────────────────── */
function showSiriShortcutGuide() {
  const base = location.origin + location.pathname;
  const msg = [
    '【Siri Shortcuts 設定手順】',
    '',
    '① ショートカットアプリを開く',
    '② 右上（＋）→「アクションを追加」',
    '③「URLを開く」を追加',
    '④ 以下のURLを入力：',
    '',
    '  ⚡ 即保存(推奨): ' +
      base +
      '?shortcut=quicksave&text=[ここに「テキストを入力」変数を挿入]',
    '  音声追加: ' + base + '?shortcut=voice',
    '  カメラ追加: ' + base + '?shortcut=camera',
    '  新規追加: ' + base + '?shortcut=new',
    '  レビュー: ' + base + '?shortcut=review',
    '',
    '⑤ Siriフレーズを設定（例：「参照に追加」）',
    '',
    '設定後「Hey Siri、参照に追加」で即起動します。',
    '',
    '【⚡即保存の作り方】',
    'ショートカット手順を「テキストを入力」→「URLエンコード」',
    '→「URLを開く」の順に組むと、確認画面なしで一発保存できます。'
  ].join('\n');
  alert(msg);
}

/* ─────────────────────────────
   Shortcut URL パラメータ処理
───────────────────────────── */
function checkShortcutParam() {
  const params = new URLSearchParams(location.search);
  const sc = params.get('shortcut');
  if (!sc) return;

  const quickText = params.get('text') || '';
  history.replaceState(null, '', location.pathname + (location.hash || ''));

  if (sc === 'quicksave') {
    quickSaveText(quickText);
    return;
  }

  setTimeout(() => {
    if (sc === 'voice') openVoiceModal();
    if (sc === 'camera') {
      openNew();
      setTimeout(() => document.getElementById('imgCameraInput').click(), 300);
    }
    if (sc === 'new') openNew();
    if (sc === 'review') openReview();
    if (sc === 'export') saveToiCloud();
  }, 600);
}

/* ─────────────────────────────
   Siriショートカット：即保存
───────────────────────────── */
async function quickSaveText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    showToast('保存する内容が空です');
    return;
  }

  const lines = trimmed.split('\n');
  const now = Date.now();

  const item = {
    id: crypto.randomUUID(),
    title: (lines[0] || '無題').slice(0, 60),
    tags: [],
    body: escapeHtml(trimmed).replace(/\n/g, '<br>'),
    fields: [],
    url: '',
    sensitive: false,
    createdAt: now,
    updatedAt: now
  };

  await dbPut(item);
  window.QuickRefBridge?.onItemSaved(item);
  await reload();
  syncEcosystemTags();
  showToast('⚡ 保存しました: ' + item.title);
}

/* ─────────────────────────────
   Service Worker メッセージ受信
───────────────────────────── */
function setupSWMessages() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SW_SYNC_ICLOUD') saveToiCloud();
    if (e.data?.type === 'TRIGGER_ICLOUD_EXPORT') saveToiCloud();
  });
}

/* ─────────────────────────────
   リンク（関連項目）
───────────────────────────── */
const LINKS_KEY = 'qr_links';

function getLinks() {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function addLink(fromId, toId) {
  const l = getLinks();
  [fromId, toId].forEach(a => {
    const b = a === fromId ? toId : fromId;
    if (!l[a]) l[a] = [];
    if (!l[a].includes(b)) l[a].push(b);
  });
  localStorage.setItem(LINKS_KEY, JSON.stringify(l));
}

function removeLink(fromId, toId) {
  const l = getLinks();
  l[fromId] = (l[fromId] || []).filter(i => i !== toId);
  l[toId] = (l[toId] || []).filter(i => i !== fromId);
  localStorage.setItem(LINKS_KEY, JSON.stringify(l));
}

function getLinkedItems(itemId) {
  return allItems.filter(it => (getLinks()[itemId] || []).includes(it.id));
}

/* ─────────────────────────────
   設定画面
───────────────────────────── */
function loadSettings() {
  document.getElementById('sClaudeKey').value =
    localStorage.getItem(LS.CLAUDE) || '';
  document.getElementById('sGeminiKey').value =
    localStorage.getItem(LS.GEMINI) || '';
  document.getElementById('sOpenAIKey').value =
    localStorage.getItem(LS.OPENAI) || '';
  document.getElementById('sProxyUrl').value =
    localStorage.getItem(LS.PROXY) || '';

  activeModel = localStorage.getItem(LS.MODEL) || 'claude';
  renderModelSelect();
  updateAIBadge();
}

function saveSettings() {
  ['Claude', 'Gemini', 'OpenAI'].forEach(n => {
    const v = document.getElementById(`s${n}Key`).value.trim();
    if (v) localStorage.setItem(LS[n.toUpperCase()], v);
    else localStorage.removeItem(LS[n.toUpperCase()]);
  });

  const p = document.getElementById('sProxyUrl').value.trim();
  if (p) localStorage.setItem(LS.PROXY, p);
  else localStorage.removeItem(LS.PROXY);

  localStorage.setItem(LS.MODEL, activeModel);
  updateAIBadge();
  closeSettingsSheet();
  showToast('設定を保存しました');
}

function renderModelSelect() {
  document.querySelectorAll('.model-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.model === activeModel)
  );
  const m = MODELS[activeModel];
  document.getElementById('modelDetail').textContent =
    m ? `使用モデル: ${m.detail}` : '';
}

function updateAIBadge() {
  const m = MODELS[activeModel];
  const b = document.getElementById('aiModelBadge');
  if (b) b.textContent = m ? m.label : activeModel;
}

/* ─────────────────────────────
   AIパネル
───────────────────────────── */
function openAIPanel() {
  document.getElementById('aiPanel').classList.add('open');
}
function closeAIPanel() {
  document.getElementById('aiPanel').classList.remove('open');
}

function getEditorText() {
  const e = document.getElementById('memoPopupEditor');
  return e.innerText || e.textContent || '';
}

/* ─────────────────────────────
   AI実行
───────────────────────────── */
async function runAIAction(action, customPrompt) {
  const editorText = getEditorText();
  if (!editorText.trim() && !customPrompt) {
    showToast('メモにテキストを入力してください');
    return;
  }

  const prompt = customPrompt
    ? `${customPrompt}\n\n---\n${editorText}`
    : AI_PROMPTS[action]?.(editorText) || editorText;

  document.getElementById('aiLoading').style.display = 'block';
  document.getElementById('aiResult').style.display = 'none';
  document.getElementById('aiResultActions').classList.remove('visible');
  document.querySelectorAll('.ai-action-btn').forEach(b =>
    b.classList.add('loading')
  );

  try {
    const result = await callAI(prompt);
    lastAiResult = result;

    const el = document.getElementById('aiResult');
    el.textContent = result;
    el.style.display = 'block';

    document.getElementById('aiResultActions').classList.add('visible');
    document.getElementById('aiResultActions').style.display = 'flex';
  } catch (e) {
    showToast(e.message);
  } finally {
    document.getElementById('aiLoading').style.display = 'none';
    document.querySelectorAll('.ai-action-btn').forEach(b =>
      b.classList.remove('loading')
    );
  }
}

/* ─────────────────────────────
   AI結果挿入
───────────────────────────── */
function insertAIResult(replace = false) {
  const editor = document.getElementById('memoPopupEditor');
  editor.focus();

  if (replace) {
    editor.innerHTML = lastAiResult.replace(/\n/g, '<br>');
  } else {
    const hr = document.createElement('hr');
    hr.style.cssText =
      'border:none;border-top:1px solid var(--border);margin:12px 0;';
    const div = document.createElement('div');
    div.innerHTML = lastAiResult.replace(/\n/g, '<br>');
    editor.appendChild(hr);
    editor.appendChild(div);
    editor.scrollTop = editor.scrollHeight;
  }

  closeAIPanel();
  showToast('メモに挿入しました');
}
/* ─────────────────────────────
   EVENT WIRING（イベント接続）
───────────────────────────── */
function wireEvents() {
  /* Quick Dock */
  document.getElementById('fabBtn').addEventListener('click', () => {
    haptic();
    openNew();
  });

  document.getElementById('voiceFab').addEventListener('click', () => {
    haptic();
    openVoiceModal();
  });

  document.getElementById('dockCam').addEventListener('click', () => {
    haptic();
    if (!document.getElementById('editSheet').classList.contains('open')) openNew();
    setTimeout(() => document.getElementById('imgCameraInput').click(), 200);
  });

  document.getElementById('dockPhoto').addEventListener('click', () => {
    haptic();
    if (!document.getElementById('editSheet').classList.contains('open')) openNew();
    setTimeout(() => document.getElementById('imgFileInput').click(), 200);
  });

  document.getElementById('dockVideo').addEventListener('click', () => {
    haptic();
    if (!document.getElementById('editSheet').classList.contains('open')) openNew();
    setTimeout(() => document.getElementById('videoCamInput').click(), 200);
  });

  /* Overlay */
  document.getElementById('overlay').addEventListener('click', () => {
    closeSheet();
    closeSettingsSheet();
  });

  /* Sheet Buttons */
  document.getElementById('cancelBtn').addEventListener('click', closeSheet);
  document.getElementById('saveBtn').addEventListener('click', saveItem);
  document.getElementById('deleteBtn').addEventListener('click', deleteItem);

  /* URL Preview */
  document.getElementById('previewUrlBtn').addEventListener('click', () => {
    const u = document.getElementById('inputUrl').value.trim();
    if (u) window.open(u, '_blank');
  });

  /* Search */
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.classList.toggle('visible', !!searchQuery);
    renderAll();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.remove('visible');
    searchInput.focus();
    renderAll();
  });

  /* Tags */
  document.getElementById('tagAddBtn').addEventListener('click', commitTagInput);
  document.getElementById('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTagInput();
    }
  });
  document.getElementById('tagInput').addEventListener('input', renderTagSuggestions);

  /* Fields */
  document.getElementById('addFieldBtn').addEventListener('click', () => {
    draftFields.push({ key: '', value: '' });
    renderFieldRows();
  });

  document.getElementById('sensitiveToggle').addEventListener('change', e => {
    draftSensitive = e.target.checked;
  });

  /* 画像添付 */
  document.getElementById('imgPickBtn').addEventListener('click', () => {
    haptic();
    document.getElementById('imgFileInput').click();
  });

  document.getElementById('imgCameraBtn').addEventListener('click', () => {
    haptic();
    document.getElementById('imgCameraInput').click();
  });

  document.getElementById('imgSelfieBtn').addEventListener('click', () => {
    haptic();
    document.getElementById('imgSelfieInput').click();
  });

  document.getElementById('imgIllustBtn').addEventListener('click', tryImportFromIllustStudio);

  /* 画像ファイル入力 */
  document.getElementById('imgFileInput').addEventListener('change', async e => {
    await handleImgFiles(e.target.files);
    e.target.value = '';
  });

  document.getElementById('imgCameraInput').addEventListener('change', async e => {
    if (e.target.files[0]) {
      const b = await resizeImage(e.target.files[0]);
      addBlobToDraft(b, e.target.files[0].name);
    }
    e.target.value = '';
  });

  document.getElementById('imgSelfieInput').addEventListener('change', async e => {
    if (e.target.files[0]) {
      const b = await resizeImage(e.target.files[0]);
      addBlobToDraft(b, e.target.files[0].name);
    }
    e.target.value = '';
  });

  /* 動画添付 */
  document.getElementById('videoCamBtn').addEventListener('click', () => {
    haptic();
    document.getElementById('videoCamInput').click();
  });

  document.getElementById('videoPickBtn').addEventListener('click', () => {
    haptic();
    document.getElementById('videoFileInput').click();
  });

  document.getElementById('videoCamInput').addEventListener('change', e => {
    if (e.target.files[0]) addVideoToDraft(e.target.files[0], e.target.files[0].name);
    e.target.value = '';
  });

  document.getElementById('videoFileInput').addEventListener('change', e => {
    Array.from(e.target.files).forEach(f => addVideoToDraft(f, f.name));
    e.target.value = '';
  });

  /* ペースト画像 */
  document.querySelector('.sheet-body').addEventListener('paste', async e => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = await resizeImageBlob(item.getAsFile());
        addBlobToDraft(blob, `paste-${Date.now()}.jpg`);
        showToast('画像を貼り付けました');
        return;
      }
    }
  });

  /* 共有バナー */
  document.getElementById('shareReceivedUse').addEventListener('click', () => {
    haptic();
    useSharedText();
  });

  document.getElementById('shareReceivedDismiss').addEventListener('click', () => {
    document.getElementById('shareReceivedBanner').classList.remove('show');
    sharedText = null;
  });

  /* 音声録音 */
  document.getElementById('recStartBtn').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks = [];
      recSeconds = 0;

      const mimeType = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerInterval);
        recTimerInterval = null;
        document.getElementById('recStatus').classList.remove('active');

        const blob = new Blob(recChunks, {
          type: mediaRecorder.mimeType || 'audio/mp4'
        });
        const ext = (mediaRecorder.mimeType || 'audio/mp4').includes('webm')
          ? 'webm'
          : 'm4a';

        addAudioToDraft(
          blob,
          `録音-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}`
        );

        mediaRecorder = null;
        recChunks = [];
      };

      mediaRecorder.start(500);
      document.getElementById('recStatus').classList.add('active');
      document.getElementById('recTimer').textContent = '00:00';

      recTimerInterval = setInterval(() => {
        recSeconds++;
        document.getElementById('recTimer').textContent = formatTime(recSeconds);
      }, 1000);
    } catch (_) {
      showToast('マイクへのアクセスが許可されていません');
    }
  });

  document.getElementById('recStopBtn').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  });

  /* music-suite */
  document.getElementById('musicSuiteBtn').addEventListener('click', () => {
    let data = null;

    if (location.hash.startsWith('#import=')) {
      try {
        data = JSON.parse(atob(location.hash.slice(8)));
        history.replaceState(null, '', location.pathname);
      } catch (_) {}
    }

    if (!data) {
      for (const k of ['ms_transfer', 'music_transfer', 'ms_export']) {
        const r = localStorage.getItem(k);
        if (r) {
          try {
            data = JSON.parse(r);
            localStorage.removeItem(k);
            break;
          } catch (_) {}
        }
      }
    }

    if (!data) {
      alert('music-suiteからの転送データが見つかりません。');
      return;
    }

    const name = `${data.source || 'music-suite'} ${data.key || ''}${
      data.bpm ? ' ' + data.bpm + 'BPM' : ''
    }`.trim();

    const jsonBlob = new Blob([JSON.stringify(data)], {
      type: 'application/json'
    });

    draftAudios.push({
      tempId: crypto.randomUUID(),
      blob: jsonBlob,
      url: null,
      name,
      type: 'music-ref',
      meta: { bpm: data.bpm, key: data.key, source: data.source },
      isExisting: false
    });

    renderAudioList();
  });

  /* メモ全画面 */
  document.getElementById('expandMemoBtn').addEventListener('click', openMemoPopup);
  document.getElementById('memoPopupClose').addEventListener('click', closeMemoPopup);
  document.getElementById('memoPopupClear').addEventListener('click', () => {
    document.execCommand('removeFormat');
    document.getElementById('memoPopupEditor').focus();
  });

  /* 音声 → AI解析 */
  document.getElementById('voiceStopBtn').addEventListener('click', () => {
    stopVoiceRec();
    document.getElementById('voiceAnalyzeBtn').disabled =
      voiceFullText.trim().length === 0;
  });

  document.getElementById('voiceCancelBtn').addEventListener('click', closeVoiceModal);

  document.getElementById('voiceModal').addEventListener('click', e => {
    if (e.target === document.getElementById('voiceModal')) closeVoiceModal();
  });

  document.getElementById('voiceAnalyzeBtn').addEventListener('click', async () => {
    const text = voiceFullText.trim();
    if (!text) return;

    document.getElementById('voiceAnalyzeBtn').disabled = true;
    document.getElementById('voiceAnalyzeBtn').textContent = '✨ 解析中…';
    stopVoiceRec();

    try {
      const r = await callStructureAPI(text);
      renderAIPreview(r);
    } catch (e) {
      alert(`AI解析に失敗しました:\n${e.message}`);
      document.getElementById('voiceAnalyzeBtn').disabled = false;
      document.getElementById('voiceAnalyzeBtn').textContent = '✨ AI で整理する';
    }
  });

  document.getElementById('aiSaveBtn').addEventListener('click', async () => {
    const title = document.getElementById('aiTitle').value.trim();
    if (!title) return;

    const tags = [
      ...document.getElementById('aiTagsRow').querySelectorAll('[data-tag]')
    ].map(el => el.dataset.tag);

    const now = Date.now();

    await dbPut({
      id: crypto.randomUUID(),
      title,
      tags,
      body: document.getElementById('aiBody').value.trim(),
      fields: [],
      url: '',
      sensitive: false,
      createdAt: now,
      updatedAt: now
    });

    await reload();
    syncEcosystemTags();
    closeVoiceModal();
  });

  /* PIN */
  document.getElementById('lockToggleBtn').addEventListener('click', async () => {
    if (sessionKey) lockSession();
    else await ensureUnlocked();
  });

  document.getElementById('pinCancelBtn').addEventListener('click', () =>
    closePinModal(false)
  );

  document.getElementById('pinOverlay').addEventListener('click', () =>
    closePinModal(false)
  );

  document.getElementById('pinConfirmBtn').addEventListener('click', async () => {
    const v1 = document.getElementById('pinInput1').value;
    const v2 = document.getElementById('pinInput2').value;

    if (!v1) {
      document.getElementById('pinError').textContent = 'パスコードを入力してください';
      document.getElementById('pinError').style.display = 'block';
      return;
    }

    if (pinMode === 'setup') {
      if (v1.length < 4) {
        document.getElementById('pinError').textContent = '4文字以上で入力してください';
        document.getElementById('pinError').style.display = 'block';
        return;
      }
      if (v1 !== v2) {
        document.getElementById('pinError').textContent = '確認用と一致しません';
        document.getElementById('pinError').style.display = 'block';
        return;
      }
      await setupPin(v1);
    } else {
      const ok = await tryUnlockWithPin(v1);
      if (!ok) {
        document.getElementById('pinError').textContent = 'パスコードが違います';
        document.getElementById('pinError').style.display = 'block';
        return;
      }
    }

    await refreshDecryptedCache();
    updateLockButton();
    closePinModal(true);
    renderAll();
  });

  document.getElementById('pinForgotBtn').addEventListener('click', async () => {
    if (!confirm('パスコードをリセットすると保護された項目はすべて削除されます。続行しますか？'))
      return;

    const sensitiveItems = allItems.filter(it => it.sensitive);
    for (const it of sensitiveItems) await dbDelete(it.id);

    localStorage.removeItem(PIN_META_KEY);
    sessionKey = null;
    decryptedCache.clear();

    await reload();
    updateLockButton();
    closePinModal(false);

    alert('パスコードと保護された項目をリセットしました。');
  });

  /* iCloud / Shortcuts */
  document.getElementById('icloudSaveBtn').addEventListener('click', () => {
    haptic();
    saveToiCloud();
  });

  document.getElementById('icloudAutoToggleBtn').addEventListener('click', () => {
    haptic();
    if (localStorage.getItem(ICLOUD_AUTO_KEY)) cancelPeriodicSync();
    else setupPeriodicSync();
  });

  document.getElementById('siriShortcutBtn').addEventListener('click', () =>
    showSiriShortcutGuide()
  );

  document.getElementById('icloudMenuBtn').addEventListener('click', () => {
    closeMenu();
    saveToiCloud();
  });

  document.getElementById('icloudGuideClose')?.addEventListener('click', () =>
    document.getElementById('icloudGuide').classList.remove('open')
  );

  document.getElementById('icloudGuide')?.addEventListener('click', e => {
    if (e.target === document.getElementById('icloudGuide'))
      document.getElementById('icloudGuide').classList.remove('open');
  });

  /* Settings */
  document.getElementById('settingsBtn').addEventListener('click', openSettingsSheet);
  document.getElementById('settingsCancelBtn').addEventListener('click', closeSettingsSheet);
  document.getElementById('settingsSaveBtn').addEventListener('click', saveSettings);

  document.querySelectorAll('.model-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      activeModel = btn.dataset.model;
      renderModelSelect();
    })
  );

  document.getElementById('sendToEcoBtn').addEventListener('click', () => {
    sendToEcosystem();
    closeSettingsSheet();
  });

  /* AIパネル */
  document.getElementById('memoAiBtn').addEventListener('click', openAIPanel);
  document.getElementById('aiPanelClose').addEventListener('click', closeAIPanel);

  document.querySelectorAll('.ai-action-btn').forEach(btn =>
    btn.addEventListener('click', () => runAIAction(btn.dataset.action))
  );

  document.getElementById('aiCustomSend').addEventListener('click', () => {
    const v = document.getElementById('aiCustomPrompt').value.trim();
    if (v) runAIAction(null, v);
  });

  document.getElementById('aiCustomPrompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = document.getElementById('aiCustomPrompt').value.trim();
      if (v) runAIAction(null, v);
    }
  });

  document.getElementById('aiInsertBtn').addEventListener('click', () =>
    insertAIResult(false)
  );

  document.getElementById('aiReplaceBtn').addEventListener('click', () =>
    insertAIResult(true)
  );

  /* Review */
  document.getElementById('reviewBtn').
    /* Review 続き */
  document.getElementById('reviewOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('reviewOverlay')) closeReview();
  });

  /* メニュー */
  document.getElementById('menuBtn').addEventListener('click', openMenu);
  document.getElementById('menuOverlay').addEventListener('click', closeMenu);

  document.getElementById('exportBtn').addEventListener('click', async () => {
    closeMenu();
    await doExport();
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    closeMenu();
    document.getElementById('importFileInput').click();
  });

  document.getElementById('importFileInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (f) {
      const r = await doImport(f);
      alert(r.msg);
    }
    e.target.value = '';
  });

  document.getElementById('tagBridgeBtn').addEventListener('click', () => {
    closeMenu();
    syncEcosystemTags();
    const tags = getAllTagsSorted();
    alert(
      tags.length > 0
        ? `${tags.length}件のタグをecosystem_tagsに書き込みました。\n\n${tags
            .map(t => '・' + t)
            .join('\n')}`
        : 'タグがまだありません。'
    );
  });

  document.getElementById('kanseiExportBtn').addEventListener('click', () => {
    closeMenu();
    sendToKansei(themeTag);
  });

  document.getElementById('iconGenBtn').addEventListener('click', () => {
    closeMenu();
    openIconModal();
  });

  document.getElementById('themeUrlBtn').addEventListener('click', () => {
    closeMenu();
    const tags = getAllTagsSorted();
    if (!tags.length) {
      alert('タグがまだありません。');
      return;
    }
    const base = location.origin + location.pathname;
    alert(
      `テーマ別URL一覧\n\n${tags
        .map(t => `${getTagEmoji(t)} #${t}\n${base}?tag=${encodeURIComponent(t)}`)
        .join('\n\n')}`
    );
  });

  document.getElementById('backupBannerBtn').addEventListener('click', doExport);

  /* アイコン生成 */
  document.getElementById('iconOverlay').addEventListener('click', closeIconModal);
  document.getElementById('iconModalClose').addEventListener('click', closeIconModal);

  document.getElementById('iconDl192').addEventListener('click', () =>
    downloadIcon(
      'iconCanvas192',
      themeTag ? `icon-${themeTag}-192.png` : 'icon-192.png'
    )
  );

  document.getElementById('iconDl512').addEventListener('click', () =>
    downloadIcon(
      'iconCanvas512',
      themeTag ? `icon-${themeTag}-512.png` : 'icon-512.png'
    )
  );

  ['iconEmoji', 'iconBgColor', 'iconBgColor2', 'iconFgColor', 'iconFontSize'].forEach(
    id => document.getElementById(id).addEventListener('input', refreshIconPreviews)
  );

  document.getElementById('themeBannerIconBtn').addEventListener('click', () => {
    if (!themeTag) return;
    const [c1, c2] = getTagColors(themeTag);
    document.getElementById('iconEmoji').value = getTagEmoji(themeTag);
    document.getElementById('iconBgColor').value = c1;
    document.getElementById('iconBgColor2').value = c2;
    document.getElementById('iconFgColor').value = '#FFFFFF';
    openIconModal();
  });

  document.getElementById('themeBannerKanseiBtn').addEventListener('click', () =>
    sendToKansei(themeTag)
  );

  document.getElementById('themeBannerAddBtn').addEventListener('click', () => {
    const tag = themeTag || '';
    const url = `${location.origin + location.pathname}?tag=${encodeURIComponent(tag)}`;
    document.getElementById('addGuideUrl').textContent = url;
    document.getElementById('addGuideTitle').textContent = `🌐 「${tag}」をホーム画面に追加`;
    document.getElementById('addGuide').classList.add('open');
  });

  document.getElementById('addGuideClose').addEventListener('click', () =>
    document.getElementById('addGuide').classList.remove('open')
  );

  document.getElementById('addGuide').addEventListener('click', e => {
    if (e.target === document.getElementById('addGuide'))
      document.getElementById('addGuide').classList.remove('open');
  });
}

/* ─────────────────────────────
   INIT（アプリ初期化）
───────────────────────────── */
async function init() {
  try {
    await openDB();
    allItems = await dbGetAll();
    attachmentMeta = await dbGetAllAttachmentMeta();

    updateLockButton();
    initThemeMode();
    renderTagFilter();
    renderAll();
    wireEvents();
    loadSettings();
    updateAIBadge();
    updateiCloudStatus();
    updateAutoToggleBtn();
    checkImportHash();
    checkIncomingTransfer();
    checkShareTarget();
    checkShortcutParam();
    setupSWMessages();
    updateBackupBanner();
    updateReviewBadge();

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

/* ─────────────────────────────
   アプリ起動
───────────────────────────── */
init();
