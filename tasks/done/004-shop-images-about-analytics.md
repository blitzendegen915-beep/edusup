# 004-shop-images-about-analytics

## 目的

教材ストアを「売れる状態」に近づける改良を行う。

1. 商品にサンプル画像を載せられるようにする（購入率・SNSシェア対策）
2. 制作者紹介ページを作る（信頼性・E-E-A-T）
3. プライバシーポリシーページを作る
4. Google Analyticsを設定だけで有効化できるようにする
5. vocab-battle（英単語ゲーム）と相互リンクして集客導線を作る

## 要件

### 商品画像

- 商品に `images` フィールド（配列）を追加。画像は `web/shop/images/` に置く
- トップページの商品カードに1枚目をサムネイル表示する
- 商品ページにギャラリー表示（クリックで拡大）
- 1枚目を og:image / twitter:card(summary_large_image) / JSON-LDのimage に使う
- 管理画面から画像をアップロードできるようにする
- ダミー商品4件分のサンプル画像を生成して同梱する

### 固定ページ

- `/about.html`: `site.json` の `about` から生成。Person構造化データつき
- `/privacy.html`: お問い合わせ・Stripe決済・GAのCookieをカバー
- フッターに両ページへのリンクを追加し、sitemap.xmlにも載せる

### アクセス解析

- `site.json` の `googleAnalyticsId` に測定IDを入れると全ページにgtagが入る（空なら何も入れない）

### vocab-battle連携

- ストアのトップページに無料ゲームへの誘導セクション（`site.json` の `freeContent`）
- vocab-battle側のフッターにストアへのリンクを追加

## 完了条件

- `node web/shop/build.js` で about/privacy/画像込みのサイトが生成される
- 商品ページのOGP・JSON-LDに画像が入っている
- docs/material_shop.md に画像・GA・固定ページ・連携の使い方が書かれている
