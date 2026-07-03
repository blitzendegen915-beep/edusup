# 002-material-shop-site

## 目的

自作教材（PDF・Excelテンプレートなど）を販売するための自前ストアサイトを作り、Google検索に載る状態にする。

## 要件

- サーバー・維持費なしで運用できること（GitHub Pagesで公開）
- 商品はJSONファイルに書くだけで追加できること
- 商品ごとに個別ページが生成され、Googleにインデックスされること
  - title / meta description / canonical / OGP
  - 構造化データ（schema.org Product / ItemList）
  - sitemap.xml / robots.txt の自動生成
- 決済は Stripe Payment Links（リンクを貼るだけ）で行えること
- 無料教材のダウンロード配布にも対応すること
- 特定商取引法に基づく表記ページを持つこと
- main への push で自動デプロイされること（GitHub Actions）

## 構成

- `web/shop/site.json`: サイト設定（サイト名・URL・特商法表記）
- `web/shop/products.json`: 商品データ
- `web/shop/build.js`: 静的サイト生成スクリプト（Node標準機能のみ）
- `web/shop/assets/style.css`: デザイン
- `web/shop/files/`: 無料配布ファイル置き場
- `.github/workflows/deploy-shop.yml`: GitHub Pages 自動デプロイ
- `docs/material_shop.md`: 使い方

## 完了条件

- `node web/shop/build.js` で dist/ にサイト一式が生成される
- トップページ・商品ページ・特商法ページ・sitemap.xml が出力される
- 使い方（Pages有効化・Stripe接続・Search Console登録）がdocsに書かれている
- READMEに簡単な説明が追記される
