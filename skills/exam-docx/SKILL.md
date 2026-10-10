---
name: exam-docx
description: python-docxで試験問題・解答用紙を生成/検査する際の実証済みテクニック集。表のXML操作、白文字ヒント、隠しデータ検出、docxの正しい読み方。
---

# docx操作スキル（試験用）

このリポジトリで実際に動いた python-docx のパターン集。
生成スクリプトの実例: `scripts/make_answersheet_comm2.py`

## docxを読むとき（検査・精査）

**3層すべてを見る。段落だけ見ると必ず見落とす（実例あり）。**

```python
from docx import Document
doc = Document(path)

# 1. 段落
for i, p in enumerate(doc.paragraphs):
    if p.text.strip(): print(f'P[{i}]', p.text)

# 2. 表（語群リスト・解答欄はほぼ表に入っている）
for ti, t in enumerate(doc.tables):
    for r in t.rows:
        print(' | '.join(c.text.strip() for c in r.cells))

# 3. XML直接（テキストボックス・ヘッダー等は上記に出ない）
# unzip -o file.docx -d exdir → grep 'キーワード' exdir/word/document.xml
```

- 結合セル（gridSpan/vMerge）では `row.cells` が同一セルを複数回返すため、
  同じテキストが並んで見える。異常ではない。
- run単位の情報（色・太字）は `p.runs` / セル内は `cell.paragraphs[n].runs`。

## 白文字ヒントのテクニック（意図的な使い方と検出）

頭文字ヒント `u` だけ見せて残り `niversal` を白文字にする手法が
テンプレートで使われている。**紙配布専用**。データ配布時は削除する。

```python
# 検出
def find_white_runs(doc):
    def scan(paras, where):
        for p in paras:
            for r in p.runs:
                c = r.font.color
                if c and c.type is not None and str(c.rgb) == 'FFFFFF' and r.text.strip():
                    print(f'{where}: {r.text!r}')
    scan(doc.paragraphs, 'body')
    for ti, t in enumerate(doc.tables):
        for ri, row in enumerate(t.rows):
            for ci, cell in enumerate(row.cells):
                scan(cell.paragraphs, f'table{ti}[{ri}][{ci}]')
```

赤字（訂正マーク）の検出も同様に rgb を `FF0000` 系で判定。

## 表の再構築（行数・列数をテンプレートから変える）

テンプレートの罫線・列幅を保ったまま行を作り直すパターン
（大問4を3行×4列→5行×4列にした実例）:

```python
from copy import deepcopy
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

tbl = doc.tables[N]._tbl
ref_tr = tbl.findall(qn('w:tr'))[0]
ref_tcs = ref_tr.findall(qn('w:tc'))
ref_cell = deepcopy(ref_tcs[1])          # スタイル参照用にコピー

for tr in list(tbl.findall(qn('w:tr'))): # 全行削除
    tbl.remove(tr)

for ...:                                  # 必要な行数だけ追加
    tr = OxmlElement('w:tr')
    tc = deepcopy(ref_cell)              # 罫線・幅を引き継ぐ
    _clear_and_set_tc(tc, text)          # 中身だけ差し替え
    tr.append(tc)
    tbl.append(tr)
```

`_clear_and_set_tc`（セルの段落をXMLレベルで全消し→書き直し）の実装は
`scripts/make_answersheet_comm2.py:103` を参照。

## セルへの書き込み（罫線を壊さない）

```python
def write_cell(cell, text, size=9, bold=False):
    p = cell.paragraphs[0]
    p.clear()                       # セル自体は消さない＝罫線・背景が残る
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.size = Pt(size); run.font.bold = bold
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
```

日本語フォント指定は `w:rFonts` の `w:eastAsia` を明示的にセットする
（`set_font` 実装: `scripts/make_answersheet_comm2.py:77`）。

## 解答用紙の設計ルール

- **1枠1語**。複数語の解答（must have left 等）は語数分の枠を作る。
- 解答用紙・模範解答は同一スクリプトの `build(model=True/False)` で
  生成し、二重管理を避ける（模範解答だけ直すと解答用紙とズレる事故防止）。
- 模範解答は bold で区別する。
- 生成後は必ず `exam-verify` スキルで枠数と設問数の一致を確認する。

## ファイルの永続化

- ユーザーのアップロードは `/root/.claude/uploads/<session>/` に入るが
  **セッションが変わるとアクセスできる保証がない**。参照した教材・
  テンプレート・受領した最新版docxは即座に `materials/` にコピーして
  コミットする。
