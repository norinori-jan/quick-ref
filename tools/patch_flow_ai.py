#!/usr/bin/env python3
"""quick-ref の「✦ AI」パネルに「🔀 流れにする」を追加する最小差分パッチ。
リポジトリ直下で: python patch_flow_ai.py
置換対象が全て『ちょうど1箇所』のときだけ書き込む（ズレたら何も変更しない）。
"""
from pathlib import Path
import sys

P = Path('index.html')
raw = P.read_bytes().decode('utf-8')
NL = '\r\n' if '\r\n' in raw else '\n'
n = lambda s: s.replace('\n', NL)

edits = []

# 1) パネルに「流れにする」ボタン
edits.append((
    '<button class="ai-action-btn" data-action="question">質問生成</button>',
    '<button class="ai-action-btn" data-action="question">質問生成</button>' + NL +
    '    <button class="ai-action-btn" data-action="flow">🔀 流れにする</button>',
))

# 2) 結果欄に「フローとして追加」ボタン（flow のときだけ表示）
edits.append((
    '<button id="aiInsertBtn">メモに挿入</button>',
    '<button id="aiFlowBtn" style="display:none">🔀 フローとして追加</button><button id="aiInsertBtn">メモに挿入</button>',
))

# 3) AI_PROMPTS に flow を追加
edits.append((
    'const AI_PROMPTS = {',
    n(r"""const AI_PROMPTS = {
  flow: (t) => `次のメモの「流れ」を、フローチャート用のテキストに変換してください。

出力ルール:
- フローチャート用のテキストだけを出力する（前置き・説明・コードブロックは不要）
- 1行に1つの接続。「->」で繋ぐ。例: 起きる -> 準備する -> {天気は?}
- 判断（分岐）は {質問?} と書き、分岐先は「{質問?} -> 次の手順 : 答え」のように行末に「 : ラベル」を付ける
- やり直しやループは、前の手順へ戻る接続で表す
- 各ステップは短く（15字以内が目安）。メモに書かれていない手順は足さない
- 最初と最後は (開始) (終了) と書く

メモ:
${t}`,"""),
))

# 4) runAIAction: 保護メモの遮断 + 直近アクションの記録
edits.append((
    n("""async function runAIAction(action, customPrompt) {
  const editorText = getEditorText();"""),
    n("""let lastAiAction = '';
async function runAIAction(action, customPrompt) {
  if (action === 'flow' && document.getElementById('sensitiveToggle')?.checked) {
    showToast('保護メモの内容はAIに送れません');
    return;
  }
  const editorText = getEditorText();"""),
))
edits.append((
    '    lastAiResult = result;',
    n("""    lastAiResult = result;
    lastAiAction = action;
    const flowBtn = document.getElementById('aiFlowBtn');
    if (flowBtn) flowBtn.style.display = (action === 'flow') ? '' : 'none';"""),
))

# 5) 「フローとして追加」の処理
edits.append((
    'function insertAIResult(replace = false) {',
    n(r"""function cleanFlowText(s) {
  const lines = String(s || '').replace(/```[a-z]*/gi, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const withArrow = lines.filter(l => /->|→/.test(l));
  return (withArrow.length ? withArrow : lines).join('\n');
}

function addAIFlowToFields() {
  const text = cleanFlowText(lastAiResult);
  if (!text) { showToast('流れを作れませんでした'); return; }
  draftFields.push({ key: FLOW_KEY, value: text });
  renderFieldRows();
  closeAIPanel();
  closeMemoPopup();
  showToast('フローを追加しました');
}

function insertAIResult(replace = false) {"""),
))

# 6) ボタンのイベント
edits.append((
    "document.getElementById('aiPanelClose').addEventListener('click', closeAIPanel);",
    "document.getElementById('aiPanelClose').addEventListener('click', closeAIPanel);" + NL +
    "  document.getElementById('aiFlowBtn').addEventListener('click', addAIFlowToFields);",
))

bad = [(i + 1, raw.count(o)) for i, (o, _) in enumerate(edits) if raw.count(o) != 1]
if bad:
    print('中止: 置換対象が1箇所ではありません（編集番号, 件数）:', bad)
    print('index.html は変更していません。')
    sys.exit(1)

out = raw
for o, nw in edits:
    out = out.replace(o, nw, 1)
P.write_bytes(out.encode('utf-8'))
print('OK: %d 箇所を更新しました。' % len(edits))