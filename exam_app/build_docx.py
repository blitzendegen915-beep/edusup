"""試験データ（exam_draft.json / UIのプロジェクト）→ Word 3点セット。

・問題文中の __語句__ は下線付きで出力する（下線部問題用）
・解答用紙は解答枠（answer_slots）の数だけ枠を作る（1枠1語 / skills/exam-answersheet）
・解答用紙と模範解答は同じ関数から生成し、二重管理によるズレを防ぐ
体裁は汎用の叩き台。学校指定の様式がある場合は scripts/ のテンプレート方式を使う。
"""
import re
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt

from .checks import answer_slots

FONT_EN = "Times New Roman"
FONT_JA = "MS Mincho"
_UNDERLINE = re.compile(r"__(.+?)__")
CENTER = WD_ALIGN_PARAGRAPH.CENTER
RIGHT = WD_ALIGN_PARAGRAPH.RIGHT


def _new_doc() -> Document:
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.left_margin = sec.right_margin = Mm(18)
    sec.top_margin = sec.bottom_margin = Mm(15)
    normal = doc.styles["Normal"]
    normal.font.name = FONT_EN
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT_JA)
    normal.paragraph_format.space_after = Pt(2)
    return doc


def _run(p, text, size=None, bold=False, underline=False):
    run = p.add_run(text)
    if size:
        run.font.size = Pt(size)
    run.font.bold = bold
    run.font.underline = underline
    run.font.name = FONT_EN
    rpr = run._r.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = OxmlElement("w:rFonts")
        rpr.insert(0, fonts)
    fonts.set(qn("w:eastAsia"), FONT_JA)
    return run


def _para(parent, text="", size=None, bold=False, align=None,
          indent_mm=0, before=0, after=None):
    """段落を追加する。text 中の __語句__ は下線になる。"""
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
    pos = 0
    for m in _UNDERLINE.finditer(text):
        if m.start() > pos:
            _run(p, text[pos:m.start()], size, bold)
        _run(p, m.group(1), size, bold, underline=True)
        pos = m.end()
    if pos < len(text):
        _run(p, text[pos:], size, bold)
    return p


def _cell(cell, text="", bold=False, size=10):
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = CENTER
    if text:
        _run(p, text, size, bold)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER


def _shade(cell, fill="E6E6E6"):
    """使わない枠をグレーにする（枠の数＝解答の語数を守るため）。"""
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(shd)


def _points(sec) -> int:
    return int(sec.get("points_each", 0)) * len(sec.get("questions", []))


def build_exam(draft: dict, outdir: Path) -> Path:
    doc = _new_doc()
    _para(doc, draft["exam"].get("title", ""), 13, True, CENTER, after=6)
    for sec in draft["sections"]:
        if not sec.get("questions"):
            continue  # 未作成の大問は用紙に出さない（チェックで警告される）
        instr = (sec.get("instructions") or "").strip()
        _para(doc, f"{sec['no']}　{instr}（{_points(sec)}点）", 10.5, True,
              before=10, after=4)
        for q in sec["questions"]:
            lines = (q.get("body") or "").split("\n")
            _para(doc, f"({q['number']})　{lines[0]}", indent_mm=2, before=3)
            for line in lines[1:]:
                _para(doc, line, indent_mm=10)
    _para(doc, "問題は以上です。", align=RIGHT, before=12)
    out = outdir / "exam_draft.docx"
    doc.save(str(out))
    return out


def build_answersheet(draft: dict, outdir: Path, model: bool) -> Path:
    """model=False: 解答用紙（空欄） / True: 模範解答（太字で記入）"""
    doc = _new_doc()
    label = "模範解答" if model else "解答用紙"
    _para(doc, f"{draft['exam'].get('title', '')}　{label}", 12, True, CENTER, after=4)
    if not model:
        _para(doc, "　　年　　組　　番　氏名　　　　　　　　　　　　　", align=RIGHT, after=6)

    for sec in draft["sections"]:
        qs = sec.get("questions", [])
        if not qs:
            continue
        _para(doc, f"{sec['no']}　【{sec.get('points_each', 0)}点×{len(qs)}】",
              10.5, True, before=8, after=2)
        slots = [answer_slots(q) for q in qs]
        width = max(len(s) for s in slots)
        labels = next((q.get("slot_labels") for q in qs if q.get("slot_labels")), None)
        head = 1 if labels else 0
        table = doc.add_table(rows=len(qs) + head, cols=1 + width)
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        if labels:
            _cell(table.rows[0].cells[0], "", size=8)
            for j in range(width):
                _cell(table.rows[0].cells[j + 1],
                      labels[j] if j < len(labels) else "", size=8)
        for i, (q, sl) in enumerate(zip(qs, slots)):
            row = table.rows[i + head]
            row.height = Mm(7 if model else 9)
            _cell(row.cells[0], f"({q['number']})", size=9)
            for j in range(width):
                cell = row.cells[j + 1]
                if j < len(sl):
                    _cell(cell, sl[j] if model else "", bold=True)
                else:
                    _cell(cell)
                    _shade(cell)
        for row in table.rows:
            row.cells[0].width = Mm(14)

    total = sum(_points(s) for s in draft["sections"])
    want = draft["exam"].get("written_points") or total
    _para(doc, f"得点　　　　／{want}", 11, True, RIGHT, before=12)
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
