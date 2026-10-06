# edusup

高校英語教員の校務・教材制作・授業準備を自動化するためのツール置き場です。

## タスク運用

タスク指示書は `tasks/` 配下の作業レーンで管理します。

- `tasks/todo/`: 未着手タスクを置く
- `tasks/doing/`: 作業開始時にタスクを移動する
- `tasks/done/`: 実装完了後にタスクを移動する

実装時は `AGENTS.md` の方針に従います。完了後は、必要に応じて `README.md` と `docs/` も更新します。

## ツール

### Google Forms 小テスト自動作成

Googleスプレッドシートの「問題」シートに入力した文法問題から、Google Forms の小テストを自動作成します。

- コード: `gas/form_generator.gs`
- 使い方: `docs/google_forms_generator.md`
- タスク指示書: `tasks/done/001-google-forms-generator.md`

### 教材ストア（販売サイト）

自作教材（PDF・Excelなど）を販売する自前ストアサイトです。商品を `products.json` に書いて push するだけで GitHub Pages に自動公開されます。Google検索向けのSEO対応（商品ごとの個別ページ・構造化データ・sitemap.xml）と、Stripe 支払いリンクによる決済に対応しています。

- コード: `web/shop/`
- 使い方: `docs/material_shop.md`
- タスク指示書: `tasks/done/002-material-shop-site.md`

### Kindle用 英単語帳ジェネレーター

単語リスト（CSV）から、Kindle（KDP）にそのままアップロードできる英単語帳（EPUB）を作ります。1ページ1単語のカードと、選択肢をタップすると正解・不正解ページにジャンプする「ボス戦」で、集中が続きにくい生徒でもゲーム感覚で進められる構成です。サンプルとして高校基礎100語・表紙を同梱しています。

- コード: `kindle/vocab-book/`（`node kindle/vocab-book/build.js` で生成）
- 使い方・KDP出版手順: `docs/kindle_vocab_book.md`
- タスク指示書: `tasks/done/006-kindle-vocab-book.md`
