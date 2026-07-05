# norinori-apps sync implementation

## 追加した実装
- shared/sync-common.js
  - APP_NAMES / SYNC_KEYS 定義
  - createPayload / validatePayload
  - ローカル保存・復元ヘルパー
- shared/cloud-sync.js
  - CloudSyncClient
  - PUT / GET による同期送受信
- shared/quickref-receiver.js
  - quick-ref で payload を受け取りカード化
  - 既存の legacy transfer も互換対応
- shared/senders/
  - flow-mind.js
  - flowchart-lab.js
  - creative-apps.js
  - security-apps.js
- shared/sync-worker.js
  - Cloudflare Workers + KV の最小実装

## API 仕様
- PUT /sync/:appName
  - リクエストボディ: payload JSON
  - KV に sync:${appName} と sync:last を保存
- GET /sync/:appName
  - 指定 appName の最新 payload を返す

## 使い方の例
```js
const common = window.norinoriSyncCommon;
const client = new window.norinoriCloudSync.CloudSyncClient({ endpoint: '/sync', appName: common.APP_NAMES.FLOW_MIND });
const payload = window.norinoriSendersFlowMind.buildFlowMindPayload({ title: 'メモ', body: '内容', nodes: [], edges: [] });
client.send(payload);
```

## 注意点
- 実際の Cloudflare Workers では KV バインディング名を NORINORI_KV に合わせてください。
- セキュリティ系アプリはメタ情報のみを送る設計にしています。
- 既存の localStorage 連携も引き続き読み取るようにしています。
