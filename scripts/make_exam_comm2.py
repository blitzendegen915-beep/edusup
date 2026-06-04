"""
英語コミュニケーションII 2学期中間試験 Word生成スクリプト
過去問（1学期中間）のレイアウト・書式を模倣して .docx を出力する
"""

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

# ========== ヘルパー関数 ==========

def set_font(run, name_ja="MS Mincho", name_en="Times New Roman", size=10.5, bold=False, italic=False, underline=False):
    run.font.name = name_en
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.underline = underline
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

def add_run(para, text, bold=False, italic=False, underline=False, size=10.5,
            ja_font="MS Mincho", en_font="Times New Roman"):
    run = para.add_run(text)
    set_font(run, name_ja=ja_font, name_en=en_font, size=size, bold=bold, italic=italic, underline=underline)
    return run

def set_para_format(para, space_before=0, space_after=0, line_spacing=None, indent_left=0, indent_first=0):
    pf = para.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after  = Pt(space_after)
    pf.left_indent  = Cm(indent_left)
    pf.first_line_indent = Cm(indent_first)
    if line_spacing:
        from docx.shared import Pt as PT
        pf.line_spacing = PT(line_spacing)

def add_boxed_number(para, number):
    """□1 のような囲み数字を追加する（太字・枠線付きテキストで代替）"""
    run = para.add_run(f"【{number}】")
    set_font(run, size=11, bold=True)
    return run

def add_section_header(doc, number, text, points=None):
    """大問ヘッダー: 【1】 指示文 （XX点）"""
    para = doc.add_paragraph()
    set_para_format(para, space_before=8, space_after=2)
    add_boxed_number(para, number)
    add_run(para, "　" + text, bold=True, size=10.5)
    if points:
        add_run(para, f"（{points}点）", bold=True, size=10.5)
    return para

def add_box_paragraph(doc):
    """枠線付き段落を含む1行テーブルを作成して返す"""
    table = doc.add_table(rows=1, cols=1)
    table.style = 'Table Grid'
    cell = table.cell(0, 0)
    return cell

def set_page_layout(doc):
    """A4・余白設定"""
    from docx.shared import Cm
    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width  = Cm(21.0)
    section.top_margin    = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin   = Cm(2.5)
    section.right_margin  = Cm(2.5)

# ========== 本体 ==========

def build_exam():
    doc = Document()
    set_page_layout(doc)

    # デフォルトスタイルのフォント設定
    style = doc.styles['Normal']
    style.font.name = 'Times New Roman'
    style.font.size = Pt(10.5)
    from docx.oxml.ns import qn
    style.element.rPr.rFonts.set(qn('w:eastAsia'), 'MS Mincho')

    # =========================================================
    # タイトル
    # =========================================================
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para_format(title, space_before=0, space_after=4)
    add_run(title, "２０２６年　２学年受験コース　英語コミュニケーションⅡ　２学期中間試験",
            bold=True, size=12)

    doc.add_paragraph()  # 空行

    # =========================================================
    # 大問１：空所補充
    # =========================================================
    add_section_header(doc, "１",
        "日本文の意味になるように英文の空所に適語を入れなさい。"
        "空欄にアルファベットがあるものは、それではじまる単語を答えること。",
        points="９")

    q1_data = [
        # (日本語, 英語行, ヒント語句, 下線範囲)
        (
            "自転車は、温室効果ガスを",
            "排出しない",
            "、エコな交通手段だ。",
            "Cycling is an eco-friendly form of transportation that （　　　　　） no greenhouse gases.",
            "emits"
        ),
        (
            "それはあなたが糖尿病や癌などの病気に",
            "かかることを防いで",
            "くれるかもしれない。",
            "It may （　　　　　） you from （ g　　　　　　） diseases such as diabetes and cancer.",
            "prevent / getting"
        ),
        (
            "コペンハーゲンは世界最高の自転車都市になることを目標に独自の政策を",
            "実施してきた",
            "。",
            "Copenhagen has （ i　　　　　　　） some unique policies with the goal of becoming the world's best bike city.",
            "implemented"
        ),
        (
            "自転車利用者が時速20キロの",
            "速度を維持する",
            "限り、主要自転車ルートの信号は青のままだ。",
            "As long as cyclists （　　　　　） a speed of 20 kilometers per hour, the traffic lights are green all the way.",
            "maintain"
        ),
        (
            "グリーンウェーブは、効率を",
            "犠牲にすることなく",
            "、全員が最も安全な速度で走れるようにする。",
            "The Green Wave ensures that everyone cycles at the safest speed （　　　　　）（　　　　　） efficiency.",
            "without sacrificing"
        ),
        (
            "自転車橋は自転車利用者のための",
            "近道として機能し",
            "、海岸線の素晴らしい景色を提供する。",
            "The Bicycle Snake （　　　　　）（　　　　　） a shortcut for cyclists and offers a striking view of the waterfront.",
            "serves as"
        ),
        (
            "石油危機により、都市計画者は石油に頼らずに済む交通システムへの",
            "見直しを余儀なくされた",
            "。",
            "The oil crisis （　　　　　） them to （　　　　　） their transportation systems.",
            "led / revise"
        ),
        (
            "その政策は、車両が自転車レーンに",
            "進入したり駐車したりするのを防ぐ",
            "。",
            "The \"Protected Bicycle Lane\" policy （ p　　　　　　） vehicles from entering or parking in the bike lane.",
            "prevents"
        ),
        (
            "多くの都市が、より持続可能で住みやすいコミュニティを",
            "築こうとして",
            "いる。",
            "Many cities （　　　　　）（　　　　　） build more sustainable, livable communities.",
            "seek to"
        ),
    ]

    for i, (pre, underline_text, post, english_line, hint) in enumerate(q1_data, 1):
        # 日本語行
        jp_para = doc.add_paragraph()
        set_para_format(jp_para, space_before=3, space_after=0, indent_left=0.3)
        add_run(jp_para, f"({i})　{pre}")
        add_run(jp_para, underline_text, underline=True)
        add_run(jp_para, post)
        # ヒント（右端）
        add_run(jp_para, "　" * 4)
        add_run(jp_para, hint, bold=True)

        # 英語行
        en_para = doc.add_paragraph()
        set_para_format(en_para, space_before=0, space_after=4, indent_left=0.8)
        add_run(en_para, english_line)

    doc.add_paragraph()

    # =========================================================
    # 大問２：読解＋設問
    # =========================================================
    add_section_header(doc, "２",
        "Read the following text and answer the questions.", points="６")

    # 枠線付きボックス（テーブルで代替）
    box_cell = add_box_paragraph(doc)

    passages = [
        ("Student: ", False, "I heard that Copenhagen has become the world's most bicycle-friendly city.", False),
        ("Mr. Hansen: ", False, "That's right. ", False),
        ("①", False, "The city has implemented some unique policies with the goal of becoming the best bike city. ", False),
        ("②", False, "Let me explain one of them—the Green Wave. As long as cyclists maintain a speed of 20 kilometers per hour, the traffic lights are green all the way during rush hour on major bicycle routes. ", False),
        ("③", False, "Copenhagen is also planning to expand its international airport to attract more business travelers. ", False),
        ("④", False, "The road signals are operated simultaneously with the movements of the cyclists, which helped eliminate traffic congestion.", False),
    ]

    box_p1 = box_cell.paragraphs[0]
    set_para_format(box_p1, space_before=2, space_after=2)
    add_run(box_p1, "Student: ")
    add_run(box_p1, "I heard that Copenhagen has become the world's most bicycle-friendly city.")

    box_p2 = box_cell.add_paragraph()
    set_para_format(box_p2, space_before=0, space_after=0)
    add_run(box_p2, "Mr. Hansen: ")
    add_run(box_p2, "That's right. ")
    add_run(box_p2, "①", bold=False)
    add_run(box_p2, "The city has implemented some unique policies with the goal of becoming the best bike city. ")
    add_run(box_p2, "②", bold=False)
    add_run(box_p2, "Let me explain one of them—the Green Wave. As long as cyclists maintain a speed of 20 kilometers per hour, the traffic lights are green all the way during rush hour on major bicycle routes. ")
    add_run(box_p2, "③", bold=False)
    add_run(box_p2, "Copenhagen is also planning to expand its international airport to attract more business travelers. ")
    add_run(box_p2, "④", bold=False)
    add_run(box_p2, "The road signals are operated simultaneously with the movements of the cyclists, which helped eliminate traffic congestion.")

    box_p3 = box_cell.add_paragraph()
    set_para_format(box_p3, space_before=4, space_after=0)
    add_run(box_p3, "Student: ")
    add_run(box_p3, "Does everyone have to cycle at exactly 20 km/h?")

    box_p4 = box_cell.add_paragraph()
    set_para_format(box_p4, space_before=0, space_after=2)
    add_run(box_p4, "Mr. Hansen: ")
    add_run(box_p4, "Well, ( A ) some cyclists would rather go faster, but they can be a danger to other cyclists during rush hour. The Green Wave makes them travel at a safe speed, because if they go too fast, they'll get caught at a red light. ( B ), everyone cycles at the safest speed without sacrificing efficiency.")

    doc.add_paragraph()

    # 設問1
    q2_p1 = doc.add_paragraph()
    set_para_format(q2_p1, space_before=2, space_after=2, indent_left=0.3)
    add_run(q2_p1, "1. Choose one sentence from ① to ④ ", bold=True)
    add_run(q2_p1, "that does not belong in the paragraph.", bold=True, underline=True)
    add_run(q2_p1, "　（下線部は「この段落に適さない」の意）", bold=False)
    add_run(q2_p1, "　　③", bold=True)

    # 設問2
    q2_p2 = doc.add_paragraph()
    set_para_format(q2_p2, space_before=2, space_after=2, indent_left=0.3)
    add_run(q2_p2, "2. Choose the best option for the blanks A and B.", bold=True)
    add_run(q2_p2, "（Words in the options ")
    add_run(q2_p2, "begin with lowercase letters,", underline=True)
    add_run(q2_p2, " even when they come at the beginning of a sentence.（下線部は「小文字ではじまっている」の意））")

    q2_p3 = doc.add_paragraph()
    set_para_format(q2_p3, space_before=0, space_after=4, indent_left=0.5)
    add_run(q2_p3, "[ ア it's true that ／ イ in this way ／ ウ similarly ／ エ what's more ／ オ in short ]")
    add_run(q2_p3, "　　　　A ア　B イ", bold=True)

    # =========================================================
    # 大問３：語句選択（ア〜エ）
    # =========================================================
    add_section_header(doc, "３",
        "Choose the best word for each blank from options ア to エ.  "
        "All the options are given in their base form（下線は「原形で書かれている」の意）.",
        points="４")

    q3_opt = doc.add_paragraph()
    set_para_format(q3_opt, space_before=2, space_after=2, indent_left=0.5)
    add_run(q3_opt, "ア span　　　イ prevent　　　ウ serve　　　エ connect")

    q3_body = doc.add_paragraph()
    set_para_format(q3_body, space_before=2, space_after=2, indent_left=0.3, indent_first=0.3)
    add_run(q3_body,
        "There is also a bicycle bridge （　1　）ning the city center called the Bicycle Snake. "
        "This bridge （　2　）s as a shortcut for cyclists and offers a striking view of the waterfront. "
        "Its gentle curves （　3　） anyone from going too fast, so everyone can cruise safely. "
        "For longer journeys, many Cycle Superhighways （　4　） Copenhagen with surrounding communities, "
        "providing pleasant routes through forests and countryside.")

    q3_ans = doc.add_paragraph()
    set_para_format(q3_ans, space_before=2, space_after=6, indent_left=2)
    add_run(q3_ans, "１ア　２ウ　３イ　４エ", bold=True)

    # =========================================================
    # 大問４：語句挿入位置特定
    # =========================================================
    add_section_header(doc, "４",
        "この英文中には下の５つの語句が抜けている。本来入るべき場所を指摘しなさい。"
        "解答欄には，それぞれの語句が入る場所の前後の単語を書きなさい。"
        "No.０は解答例である。１〜５を解答しなさい。",
        points="１０")

    # 語句ボックス（テーブル）
    word_table = doc.add_table(rows=1, cols=6)
    word_table.style = 'Table Grid'
    words = ["0. are", "1. once", "2. so that", "3. such as", "4. instead of", "5. quicker"]
    for i, word in enumerate(words):
        cell = word_table.cell(0, i)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_run(p, word, size=10)

    doc.add_paragraph()

    # 解答例
    ex_para = doc.add_paragraph()
    set_para_format(ex_para, space_before=0, space_after=2, indent_left=0.3)
    add_run(ex_para, "解答例　　（ cubes ） are （ widely ）")

    # 本文（語句を抜いた状態）
    body_para1 = doc.add_paragraph()
    set_para_format(body_para1, space_before=2, space_after=0, indent_left=0.3, indent_first=0.3)
    add_run(body_para1,
        "Surprisingly, Copenhagen's urban planners used to favor cars over other forms of transportation. "
        "The oil crisis of the 1970s led them to revise their transportation systems they would not have "
        "to rely on oil. Since then, the city has been installing cycling infrastructure the Green Wave "
        "and the Bicycle Snake. As a result, it is now to go downtown by bicycle than by car. "
        "That has led more people to cycle driving.")

    body_para2 = doc.add_paragraph()
    set_para_format(body_para2, space_before=0, space_after=4, indent_left=0.3, indent_first=0.3)
    add_run(body_para2,
        'Making cities healthier and more attractive by adopting bike-friendly policies has come to be known '
        'as "Copenhagenization." Even New York is following Copenhagen\'s example. It has started locating '
        'car parking spaces in the middle of the street. That approach is called the "Protected Bicycle Lane" '
        'policy and it prevents vehicles from entering or parking in the bike lane. Consequently, bicycle traffic '
        'has increased 1.6 times. Moreover, there are fewer accidents. Many other cities may well '
        '"Copenhagenize" as they seek to build more sustainable, livable communities. '
        'The Copenhagen model is changing the world for the better.')

    # 解答
    ans4_para = doc.add_paragraph()
    set_para_format(ans4_para, space_before=2, space_after=6, indent_left=0.3)
    ans4_items = [
        "1.（planners）once（used）",
        "2.（systems）so that（they）",
        "3.（infrastructure）such as（the）",
        "4.（cycle）instead of（driving）",
        "5.（now）quicker（to）",
    ]
    add_run(ans4_para, "　　".join(ans4_items), bold=True, size=9.5)

    # =========================================================
    # 大問３（英文解釈）：空白
    # =========================================================
    add_section_header(doc, "３", "以下の英文解釈に関する問題に答えなさい", points="16")

    blank_para = doc.add_paragraph()
    set_para_format(blank_para, space_before=4, space_after=4, indent_left=0.5)
    add_run(blank_para, "（空白）", bold=True, size=12)

    doc.add_paragraph()
    doc.add_paragraph()
    doc.add_paragraph()

    # =========================================================
    # 大問４（初見）：語句選択ア〜オ
    # =========================================================
    add_section_header(doc, "４",
        "Choose the best word for each blank from options ア to オ.",
        points="１０")

    q4init_body = doc.add_paragraph()
    set_para_format(q4init_body, space_before=2, space_after=2, indent_left=0.3, indent_first=0.3)
    add_run(q4init_body,
        "Emoticons are symbols that people around the world use to ( 1 ) their feelings in digital messages. "
        "In East Asian countries such as Japan and South Korea, horizontal emoticons like (^_^) are ( 2 ) used. "
        "These focus on the eyes. People in Western countries, on the other hand, tend to use vertical emoticons "
        "like :-). These focus on the mouth. Researchers say that this difference ( 3 ) how people in different "
        "cultures read emotions from faces. East Asians focus more on the eyes when interpreting emotions, while "
        "Westerners pay more ( 4 ) to the mouth. As digital communication becomes more ( 5 ), understanding "
        "these cultural differences can help people from different countries communicate more effectively.")

    q4init_opt = doc.add_paragraph()
    set_para_format(q4init_opt, space_before=2, space_after=2, indent_left=1)
    add_run(q4init_opt, "ア widespread　　イ common　　ウ express　　エ reflects　　オ attention")

    q4init_ans = doc.add_paragraph()
    set_para_format(q4init_ans, space_before=2, space_after=6, indent_left=2)
    add_run(q4init_ans, "１ウ　２ア　３エ　４オ　５イ", bold=True)

    # =========================================================
    # 大問５（初見長文読解）
    # =========================================================
    add_section_header(doc, "５",
        "以下の英文を読み、各問いに答えなさい。",
        points="１５")

    # 英文タイトル
    ltitle = doc.add_paragraph()
    ltitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para_format(ltitle, space_before=2, space_after=2)
    add_run(ltitle, "Faces, Emotions, and Emojis", bold=True)

    reading_paras = [
        "　Have you ever sent an emoji to someone in another country and gotten an unexpected reaction? The way people express and interpret emotions can vary greatly depending on cultural background.",
        "　A research team recently compared how Japanese and American participants read emotions from photographs showing various facial expressions. Participants were asked to judge how happy, sad, or surprised the people in the photos appeared. The results were striking: Japanese participants tended to focus on the eyes when judging emotions, while Americans paid more attention to the mouth. This difference in focus led to different interpretations of the very same facial expressions.",
        "　These findings help explain why emoticons differ across cultures. East Asian emoticons like (^_^) and (T_T) focus on the eyes, while Western ones like :-) and :-( focus on the mouth. Each style reflects the way people in those cultures naturally read emotions from faces.",
        "　Researchers suggest that these patterns develop early in life. Children learn to read emotions based on the expressions they see most often in their environment. Over time, these habits become deeply ingrained and affect how people communicate, even in digital spaces.",
        "　Understanding cultural differences in emotional expression is becoming increasingly important in our connected world. By learning how people in other cultures express and interpret emotions, we can improve cross-cultural communication and reduce misunderstandings.",
    ]

    for rp in reading_paras:
        p = doc.add_paragraph()
        set_para_format(p, space_before=0, space_after=0)
        add_run(p, rp)

    doc.add_paragraph()

    # 設問
    q5_items = [
        ("(1)", "What did the research team discover?", "2",
         ["Japanese people are naturally better at reading emotions than Americans.",
          "People from different cultures focused on different parts of the face when reading emotions.",
          "American participants found facial expressions in photographs more difficult to interpret.",
          "Photography is the most effective tool for studying human emotions."]),
        ("(2)", "How are East Asian emoticons different from Western ones?", "2",
         ["East Asian emoticons use more keyboard symbols and special characters.",
          "East Asian emoticons focus on the eyes, while Western emoticons focus on the mouth.",
          "East Asian emoticons are more commonly used in business communication.",
          "East Asian emoticons were invented earlier than Western emoticons."]),
        ("(3)", "How do people develop different patterns for reading emotions?", "3",
         ["They take special courses on emotional intelligence at school.",
          "They are directly taught specific techniques by their parents.",
          "They learn from the facial expressions they see most often in daily life.",
          "They study photographs and digital media from a young age."]),
        ("(4)", "What does the writer suggest is important in today's world?", "2",
         ["Avoiding emoticons in any kind of professional or international communication.",
          "Understanding how people in other cultures express and interpret emotions.",
          "Using only the emoticons that are popular in your own country.",
          "Ensuring that children learn multiple languages from an early age."]),
        ("(5)", "Which statement best matches the main idea of the passage?", "3",
         ["East Asian countries produce far more emoticons than Western countries.",
          "Research has shown that American communication styles are more effective globally.",
          "Cultural differences in how people read emotions are reflected in emoticons and affect cross-cultural communication.",
          "Children around the world learn to express emotions in fundamentally the same way."]),
    ]

    for q_num, q_text, ans, choices in q5_items:
        qp = doc.add_paragraph()
        set_para_format(qp, space_before=3, space_after=1, indent_left=0.3)
        add_run(qp, f"{q_num} {q_text}")
        add_run(qp, f"　　　　{ans}", bold=True)
        for ci, choice in enumerate(choices, 1):
            cp = doc.add_paragraph()
            set_para_format(cp, space_before=0, space_after=0, indent_left=0.8)
            add_run(cp, f"　{ci}.　{choice}")
        doc.add_paragraph()

    # =========================================================
    # 大問６：並べ替え
    # =========================================================
    add_section_header(doc, "６",
        "日本語の意味を表す英文になるように語を並べ替え，（　）内の４番目と８番目"
        "（文頭からではなく，（　）内であることに注意）に来る語を解答欄に記入しなさい。"
        "（解答欄に記入するのは１語ずつである。また，文頭に来る語も１文字目は小文字になっている）",
        points="１０")

    q6_items = [
        ("グリーンウェーブは、効率を犠牲にすることなく誰もが最も安全な速度で走れるよう保証する。",
         "The Green Wave ensures ( that / everyone / cycles / at / the / safest / speed / without ) sacrificing efficiency.",
         "at / without"),
        ("サイクリングは、糖尿病や癌などの病気にかかることをあなたが防いでくれるかもしれない。",
         "Cycling may ( prevent / you / from / getting / diseases / such / as / diabetes ) and cancer.",
         "getting / diabetes"),
        ("自転車で市内に行く方が、車で行くよりも早い。",
         "It is ( now / quicker / to / go / downtown / by / bicycle / than ) by car.",
         "go / than"),
        ("多くの都市が、より持続可能なコミュニティを建設するため「コペンハーゲン化」するかもしれない。",
         "Many cities ( may / well / 'Copenhagenize' / as / they / seek / to / build ) more sustainable communities.",
         "as / build"),
        ("石油危機により、コペンハーゲンの都市計画者は交通システムを見直すことになった。",
         "The oil crisis ( led / Copenhagen's / urban / planners / to / revise / their / transportation ) systems.",
         "planners / transportation"),
    ]

    for i, (jp, en, ans) in enumerate(q6_items, 1):
        jp_p = doc.add_paragraph()
        set_para_format(jp_p, space_before=4, space_after=0, indent_left=0.3)
        add_run(jp_p, f"　{i}．{jp}")
        add_run(jp_p, f"　　{ans}", bold=True)

        en_p = doc.add_paragraph()
        set_para_format(en_p, space_before=0, space_after=2, indent_left=0.8)
        add_run(en_p, en)

    # =========================================================
    # 保存
    # =========================================================
    out_path = "/home/user/teacher-automation-lab/output/exam_comm2_2nd_mid.docx"
    import os
    os.makedirs("/home/user/teacher-automation-lab/output", exist_ok=True)
    doc.save(out_path)
    print(f"保存完了: {out_path}")

if __name__ == "__main__":
    build_exam()
