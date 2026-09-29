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


def _para(parent, text="", size=None, bold=False, align=None, indent_mm=0, before=0, after=None):
    p = parent.add_paragraph()
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
        _run(p, small + ("\n" if text else ""), 7, color=GRAY)
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


def _choice_table(doc, rows, style, lead=True):
    """選択肢の表。rows = [(先頭セルの文字 or None, choices), ...]"""
    width = max(len(c) for _, c in rows)
    cols = width + (1 if lead else 0)
    t = doc.add_table(rows=len(rows), cols=cols)
    t.autofit = False
    _no_borders(t)
    # 列幅: 問題文の列は中身に合わせ（番号だけなら細く）、残りを選択肢で等分（本文幅 178mm）
    head_mm = (12 if all(len(h or "") <= 5 for h, _ in rows) else 58) if lead else 0
    choice_mm = (178 - head_mm) / max(1, width)
    for r, (head, choices) in enumerate(rows):
        cells = t.rows[r].cells
        if lead:
            _cell(cells[0], head or "", align=WD_ALIGN_PARAGRAPH.LEFT)
            cells[0].width = Mm(head_mm)
        for j in range(width):
            cells[j + (1 if lead else 0)].width = Mm(choice_mm)
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
        p = _para(doc, "", after=6)
        _run(p, title, 12, True)
        _run(p, "　　　" + exam["date"], 10.5)
    else:
        _para(doc, title, 12.5, True, CENTER, after=6)


def _compact_choices(sec) -> bool:
    """英単語テストのように、問題文が短く全問に選択肢がある大問は1つの表にまとめる。"""
    qs = sec.get("questions", [])
    return bool(qs) and all(q.get("choices") and "\n" not in (q.get("body") or "")
                            and len(q.get("body") or "") <= 40 for q in qs)


def build_exam(draft: dict, outdir: Path) -> Path:
    doc = _new_doc()
    exam = draft["exam"]
    if (exam.get("cover") or {}).get("enabled"):
        _cover(doc, exam)
    _title_line(doc, exam)
    plan = layout.numbering(draft)
    for sec, nums in zip(draft["sections"], plan):
        qs = sec.get("questions", [])
        if not qs:
            continue  # 未作成の大問は用紙に出さない（チェックで警告される）
        _para(doc, layout.heading(exam, sec), 10.5, True, before=10, after=4)
        style = sec.get("choice_style") or "1"
        if _compact_choices(sec):
            _choice_table(doc, [(f"{n['label']} {q.get('body') or ''}".strip(), q["choices"])
                                for q, n in zip(qs, nums)], style)
        else:
            for q, n in zip(qs, nums):
                lines = (q.get("body") or "").split("\n")
                _para(doc, f"{n['label']}　{lines[0]}", indent_mm=2, before=3)
                for line in lines[1:]:
                    _para(doc, line, indent_mm=10)
                labels = n["slots"] or q.get("slot_labels") or []
                line = layout.reorder_line(q, labels)
                if line:
                    _para(doc, line, indent_mm=10, before=2)
                if q.get("choices"):
                    _choice_table(doc, [(None, q["choices"])], style, lead=False)
        bank = [b for b in (sec.get("bank") or []) if str(b).strip()]
        if bank:
            _para(doc, "【語群】", 10.5, True, before=4)
            items = layout.choice_line(sec.get("bank_style") or style, bank)
            t = doc.add_table(rows=math.ceil(len(items) / 5), cols=5)
            _no_borders(t)
            for k, text in enumerate(items):
                _cell(t.rows[k // 5].cells[k % 5], text, align=WD_ALIGN_PARAGRAPH.LEFT)
    _para(doc, exam.get("end_note") or "問題は以上です。", align=RIGHT, before=12)
    out = outdir / "exam_draft.docx"
    doc.save(str(out))
    return out


def _sheet_header(doc, exam):
    fields = [f.strip() for f in str(exam.get("sheet_fields") or "組,番,氏名,得点").split(",") if f.strip()]
    t = doc.add_table(rows=1, cols=len(fields) * 2)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.RIGHT
    for i, f in enumerate(fields):
        _cell(t.rows[0].cells[i * 2], f, size=9)
        _cell(t.rows[0].cells[i * 2 + 1], "")
        t.rows[0].cells[i * 2].width = Mm(10)
        t.rows[0].cells[i * 2 + 1].width = Mm(45 if f == "氏名" else 14)
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
    for sec, nums in zip(draft["sections"], plan):
        qs = sec.get("questions", [])
        if not qs:
            continue
        pts = layout.points_label(sec, [n["cell"] for n in nums])
        head = f"【{sec['no']}】（{pts.strip('【】')}）" if exam.get("heading") == "bracket" else f"{sec['no']}　{pts}"
        _para(doc, head, 10.5, True, before=8, after=2)
        slots = [answer_slots(q) for q in qs]
        width = max(len(s) for s in slots)
        per = layout.per_row(sec)
        long = sec.get("type") in layout.LONG_TYPES
        rows = math.ceil(len(qs) / per)
        table = doc.add_table(rows=rows, cols=per * (1 + width))
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        for i, (q, sl, n) in enumerate(zip(qs, slots, nums)):
            row = table.rows[i // per]
            row.height = Mm(16 if long and not model else 9 if not model else 7)
            base = (i % per) * (1 + width)
            _cell(row.cells[base], n["cell"], size=9)
            row.cells[base].width = Mm(11)
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
    out = outdir / name
    doc.save(str(out))
    return out


def build_all(draft: dict, outdir: Path) -> list:
    return [
        build_exam(draft, outdir),
        build_answersheet(draft, outdir, model=False),
        build_answersheet(draft, outdir, model=True),
    ]
