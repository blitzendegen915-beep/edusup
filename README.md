# edusup

高校英語教員の校務・教材制作・授業準備を自動化するためのツール置き場です。

## タスク運用

タスク指示書は `tasks/` 配下の作業レーンで管理します。

- `tasks/todo/`: 未着手タスクを置く
- `tasks/doing/`: 作業開始時にタスクを移動する
- `tasks/done/`: 実装完了後にタスクを移動する

実装時は `AGENTS.md` の方針に従います。完了後は、必要に応じて `README.md` と `docs/` も更新します。

## ツール

### 定期考査スタジオ（定期考査作成ツール）

教材の文をクリックして、聞きたいところを聞きたい形式（空所補充・並び替え・4択・誤文訂正・語形変化・下線部・和訳）で作問し、問題用紙・解答用紙・模範解答を Word で出力します。別解の警告・配点や解答枠の自動チェック付き。APIキーなしで使えます（AI作問は任意）。

- 定期考査（英コミュⅠ・Ⅱ・英語演習）と英単語テストの実物に合わせた **テンプレート**（自分で編集・保存可）
- **カテゴリー**で試験を分類（定期考査・英単語テスト・小テスト…を自分で追加・改名）
- **英単語テスト**: Excelの単語表を貼り付けるだけで、単語リスニング・英英定義・英⇔日4択・例文4択・綴りを自動作成
- 通し番号・【1】見出し・表紙・選択肢の表・語群・採点基準・個別配点・全データのバックアップ

- 起動: `start_exam_studio.bat`（Windows）／`python -m exam_app.ui`
- コード: `exam_app/`（画面: `exam_app/ui/`）
- 使い方: `docs/exam_studio.md`
- 作問ルール: `skills/README.md`

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
