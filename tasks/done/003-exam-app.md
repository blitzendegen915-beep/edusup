# 003 定期考査自動生成アプリ (exam_app)

状態: 完了 (2026-07)

## 成果物
- `exam_app/` — index(Haiku) / generate(Sonnet) / verify / fix / docx の5コマンドCLI
- `exam_app/checks.py` — 決定論チェック（配点・連番・出典・重複・偏り）
- `exam_app/tests/test_offline.py` — API不使用の回帰テスト5件（全合格）
- `.claude/commands/exam-app.md` — /exam-app スラッシュコマンド
- `skills/` — exam-verify / exam-provenance / exam-unique-answer /
  exam-docx / exam-answersheet（Codex共用、AGENTS.mdから参照）
- `sources/2026-comm2-1kimatsu.md` — 1学期期末の全設問出典記録

## 未了・次回
- APIキーを設定して index→generate の実戦テスト（2学期中間で試す）
- 教材スキャンPDF（Heartening II WB / 動画でわかる英文法）の再アップロード
  → materials/ に永続保存（sources/ に「要再アップロード」と記載済み）
- docx出力の体裁調整（現状は叩き台。テンプレート方式 scripts/ と併用）
