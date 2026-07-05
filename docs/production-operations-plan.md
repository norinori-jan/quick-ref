# norinori-apps 本番運用フェーズ最終案

## 1. Worker 本番設定の最終案

### 1.1 KV
- 必須バインディング名: `NORINORI_KV`
- 保存キー: `sync:${appName}`
- 直近履歴: `sync:last`
- 既定の運用方針:
  - 1 アプリ 1 件の最新 payload を保存する
  - 旧履歴は `sync:last` で参照できるようにする
  - 履歴の長期保管は別途設計する

### 1.2 TOKEN
- 受信側は `window.NORINORI_SYNC_TOKEN` もしくは `options.token` を利用する
- Worker 側では Bearer トークン方式を前提にし、未設定時は拒否するのが安全
- 実装上の方針:
  - `Authorization: Bearer <token>` を必須とする
  - 開発時は `local` でダミー値、運用時は本番値へ置換する

### 1.3 CORS
- 既定: `Access-Control-Allow-Origin` は明示的に設定する
- 既定値は `*` でも可だが、運用段階では制御可能な値を推奨する
- 追加ヘッダー:
  - `Access-Control-Allow-Methods: GET, PUT, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization`

### 1.4 ログ
- 既定では詳細ログを多めに出すより、異常時に追える最小ログを残す方針が妥当
- 重要ログ:
  - 受信成功
  - 受信失敗
  - 未認証
  - 不正 payload
  - KV 書き込み失敗

### 1.5 ルート構成
- `PUT /sync/:appName`
- `GET /sync/:appName`
- `GET /sync` は将来用として残してもよいが、現行実装では `appName` が必須である
- ルーティングは `path.startsWith('/sync/')` を基本とし、無効な path は 404 とする

---

## 2. quick-ref UI の最終安定化案

### 2.1 カード描画
- 受信カードは `cardList` / `cards` / `[data-sync-receiver]` の優先順位で挿入する
- 既存 UI の構造が変わった場合でも最低限表示されるよう、フォールバックを残す
- 受信後に `render` / `refresh` を走らせ、同期済みカードが即座に見えるようにする

### 2.2 新着表示
- 受信直後にカードを先頭へ追加する
- 既存カードとの混在を避けるため、`data-source` や `data-sync` を付与する
- 新着は `badge` / `chip` / `timestamp` で識別できるようにする

### 2.3 既存 UI との衝突防止
- 既存の `main.js` と `receiver.js` の挙動を壊さないよう、共有レイヤーは独立して動作させる
- 重複初期化ガードを維持する
- DOM の存在確認をしてから描画する

### 2.4 互換性
- 旧形式の `is_transfer` / `ms_transfer` / `kansei_draft_result` を引き続き受け付ける
- 新形式 payload がある場合は新形式を優先し、旧形式はフォールバック扱いとする

---

## 3. 各アプリ側への導線埋め込みの最終案

### 3.1 flow-mind
- 送信トリガー: 共有 bridge を呼び出す
- payload 生成: `shared/senders/flow-mind.js`
- 送信先: `PUT /sync/flow-mind`
- 追加すべき要素:
  - ボタン or ショートカット
  - 送信成功時のトースト/通知
  - 失敗時のエラー表示

### 3.2 flowchart-lab
- 送信トリガー: 図の保存/共有操作
- payload 生成: `shared/senders/flowchart-lab.js`
- 送信先: `PUT /sync/flowchart-lab`

### 3.3 music-suite
- 送信トリガー: 楽曲・譜面共有
- payload 生成: `shared/senders/creative-apps.js`
- 送信先: `PUT /sync/music-suite`
- 送信内容: メタ情報・タイトル・タグ・本文・関連データ

### 3.4 illust-studio
- 送信トリガー: 画像共有
- payload 生成: `shared/senders/creative-apps.js`
- 送信先: `PUT /sync/illust-studio`
- 画像の扱いはサイズ制限を設けるのが安全

### 3.5 kansei
- 送信トリガー: draft / learn / 共有アクション
- payload 生成: `shared/senders/creative-apps.js`
- 送信先: `PUT /sync/kansei`

### 3.6 speak-native
- 送信トリガー: 発話ログ・メモ共有
- payload 生成: `shared/senders/creative-apps.js`
- 送信先: `PUT /sync/speak-native`

### 3.7 共通実装方針
- 各アプリは共通の `app-bridge.js` を呼ぶ
- endpoint と token はグローバル値から取得する
- 送信失敗時は localStorage へ fallback して、後で再送できるようにする

---

## 4. 本番移行チェックリスト

### 4.1 Worker
- [ ] `NORINORI_KV` バインディングが設定されている
- [ ] `Authorization` ヘッダーのトークンが設定されている
- [ ] CORS 設定が確認されている
- [ ] `PUT /sync/:appName` が成功する
- [ ] `GET /sync/:appName` が成功する
- [ ] 不正リクエスト時に 400/404/405 が返る

### 4.2 quick-ref
- [ ] 既存 UI と新規受信カードが共存している
- [ ] 受信後にカードが表示される
- [ ] 重複描画が起きない
- [ ] 旧形式 transfer でも表示される
- [ ] 検索・フィルタ・タグ表示に影響がない

### 4.3 各アプリ
- [ ] endpoint が正しく設定されている
- [ ] token が正しく設定されている
- [ ] 送信成功時に quick-ref に反映される
- [ ] 失敗時にユーザーに伝わる

### 4.4 運用
- [ ] 監視対象のログが残る
- [ ] 失敗時の再送手順がある
- [ ] 互換性ポリシーが明文化されている
- [ ] 旧 payload の扱いが明文化されている

---

## 5. 運用開始後のメンテナンス方針

### 5.1 payload 互換性
- 新旧 payload の schema 変更には互換レイヤーを維持する
- 互換性が必要なフィールドは `legacy` 互換処理として残す
- 破壊的変更はバージョン管理で明示する

### 5.2 旧形式の扱い
- 旧形式の `is_transfer` / `ms_transfer` / `kansei_draft_result` は、将来も読み取り可能な形で残す
- ただし新形式が存在する場合は新形式を優先する

### 5.3 履歴管理
- 直近の同期内容は `sync:last` で追跡できるようにする
- 長期履歴は別途ストレージやログ機構に移す
- 実運用では `sync:last` を監視対象にするのが無難

---

## 6. 実装上の注意点

### 6.1 依存関係
- `shared/sync-common.js` を先に読み込む
- `cloud-sync.js` / `quickref-receiver.js` / `pull-from-worker.js` / `init-sync-ui.js` / `app-bridge.js` をその後に読み込む
- 各 sender は共通 payload helper に依存する

### 6.2 読み込み順
- 既存の `index.html` の順序を維持する
- 共有 UI 初期化は `DOMContentLoaded` 後に実行する
- 送信 bridge は `window` へ登録してから各アプリから参照する

### 6.3 UI 衝突防止
- 受信カードの描画先を固定し、既存カードの再レンダリングと衝突しないようにする
- 既存 `main.js` でのイベントハンドラと競合しないよう、独立したイベント分離を推奨する

---

## 7. 最終総括

本番運用に入る前の最終仕上げとしては、Worker の認証・CORS・KV 設定、quick-ref の受信表示の安定化、各アプリ側の導線埋め込み、移行チェックリストの整備が重要です。既存実装は基盤として十分に成立しており、あとは運用環境での設定値と運用ルールを固定することで本番移行に進めます。
