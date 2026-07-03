# teacher-automation-lab

高校英語教員の校務・教材制作・授業準備を自動化するためのツール置き場です。

## タスク運用

タスク指示書は `tasks/` 配下の作業レーンで管理します。

- `tasks/todo/`: 未着手タスクを置く
- `tasks/doing/`: 作業開始時にタスクを移動する
- `tasks/done/`: 実装完了後にタスクを移動する

実装時は `AGENTS.md` の方針に従います。完了後は、必要に応じて `README.md` と `docs/` も更新します。

## ツール

### 単語テストメーカー(販売可能な完成品)

単語リストを貼り付けるだけで、印刷用の英単語小テスト(A/B/C/D版・4形式・解答付き)を自動生成する単一HTMLツールです。オフライン動作・インストール不要。

- コード: `web/tango-test-maker.html`(ブラウザで開くだけで動作)
- 販売キット(出品文・価格戦略・1時間アクションプラン): `docs/tango_test_maker_sales_kit.md`

### Google Forms 小テスト自動作成

Googleスプレッドシートの「問題」シートに入力した文法問題から、Google Forms の小テストを自動作成します。

- コード: `gas/form_generator.gs`
- 使い方: `docs/google_forms_generator.md`
- タスク指示書: `tasks/done/001-google-forms-generator.md`
