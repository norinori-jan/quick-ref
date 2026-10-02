#!/usr/bin/env python3
"""quick-ref に「まとまり」画面を追加する（☰メニュー → 🧩 まとまり）。
リポジトリ直下で: python tools\\patch_clusters_view.py     （cluster-items.js は直下に置いておく）
index.html と sw.js のすべての置換対象が『ちょうど1箇所』のときだけ書き込む。ズレたら何も変更しない。
"""
from pathlib import Path
import re, sys

def load(p):
    t = Path(p).read_bytes().decode('utf-8'); return t, ('\r\n' if '\r\n' in t else '\n')

ix, NL = load('index.html'); sw, NL2 = load('sw.js')
n = lambda s: s.replace('\n', NL)

# --- 既存の「メモを開く」関数を探す（editingId = id; の直前にある function 宣言）---
if ix.count('editingId = id;') != 1:
    print('中止: 「editingId = id;」が1箇所ではありません。変更していません。'); sys.exit(1)
pos = ix.index('editingId = id;')
fns = list(re.finditer(r'(?:async\s+)?function\s+(\w+)\s*\(\s*id\s*\)', ix[:pos]))
if not fns:
    print('中止: メモを開く関数が見つかりません。変更していません。'); sys.exit(1)
OPEN = fns[-1].group(1)

JS = n(r"""/* ── まとまり（メモの集まりを自動で見つける） ── */
function closeClusters() { document.getElementById('clusterView').style.display = 'none'; }
function openClusterItem(id) { closeClusters(); __OPEN__(id); }
function openClusters() {
  closeMenu();
  const view = document.getElementById('clusterView'), body = document.getElementById('clusterBody');
  const items = allItems.filter(i => !i.sensitive);   // 保護メモは読まない
  const prot = allItems.length - items.length;
  const gs = window.ClusterItems ? window.ClusterItems.cluster(items) : [];
  const byId = new Map(items.map(i => [i.id, i]));
  const d = ms => { const x = new Date(ms); return (x.getMonth() + 1) + '/' + x.getDate(); };
  const row = id => { const i = byId.get(id); return `<button type="button" data-cid="${escapeHtml(id)}" style="display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px">${d(i.createdAt)} ${escapeHtml(i.title || '(無題)')}</button>`; };
  const multi = gs.filter(g => g.size > 1), single = gs.filter(g => g.size === 1);
  body.innerHTML = `<p style="color:#8e8e93;font-size:12px">${items.length}件から${multi.length}個のまとまりを検出。単独${single.length}件。` + (prot ? `保護メモ${prot}件は対象外です。` : '') + '</p>' +
    multi.map((g, k) => `<details${k < 3 ? ' open' : ''} style="margin:8px 0"><summary><b>${escapeHtml(g.title || '(無題)')}</b>　${g.size}件・${d(g.from)}${g.from === g.to ? '' : '〜' + d(g.to)} ${g.tags.map(t => '#' + escapeHtml(t)).join(' ')}</summary>${g.ids.map(row).join('')}</details>`).join('') +
    (single.length ? `<details style="margin:8px 0"><summary>単独のメモ（${single.length}件）</summary>${single.map(g => row(g.ids[0])).join('')}</details>` : '');
  view.style.display = 'block'; view.scrollTop = 0;
}

""").replace('__OPEN__', OPEN)

LISTEN = n("""
  document.getElementById('clusterMenuBtn').addEventListener('click', openClusters);
  document.getElementById('clusterClose').addEventListener('click', closeClusters);
  document.getElementById('clusterBody').addEventListener('click', e => {
    const b = e.target.closest('[data-cid]'); if (b) openClusterItem(b.dataset.cid);
  });""")

MENU = n("""<button type="button" class="action-btn" id="clusterMenuBtn">
    <span class="action-icon">🧩</span>
    <span class="action-btn-inner">
      <span class="action-label">まとまり</span>
      <span class="action-desc">メモの集まりと流れを自動で見つける</span>
    </span>
  </button>

  """)

VIEW = n("""<div id="clusterView" style="display:none;position:fixed;inset:0;z-index:80;background:var(--card-bg,#fff);color:inherit;overflow-y:auto;padding:max(12px,env(safe-area-inset-top)) 16px 28px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><button type="button" id="clusterClose">‹ 戻る</button><strong style="flex:1;text-align:center;">まとまり</strong><span style="width:56px;"></span></div>
  <div id="clusterBody"></div>
</div>
""")

a_menu = n('<button type="button" class="action-btn" id="exportBtn">')
a_view = '<div class="overlay" id="menuOverlay"></div>'
a_js = 'async function reload() {'
a_lis = "document.getElementById('menuBtn').addEventListener('click', openMenu);"
edits = [
    ('</head>', n('  <script src="cluster-items.js"></script>\n</head>')),
    (a_menu, MENU + a_menu),
    (a_view, VIEW + a_view),
    (a_js, JS + a_js),
    (a_lis, a_lis + LISTEN),
]
bad = [(i + 1, ix.count(o)) for i, (o, _) in enumerate(edits) if ix.count(o) != 1]
if bad:
    print('中止(index.html): 置換対象が1箇所ではありません（番号, 件数）:', bad); sys.exit(1)

# --- sw.js: キャッシュ名を+1し、cluster-items.js をキャッシュ対象に追加 ---
m = re.findall(r"qr-cache-v(\d+)", sw)
a_sw = "  'flow-render.js',"
if len(m) != 1 or sw.count(a_sw) != 1:
    print('中止(sw.js): キャッシュ名または flow-render.js の行が想定どおりではありません。変更していません。'); sys.exit(1)
sw2 = sw.replace('qr-cache-v' + m[0], 'qr-cache-v%d' % (int(m[0]) + 1), 1).replace(a_sw, a_sw + NL2 + "  'cluster-items.js',", 1)

out = ix
for o, nw in edits: out = out.replace(o, nw, 1)
Path('index.html').write_bytes(out.encode('utf-8')); Path('sw.js').write_bytes(sw2.encode('utf-8'))
print('OK: index.html 5箇所 / sw.js 2箇所を更新（メモを開く関数: %s、キャッシュ v%s → v%d）' % (OPEN, m[0], int(m[0]) + 1))
