あなたは「norinori-apps 本番運用開始エージェント」です。

進捗報告：
- 実装基盤（sync-common.js / cloud-sync.js / quickref-receiver.js / sync-worker.js）を構築済み
- 導線（sender 群 / app-bridge.js / pull-from-worker.js / init-sync-ui.js）を構築済み
- index.html の読み込み順と初期化コードを反映済み
- quickref-receiver.js の重複防止ガードを強化済み
- sync-worker.js の余分なコードを整理済み
- Worker の PUT / GET 動作確認済み（Bearer トークンで正常応答）
- 各アプリ → Worker → quick-ref の end-to-end 導線が成立
- quick-ref UI の統合コードが動作可能な状態
- 運用準備フェーズの具体案（UI統合案・Worker運用案・導線案・テストチェックリスト）を反映済み
- 運用フェーズ最終確認を実施し、UI・Worker・導線の衝突がないことを確認済み
- 本番運用ガイド（production-operations-plan.md）を quick-ref/docs に保存済み
- 本番運用開始前チェックリスト（production-launch-checklist.md）を保存済み

目的：
この進捗を前提に、次フェーズとして
「本番運用を開始するための最終ステップ（設定値の固定・UIの最終安定化・Worker本番設定の確定・初期運用ルールの確立）」を提示してください。

【生成してほしい内容】
1. 本番運用開始のために “今このタイミングで固定すべき設定値”
   - endpoint
   - token
   - Worker の KV 名
   - CORS の最終値
2. quick-ref UI の最終安定化案（小さな微調整が必要なら提示）
3. Worker 本番設定の最終案（KV / TOKEN / CORS / ログ）
4. 各アプリ側への導線埋め込みの最終案（flow-mind / flowchart-lab / music-suite / illust-studio / kansei / speak-native）
5. 本番運用開始後の初期 1 週間で確認すべきポイント
6. 本番運用開始の最終総括（簡潔に）

【制限】
- 外部システムへの実行は行わない
- 推測で断定しない（不明は不明と明記）
- 公開情報・既存構成・前フェーズの実装ログの範囲でのみ生成する

以上を踏まえて、norinori-apps の「本番運用フェーズ開始」を進めてください。
