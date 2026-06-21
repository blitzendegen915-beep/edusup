"""
英語コミュニケーションII 1学期期末試験
解答用紙・模範解答 生成スクリプト
中間試験テンプレートの書式を踏襲
"""

import os
import copy
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TEMPLATE = "/home/user/teacher-automation-lab/materials/answersheet_comm2_template.docx"

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

def cell_text(cell, text, size=9, bold=False, align=WD_ALIGN_PARAGRAPH.CENTER):
    p = cell.paragraphs[0]
    p.clear()
    p.alignment = align
    run = p.add_run(text)
    set_font(run, size=size, bold=bold)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

def set_cell_border(cell):
    """枠線をつける"""
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    for side in ['top', 'left', 'bottom', 'right']:
        tag = f'w:{side}'
        bdr = OxmlElement(tag)
        bdr.set(qn('w:val'), 'single')
        bdr.set(qn('w:sz'), '4')
        bdr.set(qn('w:color'), '000000')
        tcBorders = tcPr.find(qn('w:tcBorders'))
        if tcBorders is None:
            tcBorders = OxmlElement('w:tcBorders')
            tcPr.append(tcBorders)
        tcBorders.append(bdr)

def add_row_to_table(table):
    new_row = copy.deepcopy(table.rows[0]._tr)
    table._tbl.append(new_row)
    return table.rows[-1]

def clear_row_cells(row, num_cols):
    for i in range(num_cols):
        try:
            cell_text(row.cells[i], '')
        except:
            pass

def rebuild_table(doc, table_index, rows, cols, col_widths=None):
    """既存テーブルを削除し新テーブルを同位置に挿入"""
    old_tbl = doc.tables[table_index]._tbl
    new_tbl_elem = doc.add_table(rows=rows, cols=cols)
    new_tbl_elem.style = 'Table Grid'
    new_tbl_xml = new_tbl_elem._tbl
    parent = old_tbl.getparent()
    idx = list(parent).index(old_tbl)
    parent.remove(old_tbl)
    parent.insert(idx, new_tbl_xml)
    # 末尾から挿入したテーブルを削除
    doc._body._body.remove(doc.tables[-1]._tbl)
    return doc.tables[table_index]

# ========== 模範解答データ ==========

ANSWERS = {
    'q1': [
        "be added to", "steadily", "fundamental",
        "Regardless of", "evolved", "consists of",
        "is known as", "reflection(s)", "was registered"
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
        "She also saw the poverty of her people and the hard lives of so many women who were fighting against such basic problems as lack of food, firewood and water, and against unemployment.",
        "In March, the AI-based computer program AlphaGo, developed by DeepMind, shocked the world when it defeated South Korean go grandmaster Lee Sedol in a five-game match of the ancient board game that requires deep insight.",
        "Although we know that the earth revolves around the sun, we cannot recite the astronomical observations and calculations that led to that conclusion.",
        "Psychologists who believe that willpower is a limited resource say using up our willpower is the main reason that some of us fail to achieve our goals.",
    ],
    'q5_svocm': [
        "S[She] V[saw] O[the poverty of her people] and O[the hard lives of so many women [who were fighting against (such basic problems as...) and against unemployment]].",
        "M(In March), S[the AI-based computer program AlphaGo, [developed by DeepMind],] V[shocked] O[the world] M(when it defeated...).",
        "M(Although S[we] V[know] O〈that the earth revolves around the sun〉), S[we] V[cannot recite] O[the astronomical observations and calculations [that led to that conclusion]].",
        "S[Psychologists [who believe 〈that willpower is a limited resource〉]] V[say] O〈using up our willpower is the main reason [that some of us fail to achieve our goals]〉.",
    ],
    'q5_trans': [
        "彼女はまた、自分の民の貧困と、食料・薪・水の不足や失業といった基本的な問題と闘う数多くの女性たちの苦しい生活を目の当たりにした。",
        "3月、DeepMindが開発したAlphaGoは、深い洞察力を必要とするこの古代ボードゲームの5番勝負で韓国の囲碁の名人、李世乭を破り、世界に衝撃を与えた。",
        "地球が太陽の周りを公転していることは知っていても、私たちはその結論に至った天文学的な観測や計算を暗唱することはできない。",
        "意志力は限られた資源だと考える心理学者たちは、意志力を使い果たすことが、私たちの一部が目標を達成できない主な理由だと言う。",
    ],
    'q5_sub': "AlphaGoが人間のプロ棋士（李世乭）との5番勝負に勝利したこと。",
    'q5_part2': {"5": "ア", "6": "イ", "7": "ア", "8": "イ"},
    'q6': [("regularly", "themselves"), ("tomorrow", "do"), ("who", "win"), ("is", "sleep"), ("with", "you")],
    'q7': ["3", "4", "2", "3", "3"],
    'q8': ["サ", "キ", "エ", "ケ", "コ", "オ", "ア", "ウ", "ク", "イ"],
}

# ========== メイン ==========

def build(model=False):
    doc = Document(TEMPLATE)

    # --------------------------------------------------
    # T0: ヘッダー変更
    # --------------------------------------------------
    t0 = doc.tables[0]
    p = t0.cell(0, 0).paragraphs[0]
    for run in p.runs:
        if "中間試験" in run.text:
            run.text = run.text.replace("中間試験", "期末試験")
        if "1学期" in run.text:
            run.text = run.text.replace("1学期", "１学期")

    # --------------------------------------------------
    # 段落ラベル修正（P13：大問8の点数）
    # --------------------------------------------------
    for p in doc.paragraphs:
        if "８" in p.text and "２点×５" in p.text:
            for run in p.runs:
                run.text = run.text.replace("２点×５", "１点×10")
        if "５" in p.text and "２点×４" in p.text:
            for run in p.runs:
                run.text = run.text.replace("２点×４】【 ２点×４", "Part1 ８点】【Part2 ８")

    # --------------------------------------------------
    # T1: 大問1（9問）
    # --------------------------------------------------
    t1 = doc.tables[1]
    answers_q1 = ANSWERS['q1'] if model else [""] * 9
    idx = 0
    for ri, row in enumerate(t1.rows):
        for ci, cell in enumerate(row.cells):
            txt = cell.paragraphs[0].text.strip()
            if txt == '' and idx < 9:
                # 前セルが数字かどうかで判断 → 空セルに答えを入れる
                cell_text(cell, answers_q1[idx] if model else "", size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
                idx += 1

    # --------------------------------------------------
    # T2: 大問2（1, 2A, 2B）
    # --------------------------------------------------
    t2 = doc.tables[2]
    row = t2.rows[0]
    for ci, cell in enumerate(row.cells):
        txt = cell.paragraphs[0].text.strip()
        if txt == '1':
            pass
        elif txt == '' and ci == 2:
            cell_text(cell, ANSWERS['q2']['1'] if model else "", size=11, bold=model)
        elif txt == '2A':
            pass
        elif txt == '' and ci == 4:
            cell_text(cell, ANSWERS['q2']['2A'] if model else "", size=11, bold=model)
        elif txt == '2B':
            pass
        elif txt == '' and ci == 6:
            cell_text(cell, ANSWERS['q2']['2B'] if model else "", size=11, bold=model)

    # --------------------------------------------------
    # T3: 大問3（1〜4）
    # --------------------------------------------------
    t3 = doc.tables[3]
    ans_q3 = ANSWERS['q3']
    q3_keys = ['1', '2', '3', '4']
    row = t3.rows[0]
    for ci, cell in enumerate(row.cells):
        txt = cell.paragraphs[0].text.strip()
        if txt == '' and ci > 0:
            key_idx = (ci - 1) // 2
            if key_idx < 4:
                k = q3_keys[key_idx]
                cell_text(cell, ans_q3[k] if model else "", size=11, bold=model)

    # --------------------------------------------------
    # T4: 大問4（語句挿入5問）→ 内容差し替え
    # --------------------------------------------------
    t4 = doc.tables[4]
    ans_q4 = ANSWERS['q4'] if model else ["", "", "", "", ""]
    t4.cell(0, 1).paragraphs[0].clear()
    run = t4.cell(0, 1).paragraphs[0].add_run(ans_q4[0])
    set_font(run, size=9)
    t4.cell(0, 3).paragraphs[0].clear()
    run = t4.cell(0, 3).paragraphs[0].add_run(ans_q4[1])
    set_font(run, size=9)
    t4.cell(1, 1).paragraphs[0].clear()
    run = t4.cell(1, 1).paragraphs[0].add_run(ans_q4[2])
    set_font(run, size=9)
    t4.cell(1, 3).paragraphs[0].clear()
    run = t4.cell(1, 3).paragraphs[0].add_run(ans_q4[3])
    set_font(run, size=9)
    t4.cell(2, 1).paragraphs[0].clear()
    run = t4.cell(2, 1).paragraphs[0].add_run(ans_q4[4])
    set_font(run, size=9)
    # 右2セルを空欄に
    for ci in [2, 3]:
        t4.cell(2, ci).paragraphs[0].clear()

    # --------------------------------------------------
    # T5: 大問5（英文解釈）→ XML操作で再構築
    # --------------------------------------------------
    # 既存T5を取り出し、行をすべてクリアして新構造を作る
    t5 = doc.tables[5]

    def clear_table_rows(tbl):
        """全行削除"""
        for tr in list(tbl._tbl)[1:]:  # tblPr以外
            tbl._tbl.remove(tr)

    def add_table_row(tbl, cells_data):
        """(text, width_emu, align, size) のリストで1行追加"""
        tr = OxmlElement('w:tr')
        for text, width, align, size in cells_data:
            tc = OxmlElement('w:tc')
            tcPr = OxmlElement('w:tcPr')
            tcW = OxmlElement('w:tcW')
            tcW.set(qn('w:w'), str(int(width)))
            tcW.set(qn('w:type'), 'dxa')
            tcPr.append(tcW)
            # 枠線
            tcBorders = OxmlElement('w:tcBorders')
            for side in ['top','left','bottom','right']:
                b = OxmlElement(f'w:{side}')
                b.set(qn('w:val'), 'single')
                b.set(qn('w:sz'), '4')
                b.set(qn('w:color'), '000000')
                tcBorders.append(b)
            tcPr.append(tcBorders)
            tc.append(tcPr)
            p_elem = OxmlElement('w:p')
            pPr = OxmlElement('w:pPr')
            jc = OxmlElement('w:jc')
            jc.set(qn('w:val'), 'left' if align == 'left' else 'center')
            pPr.append(jc)
            p_elem.append(pPr)
            if text:
                r = OxmlElement('w:r')
                rPr = OxmlElement('w:rPr')
                sz = OxmlElement('w:sz')
                sz.set(qn('w:val'), str(int(size * 2)))
                rPr.append(sz)
                r.append(rPr)
                t_elem = OxmlElement('w:t')
                t_elem.text = text
                t_elem.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                r.append(t_elem)
                p_elem.append(r)
            tc.append(p_elem)
            tr.append(tc)
        tbl._tbl.append(tr)

    # T5の全行を削除（tblPrを保持）
    tbl5_xml = t5._tbl
    rows_to_remove = tbl5_xml.findall(qn('w:tr'))
    for tr in rows_to_remove:
        tbl5_xml.remove(tr)

    # 幅設定（総幅 ≈ 6480dxa）
    W_NUM = 400    # 問番号列
    W_LABEL = 600  # 記号/訳ラベル列
    W_ANS = 5480   # 解答列

    def add_q5_row(tbl_xml, num_text, label_text, ans_text, size=8.5):
        tr = OxmlElement('w:tr')
        for (text, width) in [(num_text, W_NUM), (label_text, W_LABEL), (ans_text, W_ANS)]:
            tc = OxmlElement('w:tc')
            tcPr = OxmlElement('w:tcPr')
            tcW = OxmlElement('w:tcW')
            tcW.set(qn('w:w'), str(width))
            tcW.set(qn('w:type'), 'dxa')
            tcPr.append(tcW)
            tcBorders = OxmlElement('w:tcBorders')
            for side in ['top','left','bottom','right']:
                b = OxmlElement(f'w:{side}')
                b.set(qn('w:val'), 'single')
                b.set(qn('w:sz'), '4')
                b.set(qn('w:color'), '000000')
                tcBorders.append(b)
            tcPr.append(tcBorders)
            tc.append(tcPr)
            p_e = OxmlElement('w:p')
            pPr = OxmlElement('w:pPr')
            jc = OxmlElement('w:jc')
            jc.set(qn('w:val'), 'center' if (text == num_text or text == label_text) else 'left')
            pPr.append(jc)
            spAft = OxmlElement('w:spacing')
            spAft.set(qn('w:after'), '0')
            pPr.append(spAft)
            p_e.append(pPr)
            if text:
                r = OxmlElement('w:r')
                rPr = OxmlElement('w:rPr')
                sz_e = OxmlElement('w:sz')
                sz_e.set(qn('w:val'), str(int(size * 2)))
                rPr.append(sz_e)
                r.append(rPr)
                t_e = OxmlElement('w:t')
                t_e.text = text
                t_e.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                r.append(t_e)
                p_e.append(r)
            tc.append(p_e)
            tr.append(tc)
        tbl_xml.append(tr)

    def add_q5_part2_row(tbl_xml, items):
        """items: [(num, ans), ...]  4問を1行に"""
        tr = OxmlElement('w:tr')
        W_each_num = 400
        W_each_ans = 1220
        for (num, ans) in items:
            for (text, width) in [(num, W_each_num), (ans, W_each_ans)]:
                tc = OxmlElement('w:tc')
                tcPr = OxmlElement('w:tcPr')
                tcW = OxmlElement('w:tcW')
                tcW.set(qn('w:w'), str(width))
                tcW.set(qn('w:type'), 'dxa')
                tcPr.append(tcW)
                tcBorders = OxmlElement('w:tcBorders')
                for side in ['top','left','bottom','right']:
                    b = OxmlElement(f'w:{side}')
                    b.set(qn('w:val'), 'single')
                    b.set(qn('w:sz'), '4')
                    b.set(qn('w:color'), '000000')
                    tcBorders.append(b)
                tcPr.append(tcBorders)
                tc.append(tcPr)
                p_e = OxmlElement('w:p')
                pPr = OxmlElement('w:pPr')
                jc = OxmlElement('w:jc')
                jc.set(qn('w:val'), 'center')
                pPr.append(jc)
                p_e.append(pPr)
                if text:
                    r = OxmlElement('w:r')
                    rPr = OxmlElement('w:rPr')
                    sz_e = OxmlElement('w:sz')
                    sz_e.set(qn('w:val'), '18')
                    rPr.append(sz_e)
                    r.append(rPr)
                    t_e = OxmlElement('w:t')
                    t_e.text = text
                    t_e.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    r.append(t_e)
                    p_e.append(r)
                tc.append(p_e)
                tr.append(tc)
        tbl_xml.append(tr)

    sents = ANSWERS['q5_sentences']
    svocms = ANSWERS['q5_svocm'] if model else [""] * 4
    trans = ANSWERS['q5_trans'] if model else [""] * 4
    sub_ans = ANSWERS['q5_sub'] if model else ""

    for i in range(4):
        num = str(i + 1)
        # 英文行
        add_q5_row(tbl5_xml, num, "", sents[i], size=8)
        # 記号行
        add_q5_row(tbl5_xml, "", "記号", svocms[i], size=8)
        # 訳行
        add_q5_row(tbl5_xml, "", "訳", trans[i], size=8)
        # 問2のみ補足問
        if i == 1:
            add_q5_row(tbl5_xml, "", "（問）", sub_ans, size=8)

    # Part2 正誤（5〜8）
    p2 = ANSWERS['q5_part2'] if model else {str(k): "" for k in range(5, 9)}
    add_q5_part2_row(tbl5_xml, [
        ("5", p2["5"]), ("6", p2["6"]), ("7", p2["7"]), ("8", p2["8"])
    ])

    # --------------------------------------------------
    # T6: 大問6（並べ替え 4番目/8番目 × 5問）
    # --------------------------------------------------
    t6 = doc.tables[6]
    ans_q6 = ANSWERS['q6'] if model else [("", "")] * 5
    row = t6.rows[0]
    ans_idx = 0
    for ci, cell in enumerate(row.cells):
        txt = cell.paragraphs[0].text.strip()
        if txt in ['1','2','3','4','5']:
            pass
        elif txt == '' and ans_idx < 5:
            a4, a8 = ans_q6[ans_idx]
            cell_text(cell, f"{a4} / {a8}" if model else "", size=9, bold=model)
            ans_idx += 1

    # --------------------------------------------------
    # T7: 大問7（3点×5）
    # --------------------------------------------------
    t7 = doc.tables[7]
    ans_q7 = ANSWERS['q7'] if model else [""] * 5
    row = t7.rows[0]
    ans_idx = 0
    for ci, cell in enumerate(row.cells):
        txt = cell.paragraphs[0].text.strip()
        if txt in ['1','2','3','4','5']:
            pass
        elif txt == '' and ans_idx < 5:
            cell_text(cell, ans_q7[ans_idx] if model else "", size=11, bold=model)
            ans_idx += 1

    # --------------------------------------------------
    # T8: 大問8（記号10個）→ XML再構築
    # --------------------------------------------------
    t8 = doc.tables[8]
    tbl8_xml = t8._tbl
    # 全行削除
    for tr in tbl8_xml.findall(qn('w:tr')):
        tbl8_xml.remove(tr)

    ans_q8 = ANSWERS['q8'] if model else [""] * 10
    W_N = 360   # 番号列
    W_A = 1170  # 解答列

    def add_q8_row(tbl_xml, pairs):
        tr = OxmlElement('w:tr')
        for (num, ans) in pairs:
            for (text, width) in [(num, W_N), (ans, W_A)]:
                tc = OxmlElement('w:tc')
                tcPr = OxmlElement('w:tcPr')
                tcW = OxmlElement('w:tcW')
                tcW.set(qn('w:w'), str(width))
                tcW.set(qn('w:type'), 'dxa')
                tcPr.append(tcW)
                tcBorders = OxmlElement('w:tcBorders')
                for side in ['top','left','bottom','right']:
                    b = OxmlElement(f'w:{side}')
                    b.set(qn('w:val'), 'single')
                    b.set(qn('w:sz'), '4')
                    b.set(qn('w:color'), '000000')
                    tcBorders.append(b)
                tcPr.append(tcBorders)
                tc.append(tcPr)
                p_e = OxmlElement('w:p')
                pPr = OxmlElement('w:pPr')
                jc = OxmlElement('w:jc')
                jc.set(qn('w:val'), 'center')
                pPr.append(jc)
                p_e.append(pPr)
                if text:
                    r = OxmlElement('w:r')
                    rPr = OxmlElement('w:rPr')
                    sz_e = OxmlElement('w:sz')
                    sz_e.set(qn('w:val'), '20')
                    rPr.append(sz_e)
                    r.append(rPr)
                    t_e = OxmlElement('w:t')
                    t_e.text = text
                    t_e.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    r.append(t_e)
                    p_e.append(r)
                tc.append(p_e)
                tr.append(tc)
        tbl_xml.append(tr)

    add_q8_row(tbl8_xml, [
        ("１", ans_q8[0]), ("２", ans_q8[1]), ("３", ans_q8[2]),
        ("４", ans_q8[3]), ("５", ans_q8[4])
    ])
    add_q8_row(tbl8_xml, [
        ("６", ans_q8[5]), ("７", ans_q8[6]), ("８", ans_q8[7]),
        ("９", ans_q8[8]), ("１０", ans_q8[9])
    ])

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
