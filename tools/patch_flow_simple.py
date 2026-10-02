#!/usr/bin/env python3
"""flow-render.js に「1行=1ステップ」のかんたん書きを追加し、index.html の初期値と案内文を更新する。
quick-refのリポジトリ直下で: python patch_flow_simple.py
置換対象が全て『ちょうど1箇所』のときだけ書き込む（ズレたら何も変更しない）。
"""
from pathlib import Path
import sys


def load(p):
    raw = Path(p).read_bytes().decode('utf-8')
    return raw, ('\r\n' if '\r\n' in raw else '\n')


jobs = []

# --- flow-render.js ---
fr, nl = load('flow-render.js')
n = lambda s: s.replace('\n', nl)
old_fr = n("""    String(src || '').split(/\\r?\\n/).forEach(function (line) {
      line = line.trim();""")
new_fr = n("""    var lines = String(src || '').split(/\\r?\\n/);
    // かんたん書き: 矢印が1つも無ければ「1行=1ステップ」として上から順に繋ぐ
    var hasArrow = lines.some(function (l) { return /->|→/.test(l) && l.trim().charAt(0) !== '#'; });
    if (!hasArrow) {
      var seen = {}, steps = [];
      lines.forEach(function (l) {
        l = l.trim().replace(/^(?:[-*・●○]|\\d+[.．)）])\\s*/, '').replace(/\\s*[:：]\\s*/g, '\\u2236');
        if (!l || l.charAt(0) === '#') return;
        // 同じ文言が複数回出ても、別のステップとして扱う（ゼロ幅スペースで区別）
        seen[l] = (seen[l] || 0) + 1;
        for (var k = 1; k < seen[l]; k++) l += '\\u200b';
        steps.push(l);
      });
      lines = steps.length > 1 ? steps.slice(1).map(function (s, i) { return steps[i] + ' -> ' + s; }) : steps;
    }
    lines.forEach(function (line) {
      line = line.trim();""")
jobs.append(('flow-render.js', fr, nl, [(old_fr, new_fr)]))

# --- index.html ---
ix, nl2 = load('index.html')
m = lambda s: s.replace('\n', nl2)
jobs.append(('index.html', ix, nl2, [
    ("value: '(開始) -> 処理 -> (終了)'", "value: '朝起きる\\n準備する\\n出発する'"),
    ('placeholder="(開始) -> 入力 -> {OK?}&#10;{OK?} -> 保存 : はい&#10;{OK?} -> 入力 : いいえ&#10;保存 -> (終了)"',
     'placeholder="1行に1ステップ、上から順に書くだけ&#10;（分岐やループは「A -> B」と矢印で書く）"'),
]))

bad = [(f, i + 1, t.count(o)) for f, t, _, es in jobs for i, (o, _) in enumerate(es) if t.count(o) != 1]
if bad:
    print('中止: 置換対象が1箇所ではありません（ファイル, 番号, 件数）:', bad)
    print('どのファイルも変更していません。')
    sys.exit(1)

for f, t, _, es in jobs:
    for o, nw in es:
        t = t.replace(o, nw, 1)
    Path(f).write_bytes(t.encode('utf-8'))
    print('OK:', f)