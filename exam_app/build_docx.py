"""試験データ（exam_draft.json / 画面のプロジェクト）→ Word 3点セット。

実物の定期考査・英単語テストの形式に合わせている:
・表紙（学年・科目・試験名・実施日・受験上の注意）／表紙なしなら1行目に試験名と実施日
・大問見出しは「１　指示文（9点）」または「【1】指示文（各1点）」
・通し番号（1, 2, 3…。並び替えは答える箇所ごとに番号）または大問ごとの (1)(2)…
・選択肢は表に並べる（英単語テストの「16. haven | 1.植民地 | 2.議会 …」形式）、語群は大問の下に
・問題文中の __語句__ は下線
・解答用紙は1行に複数問を詰め、解答枠は答えの語数どおり（1枠1語 / skills/exam-answersheet）
・解答用紙と模範解答は同じ関数から生成し、二重管理によるズレを防ぐ
"""
import math
import re
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

from . import layout
from .layout import answer_slots

FONT_EN = "Times New Roman"
FONT_JA = "MS Mincho"
_UNDERLINE = re.compile(r"__(.+?)__")
CENTER = WD_ALIGN_PARAGRAPH.CENTER
RIGHT = WD_ALIGN_PARAGRAPH.RIGHT
GRAY = RGBColor(0x80, 0x80, 0x80)
DARK = RGBColor(0x44, 0x44, 0x44)
DEFAULT_CAUTIONS = [
    "試験開始の合図があるまでこの問題冊子を開いてはいけません。",
    "試験中は監督者の指示に従いなさい。",
    "解答は全て解答用紙の枠内に丁寧な文字で記入しなさい。",
    "問題の指示がある場合はそれに従いなさい。",
]


def _new_doc() -> Document:
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.left_margin = sec.right_margin = Mm(16)
    sec.top_margin = sec.bottom_margin = Mm(14)
    normal = doc.styles["Normal"]
    normal.font.name = FONT_EN
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT_JA)
    normal.paragraph_format.space_after = Pt(2)
    return doc


def _page_numbers(doc):
    """フッター中央にページ番号（－ 1 －）を入れる。"""
    for sec in doc.sections:
        p = sec.footer.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _run(p, "－ ", 9)
        fld = OxmlElement("w:fldSimple")
        fld.set(qn("w:instr"), "PAGE")
        r = OxmlElement("w:r")
        t = OxmlElement("w:t")
        t.text = "1"
        r.append(t)
        fld.append(r)
        p._p.append(fld)
        _run(p, " －", 9)


def _keep(paras):
    """1つの問題の行を、ページの途中で分けない（最後の行以外を「次の段落と分離しない」に）。"""
    for p in paras[:-1]:
        p.paragraph_format.keep_with_next = True


def _finish(doc, out: Path) -> Path:
    """仕上げ: 表の行をページの途中で分割しない（本文の枠は長いので除く）・ページ番号。"""
    for t in doc.tables:
        if len(t.rows) == 1 and len(t.columns) == 1:
            continue  # 本文の枠
        for row in t.rows:
            trPr = row._tr.get_or_add_trPr()
            if trPr.find(qn("w:cantSplit")) is None:
                trPr.append(OxmlElement("w:cantSplit"))
    _page_numbers(doc)
    doc.save(str(out))
    return out


def _run(p, text, size=None, bold=False, underline=False, color=None):
    run = p.add_run(text)
    if size:
        run.font.size = Pt(size)
    run.font.bold = bold
    run.font.underline = underline
    if color is not None:
        run.font.color.rgb = color
    run.font.name = FONT_EN
    rpr = run._r.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    fonts.set(qn("w:eastAsia"), FONT_JA)
    return run


def _rich(p, text, size=None, bold=False):
    """__語句__ を下線にして段落に書く。"""
    pos = 0
    for m in _UNDERLINE.finditer(text):
        if m.start() > pos:
            _run(p, text[pos:m.start()], size, bold)
        _run(p, m.group(1), size, bold, underline=True)
        pos = m.end()
    if pos < len(text):
        _run(p, text[pos:], size, bold)


def _para(parent, text="", size=None, bold=False, align=None, indent_mm=0, before=0, after=None, keep=False):
    p = parent.add_paragraph()
    if keep:  # 見出しは次の段落と同じページに
        p.paragraph_format.keep_with_next = True
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    if indent_mm:
        pf.left_indent = Mm(indent_mm)
    if before:
        pf.space_before = Pt(before)
    if after is not None:
        pf.space_after = Pt(after)
    _rich(p, text, size, bold)
    return p


def _cell(cell, text="", bold=False, size=10, align=CENTER, small=None):
    """セルに書く。small は左上に小さく出す見出し（解答番号・「2番目」など）。"""
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_after = Pt(0)
    if small:
        _run(p, small + ("\n" if text else ""), 8, color=DARK)
    if text:
        _rich(p, text, size, bold)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def _shade(cell, fill="E6E6E6"):
    """使わない枠をグレーにする（枠の数＝解答の語数を守るため）。"""
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(shd)


def _no_borders(table):
    tblPr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tblPr.append(borders)


TEXT_MM = 178  # 本文の幅（A4 210mm − 左右余白 16mm×2）


def _widths(table, mm):
    """表の列幅を固定する（Word・LibreOffice の両方で効くよう、列とセルの両方に入れる）。"""
    table.autofit = False
    tblPr = table._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblPr.append(layout)
    for i, w in enumerate(mm):
        if i < len(table.columns):
            table.columns[i].width = Mm(w)
    for row in table.rows:
        for i, w in enumerate(mm):
            if i < len(row.cells):
                row.cells[i].width = Mm(w)


def _choice_table(doc, rows, style, lead=True):
    """選択肢の表。rows = [(先頭セルの文字 or None, choices), ...]"""
    width = max(len(c) for _, c in rows)
    cols = width + (1 if lead else 0)
    t = doc.add_table(rows=len(rows), cols=cols)
    _no_borders(t)
    # 列幅: 問題文の列は中身に合わせ（番号だけなら細く）、残りを選択肢で等分
    head_mm = (12 if all(len(h or "") <= 5 for h, _ in rows) else 52) if lead else 10
    choice_mm = (TEXT_MM - head_mm) / max(1, width)
    _widths(t, [head_mm] + [choice_mm] * width if lead else [choice_mm] * width)
    if not lead:  # 問題文の下に並べる選択肢は、問題文の英文と同じだけ字下げする
        ind = OxmlElement("w:tblInd")
        ind.set(qn("w:w"), str(int(head_mm * 56.7)))
        ind.set(qn("w:type"), "dxa")
        t._tbl.tblPr.append(ind)
    for r, (head, choices) in enumerate(rows):
        cells = t.rows[r].cells
        if lead:
            _cell(cells[0], head or "", align=WD_ALIGN_PARAGRAPH.LEFT)
        for j, text in enumerate(layout.choice_line(style, choices)):
            _cell(cells[j + (1 if lead else 0)], text, align=WD_ALIGN_PARAGRAPH.LEFT)
    return t


def _cover(doc, exam):
    c = exam.get("cover") or {}
    _para(doc, "", after=60)
    for text, size in ((c.get("grade"), 20), (c.get("subject"), 26), (c.get("name") or exam.get("title"), 22)):
        if text:
            _para(doc, text, size, True, CENTER, after=10)
    if exam.get("date"):
        _para(doc, exam["date"], 13, False, CENTER, before=10, after=40)
    cautions = [x.strip() for x in str(c.get("cautions") or "").split("\n") if x.strip()] or DEFAULT_CAUTIONS
    _para(doc, "受験上の注意", 12, True, before=20, after=6)
    for line in cautions:
        _para(doc, "※ " + line.lstrip("※ ").strip(), 10.5, indent_mm=6, after=3)
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


def _title_line(doc, exam, suffix=""):
    title = exam.get("title", "") + suffix
    if exam.get("date") and not suffix:
        t = doc.add_table(rows=1, cols=2)
        t.style = "Table Grid"
        _widths(t, [TEXT_MM - 52, 52])
        _cell(t.rows[0].cells[0], title, bold=True, size=12, align=WD_ALIGN_PARAGRAPH.LEFT)
        _cell(t.rows[0].cells[1], exam["date"], size=10, align=RIGHT)
        t.rows[0].height = Mm(10)
        _para(doc, "", after=2)
    else:
        _para(doc, title, 12.5, True, CENTER, after=6)


def _compact_choices(sec) -> bool:
    """英単語テストのように、問題文が短く全問に選択肢がある大問は1つの表にまとめる。"""
    qs = sec.get("questions", [])
    return bool(qs) and all(q.get("choices") and "\n" not in (q.get("body") or "")
                            and len(q.get("body") or "") <= 40 and _short_choices(q["choices"]) for q in qs)


def _short_choices(choices) -> bool:
    """選択肢が短く、横に4つ並べても読める（内容一致のような文の選択肢は縦に並べる）。"""
    return max((len(str(c)) for c in choices), default=0) <= 18


def _passage(doc, text):
    """本文を枠で囲んで載せる（段落は改行で分ける。__語句__ は下線）。"""
    t = doc.add_table(rows=1, cols=1)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    _widths(t, [TEXT_MM - 2])
    cell = t.rows[0].cells[0]
    cell.text = ""
    first = True
    for line in str(text).split("\n"):
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.first_line_indent = Mm(4) if line.strip() else None
        _rich(p, line.strip(), 10.5)
    _para(doc, "", after=2)


def _questions(doc, sec, nums):
    """設問1つ分の問題を書く。"""
    qs = sec.get("questions", [])
    style = sec.get("choice_style") or "1"
    if _compact_choices(sec):
        _choice_table(doc, [(f"{n['label']} {q.get('body') or ''}".strip(), q["choices"])
                            for q, n in zip(qs, nums)], style)
    else:
        for q, n in zip(qs, nums):
            lines = (q.get("body") or "").split("\n")
            block = []
            if not lines[0].strip() and q.get("choices") and not _short_choices(q["choices"]):
                # 問題文のない内容一致: 番号のすぐ横から選択肢を並べる
                for k, line in enumerate(layout.choice_line(style, q["choices"])):
                    para = _para(doc, (f"{n['label']}　" if k == 0 else "") + line, indent_mm=10, before=3 if k == 0 else 0)
                    para.paragraph_format.first_line_indent = Mm(-8) if k == 0 else None
                    block.append(para)
                _keep(block)
                continue
            block.append(_para(doc, f"{n['label']}　{lines[0]}", indent_mm=2, before=3))
            for line in lines[1:]:
                block.append(_para(doc, line, indent_mm=10))
            labels = n["slots"] or q.get("slot_labels") or []
            line = layout.reorder_line(q, labels)
            if line:
                block.append(_para(doc, line, indent_mm=10, before=2))
            if q.get("choices"):
                if _short_choices(q["choices"]):
                    block.append(None)  # 直後の選択肢の表とも離さない
                    _keep([b for b in block if b is not None] + [None])
                    _choice_table(doc, [(None, q["choices"])], style, lead=False)
                    continue
                for line in layout.choice_line(style, q["choices"]):  # 文の選択肢（内容一致など）は1行に1つ
                    block.append(_para(doc, line, indent_mm=10))
            _keep(block)
    bank = [b for b in (sec.get("bank") or []) if str(b).strip()]
    if bank:
        _para(doc, "【語群】", 10.5, True, before=4, keep=True)
        items = layout.choice_line(sec.get("bank_style") or style, bank)
        t = doc.add_table(rows=math.ceil(len(items) / 5), cols=5)
        _no_borders(t)
        for k, text in enumerate(items):
            _cell(t.rows[k // 5].cells[k % 5], text, align=WD_ALIGN_PARAGRAPH.LEFT)


def build_exam(draft: dict, outdir: Path) -> Path:
    doc = _new_doc()
    exam = draft["exam"]
    if (exam.get("cover") or {}).get("enabled"):
        _cover(doc, exam)
    _title_line(doc, exam)
    plan = layout.numbering(draft)
    secs = draft["sections"]
    layout.apply_labels(secs)
    for g in layout.groups(secs):
        made = [i for i in g if secs[i].get("questions")]
        head = secs[g[0]]
        if not made:
            continue  # 未作成の大問は用紙に出さない（チェックで警告される）
        multi = len(g) > 1
        if multi:
            _para(doc, layout.big_heading(exam, [secs[i] for i in g]), 10.5, True, before=10, after=4, keep=True)
        else:
            _para(doc, layout.heading(exam, head), 10.5, True, before=10, after=4, keep=True)
        if str(head.get("passage") or "").strip():
            _passage(doc, head["passage"])
        for i in made:
            sec, nums = secs[i], plan[i]
            if multi:
                _para(doc, layout.part_heading(exam, sec), 10.5, True, before=6, after=2, keep=True)
            _questions(doc, sec, nums)
    _para(doc, exam.get("end_note") or "問題は以上です。", align=RIGHT, before=12)
    return _finish(doc, outdir / "exam_draft.docx")


def _sheet_header(doc, exam):
    fields = [f.strip() for f in str(exam.get("sheet_fields") or "組,番,氏名,得点").split(",") if f.strip()]
    t = doc.add_table(rows=1, cols=len(fields) * 2)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.RIGHT
    _widths(t, [w for f in fields for w in (13, 48 if f == "氏名" else 15)])
    for i, f in enumerate(fields):
        _cell(t.rows[0].cells[i * 2], f, size=9)
        _cell(t.rows[0].cells[i * 2 + 1], "")
    t.rows[0].height = Mm(10)
    _para(doc, "", after=2)


def build_answersheet(draft: dict, outdir: Path, model: bool) -> Path:
    """model=False: 解答用紙（空欄） / True: 模範解答（太字で記入）"""
    doc = _new_doc()
    exam = draft["exam"]
    _title_line(doc, exam, "　模範解答" if model else "　解答用紙")
    if not model:
        _sheet_header(doc, exam)
    plan = layout.numbering(draft)
    secs = draft["sections"]
    layout.apply_labels(secs)
    order = []
    for g in layout.groups(secs):
        made = [i for i in g if secs[i].get("questions")]
        if made and len(g) > 1:
            no = secs[g[0]]["no"]
            order.append((None, f"【{no}】" if exam.get("heading") == "bracket" else f"{no}"))
        order += [(i, None) for i in made]
    for i, big in order:
        if big is not None:
            _para(doc, big, 11, True, before=8, after=0, keep=True)
            continue
        sec, nums = secs[i], plan[i]
        qs = sec.get("questions", [])
        pts = layout.points_label(sec, [n["cell"] for n in nums])
        if sec.get("part"):
            head = f"問{sec['part']}　{pts}"
        else:
            head = f"【{sec['no']}】（{pts.strip('【】')}）" if exam.get("heading") == "bracket" else f"{sec['no']}　{pts}"
        _para(doc, head, 10.5, True, before=8, after=2, keep=True)
        slots = [answer_slots(q) for q in qs]
        width = max(len(s) for s in slots)
        per = min(layout.per_row(sec), len(qs))  # 問題が少ない設問は、余りのグレーの枠を作らない
        long = sec.get("type") in layout.LONG_TYPES
        rows = math.ceil(len(qs) / per)
        table = doc.add_table(rows=rows, cols=per * (1 + width))
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        # 番号の列は細く、解答欄を広く（例: 1行5問なら 番号10mm＋解答25.6mm ×5）
        num_mm = 10
        ans_mm = (TEXT_MM - per * num_mm) / (per * width)
        _widths(table, ([num_mm] + [ans_mm] * width) * per)
        for i, (q, sl, n) in enumerate(zip(qs, slots, nums)):
            row = table.rows[i // per]
            row.height = Mm(16 if long and not model else 9 if not model else 7)
            base = (i % per) * (1 + width)
            _cell(row.cells[base], n["cell"], size=9)
            labels = n["slots"] or q.get("slot_labels") or []
            for j in range(width):
                cell = row.cells[base + 1 + j]
                if j < len(sl):
                    small = labels[j] if j < len(labels) else None
                    _cell(cell, sl[j] if model else "", bold=True,
                          align=WD_ALIGN_PARAGRAPH.LEFT if long else CENTER, small=small)
                else:
                    _cell(cell)
                    _shade(cell)
        # 最終行の余り
        for k in range(len(qs), rows * per):
            base = (k % per) * (1 + width)
            for j in range(1 + width):
                _shade(table.rows[-1].cells[base + j], "F5F5F5")
        if sec.get("scoring_note"):
            _para(doc, "採点基準: " + sec["scoring_note"], 9, before=2)
        if model:
            scripts = [(n["cell"], q["script"]) for q, n in zip(qs, nums) if str(q.get("script") or "").strip()]
            if scripts:
                _para(doc, "放送文", 9.5, True, before=4)
                for lab, text in scripts:
                    _para(doc, f"{lab}　{text}", 9.5, indent_mm=4)
    total = sum(layout.section_points(s) for s in draft["sections"])
    want = exam.get("written_points") or total
    _para(doc, f"合計　　　　／{want}", 11, True, RIGHT, before=12)
    name = "modelanswer_draft.docx" if model else "answersheet_draft.docx"
    return _finish(doc, outdir / name)


def build_all(draft: dict, outdir: Path) -> list:
    return [
        build_exam(draft, outdir),
        build_answersheet(draft, outdir, model=False),
        build_answersheet(draft, outdir, model=True),
    ]
