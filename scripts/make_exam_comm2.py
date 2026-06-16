"""
英語コミュニケーションII 1学期期末試験 Word生成スクリプト
過去問（1学期中間試験）のレイアウト・書式を完全に模倣して .docx を出力する
"""

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

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

def highlight_yellow(run):
    """語句・短答の模範解答用：黄色ハイライト"""
    r = run._r
    rPr = r.get_or_add_rPr()
    existing = rPr.find(qn('w:highlight'))
    if existing is not None:
        rPr.remove(existing)
    hl = OxmlElement('w:highlight')
    hl.set(qn('w:val'), 'yellow')
    rPr.append(hl)

def add_char_border(run):
    """長文読解の選択肢解答用：文字を枠線で囲む"""
    r = run._r
    rPr = r.get_or_add_rPr()
    bdr = OxmlElement('w:bdr')
    bdr.set(qn('w:val'), 'single')
    bdr.set(qn('w:sz'), '4')
    bdr.set(qn('w:space'), '1')
    bdr.set(qn('w:color'), 'auto')
    rPr.append(bdr)

def add_run(para, text, bold=False, italic=False, underline=False, size=10.5,
            ja_font="MS Mincho", en_font="Times New Roman", yellow=False, boxed=False):
    run = para.add_run(text)
    set_font(run, name_ja=ja_font, name_en=en_font, size=size, bold=bold, italic=italic, underline=underline)
    if yellow:
        highlight_yellow(run)
    if boxed:
        add_char_border(run)
    return run

def set_para_format(para, align=None, space_before=0, space_after=0,
                    line_spacing=None, indent_left=0, indent_first=0,
                    right_tab_at=None):
    pf = para.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after  = Pt(space_after)
    pf.left_indent  = Cm(indent_left)
    pf.first_line_indent = Cm(indent_first)
    if align is not None:
        para.alignment = align
    if line_spacing is not None:
        pf.line_spacing = Pt(line_spacing)
    if right_tab_at is not None:
        pf.tab_stops.add_tab_stop(Cm(right_tab_at), WD_TAB_ALIGNMENT.RIGHT)

# 本文幅（A4・左右2.5cm余白）に対する右端タブ位置
RIGHT_MARGIN_TAB = 16.0

def add_boxed_number(para, number):
    """実際の枠線で囲んだ半角数字（過去問の□1スタイル）"""
    run = para.add_run(str(number))
    set_font(run, size=11, bold=True)
    r = run._r
    rPr = r.get_or_add_rPr()
    bdr = OxmlElement('w:bdr')
    bdr.set(qn('w:val'), 'single')
    bdr.set(qn('w:sz'), '8')
    bdr.set(qn('w:space'), '2')
    bdr.set(qn('w:color'), 'auto')
    rPr.append(bdr)
    return run

def add_section_header(doc, number, text, points=None):
    """大問ヘッダー: [1] 指示文 （XX点）"""
    para = doc.add_paragraph()
    set_para_format(para, space_before=8, space_after=2)
    add_boxed_number(para, number)
    add_run(para, "　" + text, bold=True, size=10.5)
    if points:
        add_run(para, f"（{points}点）", bold=True, size=10.5)
    return para

def add_dialogue_line(doc, speaker, body_runs):
    """ぶら下げインデントの会話文（枠線なし）
    body_runs: [(text, kwargs), ...]
    """
    p = doc.add_paragraph()
    set_para_format(p, align=WD_ALIGN_PARAGRAPH.JUSTIFY,
                    space_before=0, space_after=0,
                    indent_left=1.0, indent_first=-1.0)
    add_run(p, speaker)
    for text, kwargs in body_runs:
        add_run(p, text, **kwargs)
    return p

def set_page_layout(doc):
    """A4・余白設定"""
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

    style = doc.styles['Normal']
    style.font.name = 'Times New Roman'
    style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), 'MS Mincho')

    # =========================================================
    # タイトル
    # =========================================================
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para_format(title, space_before=0, space_after=4)
    add_run(title, "２０２６年　２学年受験コース　英語コミュニケーションⅡ　１学期期末試験",
            bold=True, size=12)

    doc.add_paragraph()

    # =========================================================
    # 大問１：空所補充（過去問の出典文と重複しない独立した9文）
    # =========================================================
    add_section_header(doc, 1,
        "日本文の意味になるように英文の空所に適語を入れなさい。"
        "空欄にアルファベットがあるものは、それではじまる単語を答えること。",
        points="９")

    q1_data = [
        ("彼の名前はそのリストに", "加えられる", "だろう。",
         "His name will （　　　）（　　　）（　　　） the list.", "be added to"),
        ("彼の学校の成績は", "着実に", "良くなっている。",
         "His school work is （ s　　　　） getting better.", "steadily"),
        ("一生懸命働くことがあなたが成功するための", "基本", "である。",
         "Working hard is （ f　　　　　） for your success.", "fundamental"),
        ("年齢性別に", "関わらず", "、身体のトレーニングはとても重要です。",
         "（　　　）（　　　） your age or gender, physical training is very important.", "Regardless of"),
        ("彼女がパリで始めた小さな店は、巨大な世界企業へと", "進化した", "。",
         "The small shop she started in Paris has （　　　） into a huge global company.", "evolved"),
        ("私たちのグループは10人のメンバーで", "構成されている", "。",
         "Our group （　　　）（　　　） ten members.", "consists of"),
        ("ワーズワースはイギリスの偉大な詩人として", "知られている", "。",
         "Wordsworth （　　　）（　　　）（　　　） a great English poet.", "is known as"),
        ("よく考えた末、私はその仕事の依頼を", "受けることにした", "。",
         "After some （ r　　　　　）, I decided to accept the job offer.", "reflection(s)"),
        ("2004年、熊野古道は世界遺産に", "登録された", "。",
         "In 2004, Kumano-kodo （　　　）（　　　） as a World Heritage Site.", "was registered"),
    ]

    for i, (pre, underline_text, post, english_line, hint) in enumerate(q1_data, 1):
        jp_para = doc.add_paragraph()
        set_para_format(jp_para, space_before=3, space_after=0, indent_left=0.3,
                        right_tab_at=RIGHT_MARGIN_TAB)
        add_run(jp_para, f"({i})　{pre}")
        add_run(jp_para, underline_text, underline=True)
        add_run(jp_para, post)
        add_run(jp_para, "\t")
        add_run(jp_para, hint, bold=True, yellow=True)

        en_para = doc.add_paragraph()
        set_para_format(en_para, align=WD_ALIGN_PARAGRAPH.LEFT,
                        space_before=0, space_after=4, indent_left=0.8)
        add_run(en_para, english_line)

    doc.add_paragraph()

    # =========================================================
    # 大問２：読解＋設問（枠線なし・ぶら下げインデント）
    # =========================================================
    add_section_header(doc, 2,
        "Read the following text and answer the questions.", points="６")

    add_dialogue_line(doc, "Student: ",
        [("I heard that Copenhagen has become the world's most bicycle-friendly city.", {})])
    add_dialogue_line(doc, "Mr. Hansen: ", [
        ("That's right. ", {}),
        ("①", {}),
        ("The city has implemented some unique policies with the goal of becoming the best bike city. ", {}),
        ("②", {}),
        ("Let me explain one of them—the Green Wave. As long as cyclists maintain a speed of 20 kilometers per hour, the traffic lights are green all the way during rush hour on major bicycle routes. ", {}),
        ("③", {}),
        ("Copenhagen is also planning to expand its international airport to attract more business travelers. ", {}),
        ("④", {}),
        ("The road signals are operated simultaneously with the movements of the cyclists, which helped eliminate traffic congestion.", {}),
    ])
    add_dialogue_line(doc, "Student: ",
        [("Does everyone have to cycle at exactly 20 km/h?", {})])
    add_dialogue_line(doc, "Mr. Hansen: ", [
        ("Well, ( A ) some cyclists would rather go faster, but they can be a danger to other cyclists during rush hour. "
         "The Green Wave makes them travel at a safe speed, because if they go too fast, they'll get caught at a red light. "
         "( B ), everyone cycles at the safest speed without sacrificing efficiency.", {}),
    ])

    doc.add_paragraph()

    q2_p1 = doc.add_paragraph()
    set_para_format(q2_p1, space_before=2, space_after=2, indent_left=0.3,
                    right_tab_at=RIGHT_MARGIN_TAB)
    add_run(q2_p1, "1. Choose one sentence from ① to ④ ", bold=True)
    add_run(q2_p1, "that does not belong in the paragraph.", bold=True, underline=True)
    add_run(q2_p1, "\t")
    add_run(q2_p1, "③", bold=True, yellow=True)

    q2_p2 = doc.add_paragraph()
    set_para_format(q2_p2, space_before=2, space_after=2, indent_left=0.3)
    add_run(q2_p2, "2. Choose the best option for the blanks A and B.", bold=True)
    add_run(q2_p2, "（Words in the options ")
    add_run(q2_p2, "begin with lowercase letters,", underline=True)
    add_run(q2_p2, " even when they come at the beginning of a sentence.）")

    q2_p3 = doc.add_paragraph()
    set_para_format(q2_p3, space_before=0, space_after=2, indent_left=0.5,
                    right_tab_at=RIGHT_MARGIN_TAB)
    add_run(q2_p3, "[ ア it's true that ／ イ in this way ／ ウ similarly ／ エ what's more ／ オ in short ]")
    add_run(q2_p3, "\t")
    add_run(q2_p3, "A", bold=True)
    add_run(q2_p3, "ア", bold=True, yellow=True)
    add_run(q2_p3, " B", bold=True)
    add_run(q2_p3, "イ", bold=True, yellow=True)

    # =========================================================
    # 大問３：語句選択（ア〜エ）
    # =========================================================
    add_section_header(doc, 3,
        "Choose the best word for each blank from options ア to エ.  "
        "All the options are given in their base form.",
        points="４")

    q3_opt = doc.add_paragraph()
    set_para_format(q3_opt, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2)
    add_run(q3_opt, "ア span　　　イ prevent　　　ウ serve　　　エ connect")

    q3_body = doc.add_paragraph()
    set_para_format(q3_body, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=2, space_after=2)
    add_run(q3_body,
        "There is also a bicycle bridge （　1　）ning the city center called the Bicycle Snake. "
        "This bridge （　2　）s as a shortcut for cyclists and offers a striking view of the waterfront. "
        "Its gentle curves （　3　） anyone from going too fast, so everyone can cruise safely. "
        "For longer journeys, many Cycle Superhighways （　4　） Copenhagen with surrounding communities, "
        "providing pleasant routes through forests and countryside.")

    q3_ans = doc.add_paragraph()
    set_para_format(q3_ans, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=6)
    add_run(q3_ans, "１ウ　２エ　３イ　４ア", bold=True, yellow=True)

    # =========================================================
    # 大問４：語句挿入位置特定
    # =========================================================
    add_section_header(doc, 4,
        "この英文中には下の５つの語句が抜けている。本来入るべき場所を指摘しなさい。"
        "解答欄には，それぞれの語句が入る場所の前後の単語を書きなさい。"
        "No.０は解答例である。１〜５を解答しなさい。",
        points="１０")

    word_table = doc.add_table(rows=1, cols=6)
    word_table.style = 'Table Grid'
    words = ["0. are", "1. once", "2. that", "3. than", "4. driving", "5. quicker"]
    for i, word in enumerate(words):
        cell = word_table.cell(0, i)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_run(p, word, size=10)

    doc.add_paragraph()

    ex_para = doc.add_paragraph()
    set_para_format(ex_para, space_before=0, space_after=2, indent_left=0.3)
    add_run(ex_para, "解答例　　（ cubes ） are （ widely ）")

    body_para1 = doc.add_paragraph()
    set_para_format(body_para1, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=2, space_after=0)
    add_run(body_para1,
        "Surprisingly, Copenhagen's urban planners used to favor cars over other forms of transportation. "
        "The Bicycle Snake bridge, built more recently, serves as a shortcut for cyclists and offers a striking "
        "view of the waterfront. As a result, it is now quicker to go downtown by bicycle by car. "
        "That has led more people to cycle than .")

    body_para2 = doc.add_paragraph()
    set_para_format(body_para2, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=4)
    add_run(body_para2,
        'Making cities healthier and more attractive by adopting bike-friendly policies has come to be known '
        'as "Copenhagenization." Even New York is following Copenhagen\'s example. It has started locating '
        'car parking spaces in the middle of the street so vehicles cannot enter the bike lane. Consequently, '
        'bicycle traffic has increased 1.6 times. Moreover, there are fewer accidents. The Copenhagen model '
        'is changing the world for the better.')

    ans4_para = doc.add_paragraph()
    set_para_format(ans4_para, space_before=2, space_after=6, indent_left=0.3)
    ans4_items = [
        "1.（recently）built（,）",
        "2.（quicker）to go（downtown）",
        "3.（by）bicycle（than）",
        "4.（cycle）than（driving）",
        "5.（in the middle of the street）so that（vehicles）",
    ]
    add_run(ans4_para, "　　".join(ans4_items), bold=True, yellow=True, size=9.5)

    # =========================================================
    # 大問５（英文解釈）：空白
    # =========================================================
    add_section_header(doc, 5, "以下の英文解釈に関する問題に答えなさい", points="16")

    blank_para = doc.add_paragraph()
    set_para_format(blank_para, space_before=4, space_after=4, indent_left=0.5)
    add_run(blank_para, "（空白）", bold=True, size=12)

    doc.add_paragraph()
    doc.add_paragraph()
    doc.add_paragraph()

    # =========================================================
    # 大問６（初見）：語句選択ア〜オ
    # =========================================================
    add_section_header(doc, 6,
        "Choose the best word for each blank from options ア to オ.",
        points="１０")

    q6init_body = doc.add_paragraph()
    set_para_format(q6init_body, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=2, space_after=2)
    add_run(q6init_body,
        "Emoticons are symbols that people around the world use to ( 1 ) their feelings in digital messages. "
        "In East Asian countries such as Japan and South Korea, horizontal emoticons like (^_^) are ( 2 ) used. "
        "These focus on the eyes. People in Western countries, on the other hand, tend to use vertical emoticons "
        "like :-). These focus on the mouth. Researchers say that this difference ( 3 ) how people in different "
        "cultures read emotions from faces. East Asians focus more on the eyes when interpreting emotions, while "
        "Westerners pay more ( 4 ) to the mouth. As digital communication becomes more ( 5 ), understanding "
        "these cultural differences can help people from different countries communicate more effectively.")

    q6init_opt = doc.add_paragraph()
    set_para_format(q6init_opt, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2)
    add_run(q6init_opt, "ア widespread　　イ common　　ウ express　　エ reflects　　オ attention")

    q6init_ans = doc.add_paragraph()
    set_para_format(q6init_ans, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=6)
    add_run(q6init_ans, "１ウ　２イ　３エ　４オ　５ア", bold=True, yellow=True)

    # =========================================================
    # 大問７（初見長文読解）：解答は枠線囲み数字
    # =========================================================
    add_section_header(doc, 7,
        "以下の英文を読み、各問いに答えなさい。",
        points="１５")

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
        set_para_format(p, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=0, line_spacing=18)
        add_run(p, rp)

    doc.add_paragraph()

    q7_items = [
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

    for q_num, q_text, ans, choices in q7_items:
        qp = doc.add_paragraph()
        set_para_format(qp, space_before=3, space_after=1, indent_left=0.3,
                        right_tab_at=RIGHT_MARGIN_TAB)
        add_run(qp, f"{q_num} {q_text}")
        add_run(qp, "\t")
        add_run(qp, ans, bold=True, boxed=True)
        for ci, choice in enumerate(choices, 1):
            cp = doc.add_paragraph()
            set_para_format(cp, space_before=0, space_after=0, indent_left=0.8)
            add_run(cp, f"　{ci}.　{choice}")
        doc.add_paragraph()

    # =========================================================
    # 大問８：並べ替え（過去問の出典文と重複しない独立した5文）
    # =========================================================
    add_section_header(doc, 8,
        "日本語の意味を表す英文になるように語を並べ替え，（　）内の４番目と８番目"
        "（文頭からではなく，（　）内であることに注意）に来る語を解答欄に記入しなさい。"
        "（解答欄に記入するのは１語ずつである。また，文頭に来る語も１文字目は小文字になっている）",
        points="１０")

    q8_items = [
        (
            "コペンハーゲンは自転車専用道路を拡大することで交通渋滞を減らしてきた。",
            "Copenhagen ( has / reduced / traffic / congestion / by / expanding / its / bicycle ) lanes.",
            "by", "its",
            "has reduced traffic congestion by expanding its bicycle lanes."
        ),
        (
            "毎朝何千人もの人々が安全に職場まで自転車で通勤している。",
            "Every morning, ( thousands / of / people / commute / to / work / by / bicycle ) safely.",
            "people", "by",
            "thousands of people commute to work by bicycle safely."
        ),
        (
            "市が自転車専用の橋を建設したのは、利用者の便利さを考えたからだ。",
            "The city built ( a / bridge / just / for / cyclists / because / it / considered ) their convenience.",
            "for", "it",
            "a bridge just for cyclists because it considered their convenience."
        ),
        (
            "より多くの都市が自転車に優しい政策を取り入れることを期待されている。",
            "More cities ( are / expected / to / adopt / policies / that / favor / cyclists ) in the future.",
            "adopt", "favor",
            "are expected to adopt policies that favor cyclists in the future."
        ),
        (
            "この成功例は他の国々が見習うべきモデルとなっている。",
            "This successful example ( has / become / a / model / that / other / countries / should ) follow.",
            "a", "should",
            "has become a model that other countries should follow."
        ),
    ]

    for i, (jp, en, ans4th, ans8th, full_sentence) in enumerate(q8_items, 1):
        jp_p = doc.add_paragraph()
        set_para_format(jp_p, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=4, space_after=0,
                        indent_left=0.3, right_tab_at=RIGHT_MARGIN_TAB)
        add_run(jp_p, f"　{i}．{jp}")
        add_run(jp_p, "\t")
        add_run(jp_p, f"{ans4th} / {ans8th}", bold=True, yellow=True)

        en_p = doc.add_paragraph()
        set_para_format(en_p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=0, space_after=0, indent_left=0.8)
        add_run(en_p, en)

        ans_p = doc.add_paragraph()
        set_para_format(ans_p, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=0, space_after=4, indent_left=0.8)
        add_run(ans_p, full_sentence, size=9.5)

    # =========================================================
    # 保存
    # =========================================================
    out_path = "/home/user/teacher-automation-lab/output/exam_comm2_final.docx"
    import os
    os.makedirs("/home/user/teacher-automation-lab/output", exist_ok=True)
    doc.save(out_path)
    print(f"保存完了: {out_path}")

if __name__ == "__main__":
    build_exam()
