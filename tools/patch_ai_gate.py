#!/usr/bin/env python3
"""「✦ AI」パネルの全アクション(要約・整理・補足・質問生成・流れにする)で、保護メモの本文をAIに送らない。
リポジトリ直下で: python patch_ai_gate.py   （置換対象がちょうど1箇所のときだけ書き込む）
"""
from pathlib import Path
import sys
P = Path('index.html'); raw = P.read_bytes().decode('utf-8'); NL = '\r\n' if '\r\n' in raw else '\n'
guard = ("  if (document.getElementById('sensitiveToggle')?.checked) {" + NL +
         "    showToast('保護メモの内容はAIに送れません');" + NL + "    return;" + NL + "  }" + NL)
a_old = "if (action === 'flow' && document.getElementById('sensitiveToggle')?.checked) {"   # patch_flow_ai適用済み
b_old = "async function runAIAction(action, customPrompt) {" + NL                              # 未適用
if raw.count(a_old) == 1:
    out = raw.replace(a_old, "if (document.getElementById('sensitiveToggle')?.checked) {", 1)
elif raw.count(a_old) == 0 and raw.count(b_old) == 1:
    out = raw.replace(b_old, b_old + guard, 1)
else:
    print('中止: 置換対象が想定どおりではありません。index.html は変更していません。'); sys.exit(1)
P.write_bytes(out.encode('utf-8')); print('OK')
