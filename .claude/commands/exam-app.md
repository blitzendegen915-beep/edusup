# 定期考査自動生成アプリの実行

`exam_app/README.md` を読み、以下のワークフローを実行してください。
あなたは指揮者役: 生成はアプリ内のSonnet/Haikuに任せ、あなた自身で問題文を
書き直さないこと。

引数: `$ARGUMENTS`（教材フォルダやオーダーの指定。未指定なら確認する）

## 手順

1. `ANTHROPIC_API_KEY` の有無を確認（無ければユーザーに設定を依頼して停止）
2. 教材フォルダを確認し `python -m exam_app.cli index --materials <folder>`
3. オーダーが無ければ `exam_app/order.example.yaml` を基にユーザーと相談して作成
4. `generate` → `verify` を実行。別解ありなら `fix` → 再 `verify`
5. `docx` でWord 3点セットを出力
6. `sources_draft.md` を `sources/<試験ID>.md` へ整理してコミット
7. 最後に `skills/exam-verify/SKILL.md` の手順で自分でも最終精査し、
   「ドラフトであり教員の解き直しが必要」と明記して報告する
