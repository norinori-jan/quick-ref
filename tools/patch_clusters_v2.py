#!/usr/bin/env python3
"""「まとまり」画面を、意味が分かる表示に作り替える（v2）。
 ・見出し＝そのまとまりに特徴的な語   ・連番の版は1行にたたむ（最新を開く／全版は折りたたみ）
 ・「最後のメモ」と「次の一手・未解決」を表示（本文から抜き出すだけ。AIも外部送信も使わない）
リポジトリ直下で: python tools\\patch_clusters_v2.py   （cluster-items.js を新しい版に置き換えてから実行）
index.html と sw.js のどちらかでも想定と違えば、何も変更しない。
"""
from pathlib import Path
import re, sys

ix = Path('index.html').read_bytes().decode('utf-8'); NL = '\r\n' if '\r\n' in ix else '\n'
sw = Path('sw.js').read_bytes().decode('utf-8')
n = lambda s: s.replace('\n', NL)

NEW = n(r"""function openClusters() {
  closeMenu();
  const view = document.getElementById('clusterView'), body = document.getElementById('clusterBody');
  const items = allItems.filter(i => !i.sensitive);   // 保護メモは読まない
  const prot = allItems.length - items.length;
  const CI = window.ClusterItems;
  const gs = CI ? CI.cluster(items) : [];
  const multi = gs.filter(g => g.size > 1), single = gs.filter(g => g.size === 1);
  const desc = CI && CI.describeAll ? CI.describeAll(multi, items) : [];
  const byId = new Map(items.map(i => [i.id, i]));
  const d = ms => { const x = new Date(ms); return (x.getMonth() + 1) + '/' + x.getDate(); };
  const btn = (id, label) => `<button type="button" data-cid="${escapeHtml(id)}" style="display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px">${label}</button>`;
  const row = id => { const i = byId.get(id); return btn(id, `${d(i.createdAt)} ${escapeHtml(i.title || '(無題)')}`); };
  const entry = e => {
    if (e.type === 'item') return row(e.id);
    const a = byId.get(e.ids[0]), z = byId.get(e.ids[e.ids.length - 1]);
    return btn(e.ids[e.ids.length - 1], `🗂 ${escapeHtml(e.label)} ×${e.ids.length}版（${d(a.createdAt)}〜${d(z.createdAt)}）— 最新を開く`) +
      `<details style="margin-left:12px"><summary style="font-size:12px;color:#8e8e93">全${e.ids.length}版</summary>${e.ids.map(row).join('')}</details>`;
  };
  const note = t => `<div style="font-size:13px;margin:4px 0;color:#8e8e93">${t}</div>`;
  body.innerHTML = `<p style="color:#8e8e93;font-size:12px">${items.length}件から${multi.length}個のまとまりを検出。単独${single.length}件。` + (prot ? `保護メモ${prot}件は対象外です。` : '') + '</p>' +
    multi.map((g, k) => {
      const s = desc[k] || { keywords: [], entries: g.ids.map(id => ({ type: 'item', id })), head: '', next: [] };
      const title = s.keywords.length ? s.keywords.map(escapeHtml).join(' · ') : escapeHtml(g.title || '(無題)');
      return `<details${k < 3 ? ' open' : ''} style="margin:10px 0"><summary><b>${title}</b>　${g.size}件・${d(g.from)}${g.from === g.to ? '' : '〜' + d(g.to)} ${g.tags.map(t => '#' + escapeHtml(t)).join(' ')}</summary>` +
        (s.head ? note('最後のメモ：' + escapeHtml(s.head)) : '') +
        (s.next.length ? note('次の一手・未解決：<br>' + s.next.map(escapeHtml).join('<br>')) : '') +
        s.entries.map(entry).join('') + '</details>';
    }).join('') +
    (single.length ? `<details style="margin:8px 0"><summary>単独のメモ（${single.length}件）</summary>${single.map(g => row(g.ids[0])).join('')}</details>` : '');
  view.style.display = 'block'; view.scrollTop = 0;
}""")

start = ix.find('function openClusters() {')
endm = "  view.style.display = 'block'; view.scrollTop = 0;" + NL + "}"
end = ix.find(endm, start)
if ix.count('function openClusters() {') != 1 or start < 0 or end < 0 or end - start > 4000:
    print('中止: 既存の openClusters が想定どおりではありません。変更していません。'); sys.exit(1)
out = ix[:start] + NEW + ix[end + len(endm):]

m = re.findall(r"qr-cache-v(\d+)", sw)
if len(m) != 1:
    print('中止: sw.js のキャッシュ名が想定どおりではありません。変更していません。'); sys.exit(1)
sw2 = sw.replace('qr-cache-v' + m[0], 'qr-cache-v%d' % (int(m[0]) + 1), 1)
Path('index.html').write_bytes(out.encode('utf-8')); Path('sw.js').write_bytes(sw2.encode('utf-8'))
print('OK: openClusters を作り替え、キャッシュ v%s → v%d' % (m[0], int(m[0]) + 1))
