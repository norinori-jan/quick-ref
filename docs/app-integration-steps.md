# 各アプリ側への導線埋め込み手順

## 1. 共通前提
- すべてのアプリで同じグローバル値を使う
  - `window.NORINORI_SYNC_ENDPOINT = 'https://<worker>.workers.dev/sync'`
  - `window.NORINORI_SYNC_TOKEN = 'my-super-secret-token-2026'`
- 送信時は `Authorization: Bearer my-super-secret-token-2026` を付与する

## 2. 実装手順

### 2.1 flow-mind
1. 共有ボタンまたはメニューに送信アクションを追加する
2. 送信前に `window.norinoriSendersFlowMind.buildFlowMindPayload(...)` を呼ぶ
3. 生成した payload を `window.norinoriAppBridge.sendToWorker(payload, { appName: 'flow-mind' })` に渡す
4. 成功時に quick-ref へ反映されたことを確認する

### 2.2 flowchart-lab
1. 図の保存・共有操作にフックする
2. `window.norinoriSendersFlowchartLab.buildFlowchartPayload(...)` を呼ぶ
3. 生成した payload を bridge へ渡す
4. ノード構造を `content` に入れて送る

### 2.3 music-suite
1. 曲の共有・保存ボタンに送信処理を追加する
2. `buildMusicPayload(...)` を呼ぶ
3. `bpm` / `key` / `chords` を content にまとめて送る
4. 送信成功時に quick-ref でカードが出ることを確認する

### 2.4 illust-studio
1. 画像共有操作にフックする
2. `buildIllustPayload(...)` を呼ぶ
3. `imageUrl` を metadata / attachments に入れる
4. 画像サイズが大きすぎる場合は圧縮・縮小を検討する

### 2.5 kansei
1. draft / learn / 共通共有ボタンに送信処理を追加する
2. `buildKanseiPayload(...)` を呼ぶ
3. `draft` を content に入れて送る
4. 旧形式のデータがある場合は互換処理を維持する

### 2.6 speak-native
1. 発話ログ・メモ保存時に送信処理を追加する
2. `buildSpeakNativePayload(...)` を呼ぶ
3. lesson / 発話内容を content にまとめて送る
4. 失敗時は localStorage へ fallback する

## 3. 送信共通パターン
```js
const endpoint = window.NORINORI_SYNC_ENDPOINT || '/sync';
const token = window.NORINORI_SYNC_TOKEN || '';
const payload = window.norinoriSendersFlowMind.buildFlowMindPayload({
  title: 'サンプル',
  body: '内容',
  nodes: [],
  edges: []
});

window.norinoriAppBridge.sendToWorker(payload, { appName: 'flow-mind', endpoint, token });
```

## 4. quick-ref での受信確認ポイント
- payload が `window.norinoriQuickRefReceiver.processPayload(...)` で受け取られる
- `cardList` / `cards` / `[data-sync-receiver]` にカードが描画される
- 受信後に重複しないこと

## 5. 失敗時の扱い
- 送信失敗時は localStorage へ保存
- 後で再送できるように queue を残す
- ユーザーに「送信失敗」を表示する
