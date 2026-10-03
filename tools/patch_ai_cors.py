#!/usr/bin/env python3
"""callAI の Claude直接呼び出しに「ブラウザからの直接アクセス」ヘッダーを足す（CORSで遮断される問題の修正）。
リポジトリ直下で: python tools\\patch_ai_cors.py   （置換対象がちょうど1箇所のときだけ書き込む）
"""
from pathlib import Path
import sys
P = Path('index.html'); raw = P.read_bytes().decode('utf-8'); NL = '\r\n' if '\r\n' in raw else '\n'
old = "    headers['x-api-key'] = apiKey;" + NL + "    headers['anthropic-version'] = '2023-06-01';"
new = old + NL + "    headers['anthropic-dangerous-direct-browser-access'] = 'true';   // ブラウザから直接呼ぶのに必要（利用者自身のキーを使う前提）"
if raw.count(old) != 1:
    print('中止: 置換対象が1箇所ではありません（件数: %d）。index.html は変更していません。' % raw.count(old)); sys.exit(1)
P.write_bytes(raw.replace(old, new, 1).encode('utf-8')); print('OK')
