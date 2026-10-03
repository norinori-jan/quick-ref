#!/usr/bin/env python3
"""「まとまり」画面を、読みやすい2階層に作り替える（v3）。
 ・一覧＝カード（見出し・件数・期間・要約を一目で。採用済みは緑の「✓ 採用済み」、AI案は「✓ 採用／✕」を1タップ）
 ・カードをタップ＝詳細（メモ一覧・最後のメモ・次の一手・要約の修正／再要約・根拠）
 ・「未要約をまとめて要約」ボタン（押すと対象の件数を確認してから送信）
 ・保存済みのAI要約（qr_clsum:）はそのまま引き継ぐ。保存先は「この端末のみ」と画面に明記
リポジトリ直下で: python tools\\patch_clusters_v3.py     （index.html と sw.js の想定が合わなければ何も変更しない）
"""
from pathlib import Path
import re, sys

ix = Path('index.html').read_bytes().decode('utf-8'); NL = '\r\n' if '\r\n' in ix else '\n'
sw = Path('sw.js').read_bytes().decode('utf-8')
n = lambda s: s.replace('\n', NL)

NEW = n(r"""/* ── まとまり画面（一覧はカード、詳細は別画面。AI要約は「AI作成」の枠。採用・修正・却下は利用者が選ぶ） ── */
const clusterGroups = new Map();   // 先頭メモID → { g: まとまり, s: 説明 }
let clusterOpenKey = null, clusterSingles = [], clusterMeta = '', clusterListY = 0;
const cdate = ms => { const x = new Date(ms); return (x.getMonth() + 1) + '/' + x.getDate(); };
function clusterRow(id) {
  const i = allItems.find(x => x.id === id); if (!i) return '';
  return `<button type="button" data-cid="${escapeHtml(id)}" style="display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px">${cdate(i.createdAt)} ${escapeHtml(i.title || '(無題)')}</button>`;
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
const ctitle = c => c.s.keywords.length ? c.s.keywords.map(escapeHtml).join(' · ') : escapeHtml(c.g.title || '(無題)');
const cmeta = g => `${g.size}件 · ${cdate(g.from)}${g.from === g.to ? '' : '〜' + cdate(g.to)} ${g.tags.map(t => '#' + escapeHtml(t)).join(' ')}`;
const cbr = t => escapeHtml(t).replace(/\n/g, '<br>');

function cardSum(key) {
  const c = clusterGroups.get(key), st = sumGet(c.g), id = escapeHtml(key);
  if (!st) return `<button type="button" data-sum="${id}" style="padding:2px 10px">✦ 要約</button>`;
  const adopted = st.status === 'adopted';
  return `<div style="font-size:11px;margin-bottom:2px">${adopted ? '<b style="color:#34c759">✓ 採用済み</b>' : '<b style="color:#ff9500">AI案（未採用）</b>'}` +
    (adopted ? '' : `<span style="float:right"><button type="button" data-sumok="${id}">✓ 採用</button> <button type="button" data-sumng="${id}">✕</button></span>`) +
    `</div><div style="font-size:13px;line-height:1.5;clear:both">${cbr(st.text)}</div>`;
}
function clusterCard(key) {
  const c = clusterGroups.get(key), id = escapeHtml(key);
  return `<div style="border:1px solid #c7c7cc;border-radius:10px;padding:10px;margin:8px 0"><div data-open="${id}" style="cursor:pointer"><b>${ctitle(c)}</b><div style="font-size:12px;color:#8e8e93">${cmeta(c.g)} ›</div></div><div id="sum-${id}" style="margin-top:6px">${cardSum(key)}</div></div>`;
}
function clusterEntry(e) {
  if (e.type === 'item') return clusterRow(e.id);
  const a = allItems.find(x => x.id === e.ids[0]), z = allItems.find(x => x.id === e.ids[e.ids.length - 1]);
  return `<button type="button" data-cid="${escapeHtml(e.ids[e.ids.length - 1])}" style="display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px">🗂 ${escapeHtml(e.label)} ×${e.ids.length}版（${cdate(a.createdAt)}〜${cdate(z.createdAt)}）— 最新を開く</button>` +
    `<details style="margin-left:12px"><summary style="font-size:12px;color:#8e8e93">全${e.ids.length}版</summary>${e.ids.map(clusterRow).join('')}</details>`;
}
function renderClusterList() {
  const keys = [...clusterGroups.keys()], todo = keys.filter(k => !sumGet(clusterGroups.get(k).g));
  return `<p style="color:#8e8e93;font-size:12px;margin:4px 0">${clusterMeta}</p>` +
    (todo.length ? `<button type="button" data-sumall="1" style="margin:4px 0">✦ 未要約の${todo.length}件をまとめて要約</button>` : '') +
    keys.map(clusterCard).join('') +
    (clusterSingles.length ? `<div data-open="__single" style="border:1px solid #c7c7cc;border-radius:10px;padding:10px;margin:8px 0;cursor:pointer">単独のメモ（${clusterSingles.length}件） ›</div>` : '');
}
function renderClusterDetail(key) {
  if (key === '__single') return `<h3 style="margin:4px 0">単独のメモ</h3>` + clusterSingles.map(clusterRow).join('');
  const c = clusterGroups.get(key), s = c.s, st = sumGet(c.g), id = escapeHtml(key);
  const note = t => `<div style="font-size:13px;margin:6px 0;color:#8e8e93">${t}</div>`;
  const sum = st
    ? `<div style="font-size:11px;color:#8e8e93;margin-top:6px">✦ ${st.status === 'adopted' ? '<b style="color:#34c759">AI作成・採用済み</b>' + (st.edited ? '（修正あり）' : '') : '<b style="color:#ff9500">AI作成・未採用</b>（直して採用／却下）'}　※この端末のみに保存</div>` +
      `<textarea data-sumtext="${id}" rows="6" style="width:100%;box-sizing:border-box;font-size:13px">${escapeHtml(st.text)}</textarea>` +
      `<div><button type="button" data-sumok="${id}">✓ 採用</button> <button type="button" data-sumng="${id}">✕ 却下</button> <button type="button" data-sum="${id}">作り直す</button></div>` +
      `<details><summary style="font-size:12px;color:#8e8e93">根拠（共通する語・送ったメモ）</summary><div style="font-size:12px;margin:4px 0">共通する語：${(st.kw || []).map(escapeHtml).join(' · ') || '（なし）'}</div>${(st.ids || []).map(clusterRow).join('')}</details>`
    : `<button type="button" data-sum="${id}">✦ AI要約を作る</button> <span style="font-size:11px;color:#8e8e93">押すと、このまとまりの本文をAIに送ります（保護メモ・コード行・秘密らしい行は除く）</span>`;
  return `<h3 style="margin:4px 0">${ctitle(c)}</h3><div style="font-size:12px;color:#8e8e93">${cmeta(c.g)}</div>` +
    `<div id="sum-${id}" style="border:1px dashed #8e8e93;border-radius:8px;padding:8px;margin:8px 0">${sum}</div>` +
    (s.head ? note('最後のメモ：' + escapeHtml(s.head)) : '') +
    (s.next.length ? note('次の一手・未解決：<br>' + s.next.map(escapeHtml).join('<br>')) : '') +
    s.entries.map(clusterEntry).join('');
}
function renderCluster(keepY) {
  const view = document.getElementById('clusterView'), body = document.getElementById('clusterBody'), y = view.scrollTop;
  body.innerHTML = clusterOpenKey ? renderClusterDetail(clusterOpenKey) : renderClusterList();
  view.scrollTop = keepY ? y : 0;
}
function openClusterDetail(key) { clusterListY = document.getElementById('clusterView').scrollTop; clusterOpenKey = key; renderCluster(false); }
function clusterBack() {
  if (!clusterOpenKey) { closeClusters(); return; }
  clusterOpenKey = null; renderCluster(false); document.getElementById('clusterView').scrollTop = clusterListY;
}
async function summarizeCluster(key) {
  const c = clusterGroups.get(key); if (!c || !window.ClusterItems || !ClusterItems.summaryPrompt) return;
  const items = c.g.ids.map(id => allItems.find(i => i.id === id)).filter(i => i && !i.sensitive);   // 保護メモは送らない
  if (!items.length) return;
  const box = document.getElementById('sum-' + key);
  if (box) box.innerHTML = '<div style="font-size:13px;color:#8e8e93">要約中…</div>';
  try {
    const out = String(await callAI(ClusterItems.summaryPrompt(items)) || '').trim();
    if (!out) throw new Error('AIから返事がありませんでした');
    sumSet(c.g, { text: out, ids: items.map(i => i.id), kw: c.s.keywords, status: 'draft', edited: false, at: Date.now() });
  } catch (e) { showToast('要約できませんでした：' + e.message); }
  renderCluster(true);
}
async function summarizeAll() {
  const todo = [...clusterGroups.keys()].filter(k => !sumGet(clusterGroups.get(k).g));
  if (!todo.length || !confirm(todo.length + '個のまとまりの題名と本文をAIに送って要約します（保護メモ・コード行・秘密らしい行は除く）。よろしいですか？')) return;
  for (let i = 0; i < todo.length; i++) { showToast('要約中 ' + (i + 1) + '/' + todo.length); await summarizeCluster(todo[i]); }
  showToast('要約が終わりました。内容を見て採用してください');
}
function adoptClusterSum(key, ok) {
  const c = clusterGroups.get(key), st = c && sumGet(c.g); if (!c || !st) return;
  if (ok) {
    const ta = document.getElementById('clusterBody').querySelector('textarea'), text = ta ? ta.value : st.text;
    sumSet(c.g, Object.assign({}, st, { text, edited: st.edited || text !== st.text, status: 'adopted', at: Date.now() }));
  } else sumSet(c.g, null);
  renderCluster(true);
}
function openClusters() {
  closeMenu(); clusterGroups.clear(); clusterOpenKey = null;
  const items = allItems.filter(i => !i.sensitive);   // 保護メモは読まない
  const prot = allItems.length - items.length, CI = window.ClusterItems;
  const gs = CI ? CI.cluster(items) : [];
  const multi = gs.filter(g => g.size > 1), single = gs.filter(g => g.size === 1);
  const desc = CI && CI.describeAll ? CI.describeAll(multi, items) : [];
  multi.forEach((g, k) => clusterGroups.set(g.ids[0], { g, s: desc[k] || { keywords: [], entries: g.ids.map(id => ({ type: 'item', id })), head: '', next: [] } }));
  clusterSingles = single.map(g => g.ids[0]);
  clusterMeta = `${items.length}件から${multi.length}個のまとまりを検出。単独${single.length}件。` + (prot ? `保護メモ${prot}件は対象外。` : '');
  const view = document.getElementById('clusterView');
  renderCluster(false); view.style.display = 'block'; view.scrollTop = 0;
}""")

START = '/* ── まとまりのAI要約（押したときだけ送信。AI作成の枠に出し、採用・修正・却下は利用者が選ぶ） ── */'
ENDM = "  view.style.display = 'block'; view.scrollTop = 0;" + NL + "}"
s0 = ix.find(START); e0 = ix.find(ENDM, s0) if s0 >= 0 else -1
if ix.count(START) != 1 or e0 < 0 or 'function openClusters() {' not in ix[s0:e0] or e0 - s0 > 12000:
    print('中止: 既存の「まとまり」画面のコードが想定どおりではありません。変更していません。'); sys.exit(1)

LISTEN_OLD = n("""  document.getElementById('clusterBody').addEventListener('click', e => {
    const s = e.target.closest('[data-sum]'); if (s) { summarizeCluster(s.dataset.sum); return; }
    const ok = e.target.closest('[data-sumok]'); if (ok) { adoptClusterSum(ok.dataset.sumok, true); return; }
    const ng = e.target.closest('[data-sumng]'); if (ng) { adoptClusterSum(ng.dataset.sumng, false); return; }
    const b = e.target.closest('[data-cid]'); if (b) openClusterItem(b.dataset.cid);
  });""")
LISTEN_NEW = n("""  document.getElementById('clusterBody').addEventListener('click', e => {
    const q = sel => e.target.closest(sel); let t;
    if ((t = q('[data-sum]'))) { summarizeCluster(t.dataset.sum); return; }
    if (q('[data-sumall]')) { summarizeAll(); return; }
    if ((t = q('[data-sumok]'))) { adoptClusterSum(t.dataset.sumok, true); return; }
    if ((t = q('[data-sumng]'))) { adoptClusterSum(t.dataset.sumng, false); return; }
    if ((t = q('[data-open]'))) { openClusterDetail(t.dataset.open); return; }
    if ((t = q('[data-cid]'))) openClusterItem(t.dataset.cid);
  });""")
CLOSE_OLD = "document.getElementById('clusterClose').addEventListener('click', closeClusters);"
CLOSE_NEW = "document.getElementById('clusterClose').addEventListener('click', clusterBack);"
bad = [(k, ix.count(o)) for k, o in (('listen', LISTEN_OLD), ('close', CLOSE_OLD)) if ix.count(o) != 1]
m = re.findall(r"qr-cache-v(\d+)", sw)
if bad or len(m) != 1:
    print('中止: 置換対象が想定どおりではありません', bad, '。変更していません。'); sys.exit(1)
out = ix[:s0] + NEW + ix[e0 + len(ENDM):]
out = out.replace(LISTEN_OLD, LISTEN_NEW, 1).replace(CLOSE_OLD, CLOSE_NEW, 1)
sw2 = sw.replace('qr-cache-v' + m[0], 'qr-cache-v%d' % (int(m[0]) + 1), 1)
Path('index.html').write_bytes(out.encode('utf-8')); Path('sw.js').write_bytes(sw2.encode('utf-8'))
print('OK: まとまり画面を作り替え、キャッシュ v%s → v%d' % (m[0], int(m[0]) + 1))
