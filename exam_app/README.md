# 定期考査ジェネレーター (exam_app)

指定フォルダのWord/PDF教材を読み込み、オーダー（order.yaml）通りに定期考査の
問題・解答用紙・模範解答のドラフトを自動生成するツール。

## 役割分担（設計思想）

| 役割 | 担当 | 使用モデル |
|---|---|---|
| 指揮者（オーダー設計・最終判断・精査） | Claude Code上のClaude（あなたとの対話） | — |
| 教材の文字起こし・索引化 | このアプリ | **Haiku** (`claude-haiku-4-5`) 安価・高速 |
| 作問・別解チェック | このアプリ | **Sonnet** (`claude-sonnet-5`) |
| 最終レビュー | 教員 + 指揮者Claude（/exam-verify） | — |

トークン消費を抑えるため、生成はSonnet/Haikuのみ。`skills/` の再発防止ルール
（本文改変禁止・出典必須・別解チェック・1枠1語）はプロンプトに組み込み済み。

## セットアップ

```bash
pip install anthropic python-docx pyyaml
export ANTHROPIC_API_KEY=sk-ant-...
```

## 使い方

```bash
# 1. 教材フォルダを索引化（Haiku）→ materials_index.json
python -m exam_app.cli index --materials ./materials

# 2. オーダーを書く（exam_app/order.example.yaml をコピーして編集）

# 3. 生成（Sonnet）→ output/ にドラフト3点セット + 出典記録
python -m exam_app.cli generate --order my_order.yaml

# 4. 精査: 決定論チェック（無料）＋別解の敵対的検証（Sonnet）
python -m exam_app.cli verify --draft output/exam_draft.json

# 5. 別解が出た問題だけ自動差し替え → 再度 verify
python -m exam_app.cli fix --draft output/exam_draft.json --index materials_index.json

# 6. Word 3点セット出力（API不使用）
python -m exam_app.cli docx --draft output/exam_draft.json
```

## 出力

- `output/exam_draft.md` — 問題ドラフト（確認用）
- `output/exam_draft.json` — 構造化データ（解答・出典込み）
- `output/sources_draft.md` — 出典記録（sources/ へコピーして使う）
- `output/verify_report.md` / `verdicts.json` — 精査結果（fixが読む）
- `output/exam_draft.docx` / `answersheet_draft.docx` / `modelanswer_draft.docx`
  — Word 3点セット（体裁は叩き台。テンプレート運用は scripts/ 方式）

## 決定論チェック（checks.py・API不使用）

過去の事故を機械検出する: 配点合計ズレ / 小問番号の飛び / 出典なし /
答え・出典の重複（rush/conduct事故の対策） / 選択肢の正解偏り。
generate と verify の両方で自動実行される。

## コスト

各コマンド終了時に概算APIコストを表示する（Haiku $1/$5, Sonnet $3/$15 per MTok）。

## API抜き運用（学校PC・APIキーなし）

APIキーが使えない環境では、**作問をClaude Code/Codexのセッション（指揮者）が
skills/ に従って行い**、アプリは無料部分だけ担当する:

```bash
# 教材の索引化（生テキスト・無料）
python -m exam_app.cli index --materials ./materials --no-api

# オーダーから空の雛形を作る
python -m exam_app.cli skeleton --order my_order.yaml

# → output/exam_draft.json の body/answer/source_ref を
#    指揮者(または教員)が埋める。ルールは skills/ 参照。

# 決定論チェック（配点・連番・出典・重複・偏り、無料）
python -m exam_app.cli verify --draft output/exam_draft.json --no-api

# Word 3点セット出力（無料）
python -m exam_app.cli docx --draft output/exam_draft.json
```

別解チェックは skills/exam-unique-answer/SKILL.md の手順で指揮者が実施する。

## 注意（必読）

- **生成物はドラフト。** そのまま出題しない。必ず `/exam-verify` で精査し、
  教員が全問解き直してから使う。
- 教材にない文は作らせない設計だが、**出典欄が空の問題は破棄**すること。
- 大問6（並び替え）は verify の別解チェックを通っても、順列の見落としが
  ありうる。2番目/5番目の答えは人間が確認する。
