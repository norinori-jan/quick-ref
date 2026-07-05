# norinori-apps 本番運用開始の最終設定案

## 1. 今このタイミングで固定すべき設定値

### endpoint
- 既定値: `window.NORINORI_SYNC_ENDPOINT || '/sync'`
- 本番では、各アプリから参照する値を明示的に固定するのが安全
- 推奨: Worker の公開 URL をそのまま使う
  - 例: `https://<worker-name>.workers.dev/sync`
  - 実際のデプロイ URL に置き換える
- もし相対パスを使う場合は、同一ドメイン配下であることを確認する

### token
- 既定値: `window.NORINORI_SYNC_TOKEN || ''`
- 本番では空文字を許可しない方が安全
- 推奨: Worker 側と同じ Bearer トークンを共有する
- 確定値: `my-super-secret-token-2026`
- 送信ヘッダーは `Authorization: Bearer my-super-secret-token-2026` とする

### Worker の KV 名
- 既定値: `NORINORI_KV`
- 本番ではこの名前を固定しておく
- 期待するキー構成:
  - `sync:${appName}`
  - `sync:last`

### CORS の最終値
- 推奨の最小構成:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, PUT, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization`
- もし運用上の制約があるなら、`*` ではなく明示ドメインに限定する

---

## 2. quick-ref UI の最終安定化案

### 小さな微調整
- 受信カードの挿入先を `cardList` 優先に固定する
- 受信後のカードを先頭へ追記する
- 受信済みカードに `data-sync` / `data-source` を付ける
- 既存の検索・フィルタと衝突しないよう、描画の前に DOM の存在確認を行う
- 旧形式 transfer と新形式 payload が混在した場合は新形式を優先する

### 安全措置
- 受信先要素が存在しない場合は `console.warn` を出して無視する
- 重複初期化ガードを維持する
- 描画前に空配列・未定義の値を防ぐ

---

## 3. Worker 本番設定の最終案

### KV
- 必須: `NORINORI_KV`
- 保存先: `sync:${appName}`
- 履歴保存: `sync:last`

### TOKEN
- Bearer トークンを必須とする
- 未設定時は `401` もしくは `403` 相当で拒否する

### CORS
- `GET, PUT, OPTIONS` を許可
- `Content-Type, Authorization` を許可
- 開発期は `*`、本番では必要に応じて制限

### ログ
- 成功/失敗/未認証/不正 payload を残す
- 過剰なログは避け、運用追跡に必要な最小ログにする

---

## 4. 各アプリ側への導線埋め込みの最終案

### flow-mind
- 共有ボタンまたはメニューから bridge を呼ぶ
- 送信先: `PUT /sync/flow-mind`
- 送信成功時に quick-ref へ反映されることを確認する

### flowchart-lab
- 図の保存・共有時に bridge を呼ぶ
- 送信先: `PUT /sync/flowchart-lab`

### music-suite
- 楽曲・譜面共有アクションから bridge を呼ぶ
- 送信先: `PUT /sync/music-suite`

### illust-studio
- 画像共有アクションから bridge を呼ぶ
- 送信先: `PUT /sync/illust-studio`
- 画像データはサイズ制限を意識する

### kansei
- draft / learn / 共通共有操作から bridge を呼ぶ
- 送信先: `PUT /sync/kansei`

### speak-native
- 発話ログ・メモ共有から bridge を呼ぶ
- 送信先: `PUT /sync/speak-native`

### 共通方針
- すべて共通の bridge を使う
- endpoint と token はグローバル値から取得する
- 失敗時は localStorage へ fallback できるようにしておく

---

## 5. 本番運用開始後の初期 1 週間で確認すべきポイント

- 送信成功率
- quick-ref への反映遅延
- 旧形式 transfer からの互換性
- 既存 UI への影響
- 受信件数増加時の表示品質
- 失敗時の再送しやすさ

---

## 6. 本番運用開始の最終総括

本番運用を開始するための最終固定項目は、endpoint・token・KV 名・CORS 値です。これらを固定し、quick-ref の受信描画を安定化しておけば、運用開始時のリスクは大きく下げられます。実装基盤は成立しており、残る作業は「設定値の固定」と「運用開始後の監視体制整備」です。
