# ココロAI 自社HP

https://www.cocoroai.co.jp

## 構成

| 項目 | 内容 |
|------|------|
| ホスティング | GitHub Pages（main ブランチ直接配信） |
| リポジトリ | `mapcocoro/cocoroai-hp` |
| ドメイン | www.cocoroai.co.jp（CNAME） |
| 技術 | HTML / CSS / Vanilla JS |
| チャットウィジェット | Cloudflare Workers（gemini-2.5-pro） |

## ファイル構成

```
cocoroai-hp/
├── index.html          # メインページ
├── style.css           # スタイルシート
├── tokens.css          # デザイントークン（CSS変数）
├── CNAME               # GitHub Pages カスタムドメイン
├── images/             # 画像アセット
└── chat-widget.js      # ここロボちゃんチャット
```

## デプロイ

```bash
git push origin main
```

GitHub Pagesが自動ビルド。反映まで1〜2分。

## 更新履歴

### 2026-05-15
- Bento「読書」タイル刷新（星枕・栞灯、イラスト背景+グラデオーバーレイ）
- NEW RELEASEティッカー追加（CSS animationで自動スクロール）
- Worksセクションを横スクロールカルーセル化（scroll-snap）
- フッター簡略化（SERVICES統合、2カラム、セキュリティ宣言のみ）
- モバイルフォントサイズ・余白の全体バランス調整
- AI TRAININGタイルのレイアウト修正

### 2026-04-30
- 自社HPリニューアル公開

## 旧リポジトリ

- `mapcocoro/cocoroai-new-homepage` — 旧HP（GitHub Pages無効化済み）
- `mapcocoro/cocoroai-website-2026.02NEW` — さらに古い版（プライベート）
