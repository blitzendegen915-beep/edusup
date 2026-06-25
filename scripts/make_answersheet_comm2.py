"""
英語コミュニケーションII 1学期期末試験
解答用紙・模範解答 生成スクリプト
"""

import os
import copy
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TEMPLATE = "/home/user/teacher-automation-lab/materials/answersheet_comm2_template_new.docx"

# ========== ヘルパー ==========

def set_font(run, size=10, bold=False, name_ja="MS Mincho", name_en="Times New Roman"):
    run.font.name = name_en
    run.font.size = Pt(size)
    run.font.bold = bold
    r = run._r
    rPr = r.get_or_add_rPr()
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:eastAsia'), name_ja)
    rFonts.set(qn('w:ascii'), name_en)
    rFonts.set(qn('w:hAnsi'), name_en)
    existing = rPr.find(qn('w:rFonts'))
    if existing is not None:
        rPr.remove(existing)
    rPr.insert(0, rFonts)

def write_cell(cell, text, size=9, bold=False, align=WD_ALIGN_PARAGRAPH.CENTER):
    p = cell.paragraphs[0]
    p.clear()
    p.alignment = align
    if text:
        run = p.add_run(text)
        set_font(run, size=size, bold=bold)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

# ========== 模範解答データ ==========

ANSWERS = {
    'q1': [
        "commute", "universal", "must have left",
        "greenhouse", "nuance", "conduct",
        "goes without", "facial", "safely"
    ],
    'q2': {"1": "③", "2A": "ア", "2B": "イ"},
    'q3': {"1": "ウ", "2": "エ", "3": "ア", "4": "イ"},
    'q4': [
        "（systems）so that（they）",
        "（infrastructure）such as（the）",
        "（now）quicker（to）",
        "（vehicles）from（entering）",
        "（may）well（Copenhagenize）",
    ],
    'q5_sentences': [
        "Becoming an adult is a step-by-step process, and just when the young are finally wise enough to be treated as young adults is not the time to give them free access to the drinks bar.",
        "Although we know that the earth revolves around the sun, we cannot recite the astronomical observations and calculations that led to that conclusion.",
    ],
    'q5_trans': [
        "大人になることは段階的なプロセスであり、若者たちがようやく若い大人として扱われるほど賢くなったまさにその時こそ、彼らにお酒を自由に飲ませる時ではない。",
        "地球が太陽の周りを公転していることは知っていても、私たちはその結論に至った天文学的な観測や計算を暗唱することはできない。",
    ],
    'q5_part2': {"3": "ア", "4": "ア", "5": "イ", "6": "イ"},
    'q6': [
        ("exercise regularly", "about"),
        ("do", "off"),
        ("girl", "win"),
        ("need", "is to get"),
        ("people", "with"),
    ],
    'q7': ["3", "4", "2", "3", "3"],
    'q8': ["サ", "キ", "エ", "ケ", "コ", "オ", "ア", "ウ", "ク", "イ"],
}

# ========== メイン ==========

def build(model=False):
    doc = Document(TEMPLATE)

    # --------------------------------------------------
    # T1: 大問1（9問）
    # 各行: [num, blank×4, num, blank×2]
    # 左問: col0=番号, col1=解答  右問: col5=番号, col6=解答
    # --------------------------------------------------
    t1 = doc.tables[1]
    ans_q1 = ANSWERS['q1'] if model else [""] * 9
    pairs = [(0, 1), (2, 3), (4, 5), (6, 7), (8, None)]
    for ri, (left_idx, right_idx) in enumerate(pairs):
        row = t1.rows[ri]
        write_cell(row.cells[1], ans_q1[left_idx] if model else "", size=9, bold=model)
        if right_idx is not None:
            write_cell(row.cells[6], ans_q1[right_idx] if model else "", size=9, bold=model)

    # --------------------------------------------------
    # T2: 大問2（1, 2A, 2B）
    # col2=q1解答, col4=2A解答, col6=2B解答
    # --------------------------------------------------
    t2 = doc.tables[2]
    row2 = t2.rows[0]
    write_cell(row2.cells[2], ANSWERS['q2']['1'] if model else "", size=11, bold=model)
    write_cell(row2.cells[4], ANSWERS['q2']['2A'] if model else "", size=11, bold=model)
    write_cell(row2.cells[6], ANSWERS['q2']['2B'] if model else "", size=11, bold=model)

    # --------------------------------------------------
    # T3: 大問3（1〜4）
    # col2=q1, col4=q2, col6=q3, col8=q4
    # --------------------------------------------------
    t3 = doc.tables[3]
    row3 = t3.rows[0]
    for i, col in enumerate([2, 4, 6, 8]):
        k = str(i + 1)
        write_cell(row3.cells[col], ANSWERS['q3'][k] if model else "", size=11, bold=model)

    # --------------------------------------------------
    # T4: 大問4（5問）
    # row0: col1=q1, col3=q2  row1: col1=q3, col3=q4  row2: col1=q5
    # --------------------------------------------------
    t4 = doc.tables[4]
    ans_q4 = ANSWERS['q4'] if model else [""] * 5
    write_cell(t4.rows[0].cells[1], ans_q4[0], size=9, bold=model)
    write_cell(t4.rows[0].cells[3], ans_q4[1], size=9, bold=model)
    write_cell(t4.rows[1].cells[1], ans_q4[2], size=9, bold=model)
    write_cell(t4.rows[1].cells[3], ans_q4[3], size=9, bold=model)
    write_cell(t4.rows[2].cells[1], ans_q4[4], size=9, bold=model)

    # --------------------------------------------------
    # T5: 大問5（英文解釈）
    # row0: [1番号, 英文(merged)]  → 英文はそのまま（編集しない）
    # row1: [訳, 訳blank(merged)]  → 訳を記入
    # row2: [2番号, 英文(merged)]
    # row3: [訳, 訳blank(merged)]
    # row4: [Part2ラベル, 3番号, 3blank, 4番号, 4blank, 5番号, 5blank, 6番号, 6blank]
    # --------------------------------------------------
    t5 = doc.tables[5]
    trans = ANSWERS['q5_trans'] if model else ["", ""]
    p2 = ANSWERS['q5_part2'] if model else {str(k): "" for k in range(3, 7)}

    write_cell(t5.rows[1].cells[1], trans[0], size=8, bold=model, align=WD_ALIGN_PARAGRAPH.LEFT)
    write_cell(t5.rows[3].cells[1], trans[1], size=8, bold=model, align=WD_ALIGN_PARAGRAPH.LEFT)
    write_cell(t5.rows[4].cells[2], p2["3"], size=10, bold=model)
    write_cell(t5.rows[4].cells[4], p2["4"], size=10, bold=model)
    write_cell(t5.rows[4].cells[6], p2["5"], size=10, bold=model)
    write_cell(t5.rows[4].cells[8], p2["6"], size=10, bold=model)

    # --------------------------------------------------
    # T6: 大問6（並べ替え 2番目/5番目 × 5問）
    # col2=q1, col4=q2, col6=q3, col8=q4, col10=q5
    # --------------------------------------------------
    t6 = doc.tables[6]
    ans_q6 = ANSWERS['q6'] if model else [("", "")] * 5
    for i, col in enumerate([2, 4, 6, 8, 10]):
        a2, a5 = ans_q6[i]
        write_cell(t6.rows[0].cells[col],
                   f"②{a2}　⑤{a5}" if model else "", size=8, bold=model)

    # --------------------------------------------------
    # T7: 大問7（3点×5）
    # col2=q1, col4=q2, col6=q3, col8=q4, col10=q5
    # --------------------------------------------------
    t7 = doc.tables[7]
    ans_q7 = ANSWERS['q7'] if model else [""] * 5
    for i, col in enumerate([2, 4, 6, 8, 10]):
        write_cell(t7.rows[0].cells[col], ans_q7[i] if model else "", size=11, bold=model)

    # --------------------------------------------------
    # T8: 大問8（10問、2行）
    # row0: col1=q1, col3=q2, col5=q3, col7=q4, col9=q5
    # row1: col1=q6, col3=q7, col5=q8, col7=q9, col9=q10
    # --------------------------------------------------
    t8 = doc.tables[8]
    ans_q8 = ANSWERS['q8'] if model else [""] * 10
    for i, col in enumerate([1, 3, 5, 7, 9]):
        write_cell(t8.rows[0].cells[col], ans_q8[i] if model else "", size=10, bold=model)
        write_cell(t8.rows[1].cells[col], ans_q8[i + 5] if model else "", size=10, bold=model)

    # --------------------------------------------------
    # 保存
    # --------------------------------------------------
    os.makedirs("/home/user/teacher-automation-lab/output", exist_ok=True)
    if model:
        out = "/home/user/teacher-automation-lab/output/modelanswer_comm2_final.docx"
    else:
        out = "/home/user/teacher-automation-lab/output/answersheet_comm2_final.docx"
    doc.save(out)
    print(f"保存完了: {out}")


if __name__ == "__main__":
    build(model=False)   # 解答用紙（空欄）
    build(model=True)    # 模範解答
