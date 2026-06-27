# セットアップ・設定リスト

## 🔑 個別に設定が必要な項目

### 1. APIキー (localStorage に保存)

| キー名 | 用途 | 取得先 | 使用ファイル |
|--------|------|--------|------------|
| `ml_claude` | 原稿生成・翻訳・フレーズ抽出 | console.anthropic.com | draft.html / learn.html |
| `ml_gemini` | 同上(Gemini使用時) | aistudio.google.com | draft.html / learn.html |
| `ml_openai` | 同上(OpenAI使用時) | platform.openai.com | draft.html / learn.html |

**設定場所:**
- `draft.html` → ⚙️ → 各APIキー欄
- `learn.html` → ⚙️ → 各APIキー欄
- または Working Copy で直接 localStorage に書く:
  ```javascript
  localStorage.setItem('ml_claude', 'sk-ant-...');
  localStorage.setItem('ml_gemini', 'AIza...');
  localStorage.setItem('ml_openai', 'sk-...');
  ```

---

### 2. Cloudflare Workers プロキシ (Surface でデプロイ必要)

| キー名 | 値の例 | 用途 |
|--------|--------|------|
| `kansei_proxy_url` | `https://kansei-proxy.workers.dev` | APIキーをクライアントに露出させない |

**デプロイ手順 (Surface):**
```bash
npm install -g wrangler
wrangler login
# worker.js を作成してデプロイ
wrangler deploy
```

**worker.js の最小構成:**
```javascript
export default {
  async fetch(request, env) {
    const body = await request.json();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return new Response(await res.text(), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
```

---

### 3. GitHub Pages デプロイ

#### quick-ref
```
リポジトリ: norinori-jan/quick-ref
Settings → Pages → Branch: main / (root)
URL: https://norinori-jan.github.io/quick-ref/
```

#### kansei
```
リポジトリ: norinori-jan/kansei
Settings → Pages → Branch: main / (root)
URL: https://norinori-jan.github.io/kansei/
```

**ファイル配置:**
```
quick-ref/
├── index.html
├── manifest.json
├── sw.js
├── icon-192.png     ← アプリ内生成 (⋯→🎨アイコン生成) してDL・配置
└── icon-512.png     ← 同上

kansei/
├── draft.html
└── learn.html
```

---

### 4. アイコン生成 (ブラウザ内で完結)

```
quick-ref を開く
→ ⋯ メニュー → 🎨 アイコンを生成・ダウンロード
→ [↓ 192px] / [↓ 512px] でダウンロード
→ Working Copy でリポジトリに配置してコミット
```

---

### 5. モデル選択 (各アプリ内で設定)

#### draft.html
```
⚙️ → 生成モデル
  - Claude Sonnet    (標準・高品質)
  - Claude Haiku     (速い・安い)
  - Gemini 2.0 Flash (Google)
  - GPT-4o-mini      (OpenAI)
```

#### learn.html
```
⚙️ → AIモデル
  - Auto (Gemini → Claude → OpenAI の順で自動)
  - 個別指定も可
```

---

### 6. TTS音声 (learn.html)

```
learn.html → ⚙️ → 英語音声
→ デバイスにインストールされた英語音声から選択
```

**iOS でより自然な音声を追加する方法:**
```
設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 英語
→ Samantha (Enhanced) / Aaron (Enhanced) などをダウンロード
```

---

### 7. ホーム画面テーマ別ショートカット

```
quick-ref を開く
→ ⋯ → 📱 テーマ別URL一覧を表示
→ 目的のURLをコピー → Safari で開く
→ テーマバナー [🎨 アイコン] でアイコン生成
→ Safari 共有 → ホーム画面に追加
```

**URL形式:**
```
https://norinori-jan.github.io/quick-ref/?tag=音楽
https://norinori-jan.github.io/quick-ref/?tag=コマンド
```

---

### 8. 他アプリ連携 (別途実装が必要)

#### illust-studio → quick-ref (画像送信)
illust-studio の `gallery/index.html` に追加が必要:
```javascript
localStorage.setItem('is_transfer', JSON.stringify({
  image: canvas.toDataURL('image/png'),
  title: 'タイトル'
}));
location.href = 'https://norinori-jan.github.io/quick-ref/';
```

#### music-suite → quick-ref (楽曲データ送信)
beat-lab/score-editor に追加が必要:
```javascript
localStorage.setItem('ms_transfer', JSON.stringify({
  source: 'beat-lab',
  bpm: 120,
  key: 'Cm',
  melody: [...],
  chords: [...]
}));
location.href = 'https://norinori-jan.github.io/quick-ref/';
```

---

## ✅ 設定完了チェックリスト

```
□ GitHub Pages: quick-ref 公開済み
□ GitHub Pages: kansei 公開済み
□ icon-192.png / icon-512.png 配置済み
□ APIキー設定 (ml_claude / ml_gemini / ml_openai いずれか1つ以上)
□ Cloudflare Workers デプロイ済み (任意・Surface作業)
□ ホーム画面にquick-refを追加
□ ホーム画面にテーマ別ショートカット追加 (任意)
□ iOS TTS 音声ダウンロード (任意・Enhancedを推奨)
□ illust-studio 側の送信ボタン実装 (任意)
□ music-suite 側の送信処理実装 (任意)
```

---

## 💡 追加機能の提案

### 優先度 ★★★ (すぐ作れる・効果大)

#### A. 音声入力 → 即クイック保存 (quick-ref)
話しかけるだけで項目が自動作成される。
```
🎤 タップ → 日本語で話す
→ Claude が「タイトル」「タグ」「本文」に自動分類
→ 確認タップで保存
```
実装: Web Speech API + Claude API (Haiku)  
コスト: 1回 約0.001円

#### B. 曖昧検索 (quick-ref)
現状の完全一致検索に加え、表記ゆれ・部分一致を強化。
```
「しゃど」→「シャドーイング」がヒット
「ssh」→「SSHコマンド」「ssh接続」がヒット
「てぃーてぃーえす」→「TTS」がヒット
```
実装: 独自スコアリング(ライブラリ不要)

#### C. 項目間の自動リンク (quick-ref)
保存時にタグ・キーワードが重なる項目を「関連項目」として表示。
```
「シャドーイング」→「learn.html」「TTS設定」が関連として表示
```

#### D. learn.html → 単語カード (フラッシュカード)
重要フレーズを裏面にして記憶テスト。
```
表: "breathtaking"
→ タップ →
裏: 「息をのむほど美しい」+ 例文
```

---

### 優先度 ★★ (中期)

#### E. kansei 旅行記インデックスページ
```
kansei/index.html
→ travel/ フォルダの記事一覧を自動生成
→ note.com リンク付き
→ GitHub Pages でポートフォリオ化
```

#### F. 音源の JSON エクスポート対応
現状: 音声Blobはバックアップ対象外  
対策: Base64エンコードしてJSONに含める or iCloud Drive連携

#### G. quick-ref ウィジェット風トップ画面
`?widget=true` パラメータで最重要項目3件だけ表示するミニビュー。
ホーム画面ショートカットをウィジェット代わりに使える。

#### H. draft.html → Notion/Obsidian エクスポート
生成した原稿を Markdown + frontmatter 形式で出力。
```yaml
---
title: 茨城ひとり旅
date: 2026-07-12
tags: [旅行記, 茨城, note]
lang: ja
---
```

---

### 優先度 ★ (長期・実験的)

#### I. Claude との対話で項目を深掘り (quick-ref)
カードを開いた状態で「このメモについて質問する」ボタン。
チャット形式でClaudeが関連情報を補足。

#### J. learn.html → 発音スコアリング
録音した音声をAPIで分析し、ネイティブ発音との類似度をスコア表示。
(現状のAPIでは難しい。将来的にGemini音声APIが安定したら)

#### K. 占い・梅花心易モジュール (quick-ref)
fortune-project との連携。
今日の卦をquick-refのタグ「易」で参照できる形に。

---

## 🗺 ロードマップ

### Phase 1 — 基盤完成 (今ここ)
```
✅ quick-ref: CRUD/検索/タグ/PIN/画像/音源/PWA/バックアップ
✅ quick-ref → kansei: 素材送信
✅ kansei/draft.html: 5モード/日英/音声入力/マルチモデル
✅ kansei/learn.html: シーン学習/TTS/翻訳/フレーズ/シャドーイング/会話生成
```

### Phase 2 — 連携強化 (次の1〜2セッション)
```
□ A. 音声入力 → 自動タグ付け・即保存 (quick-ref)
□ B. 曖昧検索 (quick-ref)
□ illust-studio: 「quick-refに送る」ボタン実装
□ music-suite: ms_transfer 書き込み実装
□ Cloudflare Workers デプロイ (Surface)
□ kansei/index.html: 旅行記アーカイブ自動生成
```

### Phase 3 — 学習強化 (2〜4セッション先)
```
□ D. フラッシュカードモード (learn.html)
□ C. 自動リンク (quick-ref)
□ F. 音源バックアップ対応
□ G. ウィジェット風ミニビュー
□ H. Obsidian/Notion エクスポート
```

### Phase 4 — AI深化 (中長期)
```
□ I. Claude対話で項目を深掘り
□ speak-native との学習履歴共有
□ K. fortune-project 連携
□ 全アプリ統合インデックス
```

---

## 📊 localStorage キー 完全一覧

| キー | 型 | 用途 | 書くアプリ | 読むアプリ |
|------|----|------|-----------|-----------|
| `ml_claude` | string | Claude APIキー | 全アプリ | 全アプリ |
| `ml_gemini` | string | Gemini APIキー | 全アプリ | 全アプリ |
| `ml_openai` | string | OpenAI APIキー | 全アプリ | 全アプリ |
| `kansei_proxy_url` | string | Cloudflareプロキシ | 手動設定 | draft/learn |
| `kansei_model` | string | 選択中のモデル | draft/learn | draft/learn |
| `kansei_length` | string | 出力の長さ | draft | draft |
| `kansei_materials` | JSON | quick-ref素材 | quick-ref | draft |
| `kansei_learn` | JSON | 学習テキスト | draft | learn |
| `kansei_learn_progress` | JSON | 学習進捗 | learn | learn |
| `kansei_learn_cache` | JSON | 翻訳・フレーズキャッシュ | learn | learn |
| `kansei_learn_content` | string | キャッシュ判定用ハッシュ | learn | learn |
| `qr_pin_meta` | JSON | PINハッシュ情報 | quick-ref | quick-ref |
| `qr_last_backup` | string | 最終バックアップ日時 | quick-ref | quick-ref |
| `ecosystem_tags` | JSON | タグ共有 | quick-ref | illust/music |
| `is_transfer` | JSON | 画像転送 | illust-studio | quick-ref |
| `ms_transfer` | JSON | 楽曲データ転送 | music-suite | quick-ref |
| `learn_rate` | string | TTS速度 | learn | learn |
| `learn_voice` | string | TTS音声URI | learn | learn |

