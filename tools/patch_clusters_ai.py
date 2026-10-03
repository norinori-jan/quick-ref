#!/usr/bin/env python3
"""「まとまり」画面に ✦ AI要約 を追加する。
 ・押したときだけ、そのまとまりの本文（保護メモ・コード行・秘密らしい行は除く）をAIに送る
 ・結果は「AI作成」の別枠に出し、利用者が 修正 → 採用 / 却下 を選ぶ（選んだ結果と根拠のメモは端末内に記録）
 ・根拠として、共通する語と、送ったメモ（タップで開ける）を見せる
リポジトリ直下で: python tools\\patch_clusters_ai.py    （cluster-items.js を新しい版に置き換えてから実行）
index.html と sw.js の想定が合わなければ、何も変更しない。
"""
from pathlib import Path
import re, sys

ix = Path('index.html').read_bytes().decode('utf-8'); NL = '\r\n' if '\r\n' in ix else '\n'
sw = Path('sw.js').read_bytes().decode('utf-8')
n = lambda s: s.replace('\n', NL)

HELPERS = n(r"""/* ── まとまりのAI要約（押したときだけ送信。AI作成の枠に出し、採用・修正・却下は利用者が選ぶ） ── */
const clusterGroups = new Map();
function clusterRow(id) {
  const i = allItems.find(x => x.id === id); if (!i) return '';
  const d = new Date(i.createdAt);
  return `<button type="button" data-cid="${escapeHtml(id)}" style="display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px">${d.getMonth() + 1}/${d.getDate()} ${escapeHtml(i.title || '(無題)')}</button>`;
}
function clusterSumKey(g) {
  const ts = g.ids.map(id => allItems.find(i => i.id === id)).filter(Boolean).map(i => i.updatedAt || i.createdAt || 0);
  return 'qr_clsum:' + g.ids[0] + ':' + g.size + ':' + Math.max(0, ...ts);
}
function sumGet(g) { try { return JSON.parse(localStorage.getItem(clusterSumKey(g)) || 'null'); } catch (_) { return null; } }
function sumSet(g, v) {
  try {
    const k = clusterSumKey(g), p = 'qr_clsum:' + g.ids[0] + ':';
    Object.keys(localStorage).filter(x => x.startsWith(p) && x !== k).forEach(x => localStorage.removeItem(x));
    if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k);
  } catch (_) {}
}
function sumInner(g, msg) {
  const st = sumGet(g), id = escapeHtml(g.ids[0]);
  if (msg) return `<div style="font-size:13px;color:#8e8e93;margin-top:6px">${escapeHtml(msg)}</div>`;
  if (!st) return '';
  const label = st.status === 'adopted' ? 'AI作成・採用済み' + (st.edited ? '（修正あり）' : '') : 'AI作成・未採用（修正して採用／却下を選んでください）';
  return `<div style="font-size:11px;color:#8e8e93;margin:6px 0 2px">✦ ${label}</div>` +
    `<textarea data-sumtext="${id}" rows="5" style="width:100%;box-sizing:border-box;font-size:13px">${escapeHtml(st.text)}</textarea>` +
    `<div><button type="button" data-sumok="${id}">採用</button> <button type="button" data-sumng="${id}">却下</button></div>` +
    `<details><summary style="font-size:12px;color:#8e8e93">根拠（共通する語・送ったメモ）</summary><div style="font-size:12px;margin:4px 0">共通する語：${(st.kw || []).map(escapeHtml).join(' · ') || '（なし）'}</div>${(st.ids || []).map(clusterRow).join('')}</details>`;
}
function clusterSumBox(g, kw) {
  clusterGroups.set(g.ids[0], { g, kw: kw || [] });
  const id = escapeHtml(g.ids[0]);
  return `<div style="border:1px dashed #8e8e93;border-radius:8px;padding:8px;margin:6px 0"><button type="button" data-sum="${id}">✦ AI要約を作る</button> <span style="font-size:11px;color:#8e8e93">押すと、このまとまりの本文をAIに送ります（保護メモ・コード行・秘密らしい行は除く）</span><div id="sum-${id}">${sumInner(g)}</div></div>`;
}
async function summarizeCluster(key) {
  const c = clusterGroups.get(key), box = document.getElementById('sum-' + key);
  if (!c || !box || !window.ClusterItems || !ClusterItems.summaryPrompt) return;
  const items = c.g.ids.map(id => allItems.find(i => i.id === id)).filter(i => i && !i.sensitive);   // 保護メモは送らない
  if (!items.length) return;
  box.innerHTML = sumInner(c.g, '要約中…');
  try {
    const out = String(await callAI(ClusterItems.summaryPrompt(items)) || '').trim();
    if (!out) throw new Error('AIから返事がありませんでした');
    sumSet(c.g, { text: out, ids: items.map(i => i.id), kw: c.kw, status: 'draft', edited: false, at: Date.now() });
    box.innerHTML = sumInner(c.g);
  } catch (e) { box.innerHTML = sumInner(c.g, '要約できませんでした：' + e.message); }
}
function adoptClusterSum(key, ok) {
  const c = clusterGroups.get(key), box = document.getElementById('sum-' + key), st = c && sumGet(c.g);
  if (!c || !box || !st) return;
  if (ok) {
    const ta = box.querySelector('textarea'), text = ta ? ta.value : st.text;
    sumSet(c.g, Object.assign({}, st, { text, edited: st.edited || text !== st.text, status: 'adopted', at: Date.now() }));
  } else sumSet(c.g, null);
  box.innerHTML = sumInner(c.g);
}
function openClusters() {
  clusterGroups.clear();""")

LISTEN_OLD = n("""  document.getElementById('clusterBody').addEventListener('click', e => {
    const b = e.target.closest('[data-cid]'); if (b) openClusterItem(b.dataset.cid);
  });""")
LISTEN_NEW = n("""  document.getElementById('clusterBody').addEventListener('click', e => {
    const s = e.target.closest('[data-sum]'); if (s) { summarizeCluster(s.dataset.sum); return; }
    const ok = e.target.closest('[data-sumok]'); if (ok) { adoptClusterSum(ok.dataset.sumok, true); return; }
    const ng = e.target.closest('[data-sumng]'); if (ng) { adoptClusterSum(ng.dataset.sumng, false); return; }
    const b = e.target.closest('[data-cid]'); if (b) openClusterItem(b.dataset.cid);
  });""")
HEAD_OLD = n("        (s.head ? note('最後のメモ：' + escapeHtml(s.head)) : '') +")
edits = [
    ('function openClusters() {', HELPERS),
    (HEAD_OLD, n("        clusterSumBox(g, s.keywords) +\n") + HEAD_OLD),
    (LISTEN_OLD, LISTEN_NEW),
]
bad = [(i + 1, ix.count(o)) for i, (o, _) in enumerate(edits) if ix.count(o) != 1]
if bad: print('中止(index.html): 置換対象が1箇所ではありません（番号, 件数）:', bad); sys.exit(1)
m = re.findall(r"qr-cache-v(\d+)", sw)
if len(m) != 1: print('中止(sw.js): キャッシュ名が想定どおりではありません。'); sys.exit(1)
out = ix
for o, nw in edits: out = out.replace(o, nw, 1)
sw2 = sw.replace('qr-cache-v' + m[0], 'qr-cache-v%d' % (int(m[0]) + 1), 1)
Path('index.html').write_bytes(out.encode('utf-8')); Path('sw.js').write_bytes(sw2.encode('utf-8'))
print('OK: index.html 3箇所を更新、キャッシュ v%s → v%d' % (m[0], int(m[0]) + 1))
