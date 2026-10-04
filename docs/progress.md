# 作業の進み具合（Claude Code / 手作業 共通）

最終更新: 2026-10-04。使用制限で止まったら、次のセッションはこのファイルを読んで続きから始める。

## 第1便（安全）— 済み
1. 2-7 関連づけAI（setupAiRelatedBtn）: 保護メモ基準は送る前に停止／callAI に一本化（CORSヘッダー・鍵の重複を解消）／Gemini の鍵をURLからヘッダー（x-goog-api-key）へ。
2. 2-4 秘密らしい行の除外: cluster-items.js に isSecret / redact / redactTitle を1か所に集約（英字+数字24文字以上、base64、sk- 等を追加。従来の32文字以上の規則も維持）。callAI に { redact: true }（部品が無ければ送らない）。一覧の題名も隠す。sw.js を qr-cache-v15 に。
3. 2-8 送信の入口: まとまりの要約・関連づけで redact:true。runAIAction は秘密らしい行があれば、送る前に確認（キャンセルで送らない）。

## 第2便（まとまり）— 済み
1. 2-3 除外タグ: cluster-items.js に EXCLUDE_TAGS ['AI作成','まとまり','用語'] と eligible/eligibleOne を1か所に。cluster・describeAll・summaryPrompt・要約送信が同じ絞り込みを使う。describeAll は対象外IDが混ざっても落ちない。
2. 2-1 要約を消さない: 保存を qr_clsum2（1つのJSON）に。まとまりとはメモIDの重なり0.6以上・1対1で結びつけ、自動では消さない。元メモが変わったら「元メモが更新されています／このまま使う／作り直す」。旧形式は初回のみ引き継ぎ（旧キーは残す）。対応先が無い要約は件数だけ表示。
3. 2-2 編集中の保護: 再描画しても textarea の修正を保持。戻る・メモを開く・作り直すは、修正中なら確認。
4. 2-6 sw.js を qr-cache-v16 に（cluster-items.js の更新を届けるため）。

## 次
- Phase 3（調査のみ）: 採用した要約をメモとして保存する場所（saveItem / QuickRefBridge.onItemSaved）の洗い出し。
- Phase 4（承認後）: 出所・語の調べ物。

## 注意
- 値（鍵・トークン）は書かない。確認結果はファイル名・行番号・種類だけ。
- callStructureAPI（音声→メモ）は利用者の発話で、今回は対象外（保護トグルのガードなし。必要なら別途）。
- Phase 4（出所・語の調べ物）では、抜粋表示と定義プロンプトにも redact を通すこと。
- Gemini の x-goog-api-key ヘッダーは、実機で1回確認する（ブラウザのCORSで拒否される場合は、URLのキーに戻さず相談）。
