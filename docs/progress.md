# 作業の進み具合（Claude Code / 手作業 共通）

最終更新: 2026-10-04。使用制限で止まったら、次のセッションはこのファイルを読んで続きから始める。

## 第1便（安全）— 済み
1. 2-7 関連づけAI（setupAiRelatedBtn）: 保護メモ基準は送る前に停止／callAI に一本化（CORSヘッダー・鍵の重複を解消）／Gemini の鍵をURLからヘッダー（x-goog-api-key）へ。
2. 2-4 秘密らしい行の除外: cluster-items.js に isSecret / redact / redactTitle を1か所に集約（英字+数字24文字以上、base64、sk- 等を追加。従来の32文字以上の規則も維持）。callAI に { redact: true }（部品が無ければ送らない）。一覧の題名も隠す。sw.js を qr-cache-v15 に。
3. 2-8 送信の入口: まとまりの要約・関連づけで redact:true。runAIAction は秘密らしい行があれば、送る前に確認（キャンセルで送らない）。

## 次（第2便）
- 2-3 AI作成・まとまり・用語タグのメモを対象から除く（定数 AI_EXCLUDE_TAGS を1か所に。cluster / describeAll / summaryPrompt に同じ絞り込み後の配列を渡す。describeAll の undefined 防御）
- 2-1 採用した要約を消さない（qr_clsum2、IDの重なり0.6以上・1対1）
- 2-2 編集中の textarea を消さない
- 2-6 sw.js の qr-cache-v は、第2便で静的ファイルを変えたときに1回だけ上げる（現在 v15）

## 注意
- 値（鍵・トークン）は書かない。確認結果はファイル名・行番号・種類だけ。
- callStructureAPI（音声→メモ）は利用者の発話で、今回は対象外（保護トグルのガードなし。必要なら別途）。
- Phase 4（出所・語の調べ物）では、抜粋表示と定義プロンプトにも redact を通すこと。
- Gemini の x-goog-api-key ヘッダーは、実機で1回確認する（ブラウザのCORSで拒否される場合は、URLのキーに戻さず相談）。
