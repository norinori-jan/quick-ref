// illust-studio からの画像受信
const illustData = localStorage.getItem('is_transfer');
if (illustData) {
  const payload = JSON.parse(illustData);

  const img = document.createElement('img');
  img.src = payload.image;
  img.style.maxWidth = '100%';
  document.body.appendChild(img);

  const h2 = document.createElement('h2');
  h2.textContent = payload.title;
  document.body.appendChild(h2);

  localStorage.removeItem('is_transfer');
}

// music-suite からの楽曲データ受信
const msData = localStorage.getItem('ms_transfer');
if (msData) {
  const payload = JSON.parse(msData);

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(payload, null, 2);
  document.body.appendChild(pre);

  localStorage.removeItem('ms_transfer');
}

// kansei の原稿受信
const draft = localStorage.getItem('kansei_draft_result');
if (draft) {
  const payload = JSON.parse(draft);

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(payload, null, 2);
  document.body.appendChild(pre);

  localStorage.removeItem('kansei_draft_result');
}
