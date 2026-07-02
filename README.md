# teacher-automation-lab

高校英語教員の校務・教材制作・授業準備を自動化するためのツール置き場です。

## タスク運用

タスク指示書は `tasks/` 配下の作業レーンで管理します。

- `tasks/todo/`: 未着手タスクを置く
- `tasks/doing/`: 作業開始時にタスクを移動する
- `tasks/done/`: 実装完了後にタスクを移動する

実装時は `AGENTS.md` の方針に従います。完了後は、必要に応じて `README.md` と `docs/` も更新します。

## ディレクトリ構成

- `gas/`: Google Apps Script のコード
- `vba/`: Excel / Word 用の VBA マクロ（未着手）
- `web/`: 校務用の小さな Web ツール（未着手）
- `aviutl/`: AviUtl 関連のスクリプト・素材（未着手）
- `samples/`: 動作確認用のダミーデータ（未着手）
- `docs/`: 各ツールの使い方ドキュメント
- `tasks/`: タスク指示書（上記の作業レーン）
- `.claude/skills/`: Claude Code 用の作業手順（テスト問題の検品、納品報告）

## ツール

### Google Forms 小テスト自動作成

Googleスプレッドシートの「問題」シートに入力した文法問題から、Google Forms の小テストを自動作成します。

- コード: `gas/form_generator.gs`
- 使い方: `docs/google_forms_generator.md`
- タスク指示書: `tasks/done/001-google-forms-generator.md`
