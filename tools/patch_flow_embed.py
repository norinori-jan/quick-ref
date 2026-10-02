#!/usr/bin/env python3
"""quick-ref index.html に「フロー」項目(flow-render連携)を追加する最小差分パッチ。

使い方（quick-refのリポジトリ直下で）:
    python patch_flow_embed.py

- 全ての置換対象が「ちょうど1箇所」見つかったときだけ書き込む（1つでもズレたら何も変更しない）
- 改行コード(CRLF/LF)は自動判定
- flow-render.js は index.html と同じ階層に置いておくこと
"""
from pathlib import Path
import sys

P = Path('index.html')
raw = P.read_bytes().decode('utf-8')
NL = '\r\n' if '\r\n' in raw else '\n'


def n(s):
    return s.replace('\n', NL)


edits = []

# 1) flow-render.js を読み込む（<head>末尾。同期読み込みなので以降のコードから使える）
edits.append((
    n('</head>'),
    n('  <script src="flow-render.js"></script>\n</head>'),
))

# 2) 「🔀 フローを追加」ボタン
edits.append((
    n('<button type="button" id="addFieldBtn" class="add-field-btn">＋ 項目を追加</button>'),
    n('<button type="button" id="addFieldBtn" class="add-field-btn">＋ 項目を追加</button>\n'
      '    <button type="button" id="addFlowBtn" class="add-field-btn">🔀 フローを追加</button>'),
))

# 3) プレビュー更新ヘルパーを renderFieldRows の直前に追加
edits.append((
    n('function renderFieldRows() {'),
    n("""const FLOW_KEY = 'フロー';
function isFlowField(f) { return String(f && f.key || '').trim() === FLOW_KEY; }
function updateFlowPreview(row, text) {
  const pv = row.querySelector('.flow-preview');
  if (!pv) return;
  try {
    const r = window.FlowRender ? window.FlowRender.render(text) : null;
    pv.innerHTML = (r && r.svg) ? r.svg : '<span style="color:#8E8E93;font-size:12px;">図がここに表示されます</span>';
  } catch (err) {
    pv.textContent = '図を作れませんでした';
  }
}

function renderFieldRows() {"""),
))

# 4) 行テンプレート: フロー項目は複数行入力欄 + プレビュー枠
edits.append((
    n("""      <div class="field-row" data-i="${i}">"""),
    n("""      <div class="field-row" data-i="${i}"${isFlowField(f) ? ' style="flex-wrap:wrap"' : ''}>"""),
))
edits.append((
    n("""        <input type="text" class="field-value" placeholder="値" value="${escapeHtml(f.value)}">"""),
    n("""        ${isFlowField(f)
          ? `<textarea class="field-value" rows="5" style="width:100%;flex:1 1 100%;font-family:monospace;" placeholder="(開始) -> 入力 -> {OK?}&#10;{OK?} -> 保存 : はい&#10;{OK?} -> 入力 : いいえ&#10;保存 -> (終了)">${escapeHtml(f.value)}</textarea><div class="flow-preview" style="width:100%;overflow-x:auto;padding:8px 0;"></div>`
          : `<input type="text" class="field-value" placeholder="値" value="${escapeHtml(f.value)}">`}"""),
))

# 5) 入力イベント: 値の変更でプレビュー更新 / 項目名の確定で行を再構築 / 初期表示
edits.append((
    n("""    row.querySelector('.field-value').addEventListener('input', e => {
      draftFields[i].value = e.target.value;
    });"""),
    n("""    row.querySelector('.field-key').addEventListener('change', () => {
      renderFieldRows();   // 項目名が「フロー」かどうかで入力欄の種類が変わる
    });
    row.querySelector('.field-value').addEventListener('input', e => {
      draftFields[i].value = e.target.value;
      if (isFlowField(draftFields[i])) updateFlowPreview(row, e.target.value);
    });
    if (isFlowField(draftFields[i])) updateFlowPreview(row, draftFields[i].value);"""),
))

# 6) 追加ボタンのイベント
edits.append((
    n("""  document.getElementById('addFieldBtn').addEventListener('click', () => {
    draftFields.push({ key: '', value: '' });
    renderFieldRows();
  });"""),
    n("""  document.getElementById('addFieldBtn').addEventListener('click', () => {
    draftFields.push({ key: '', value: '' });
    renderFieldRows();
  });

  document.getElementById('addFlowBtn').addEventListener('click', () => {
    draftFields.push({ key: FLOW_KEY, value: '(開始) -> 処理 -> (終了)' });
    renderFieldRows();
  });"""),
))

# --- 検証: 全て ちょうど1箇所 ---
bad = [(i + 1, raw.count(old)) for i, (old, _) in enumerate(edits) if raw.count(old) != 1]
if bad:
    print('中止: 置換対象が1箇所ではありません（編集番号, 件数）:', bad)
    print('index.html は変更していません。')
    sys.exit(1)

out = raw
for old, new in edits:
    out = out.replace(old, new, 1)

P.write_bytes(out.encode('utf-8'))
print('OK: %d 箇所を更新しました。' % len(edits))