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
    # 大問３：語句選択（ア〜エ）Lesson 4（絵文字）Part 4 使用
    # =========================================================
    add_section_header(doc, 3,
        "Choose the best word for each blank from options ア to エ.  "
        "All the options are given in their base form.",
        points="４")

    q3_opt = doc.add_paragraph()
    set_para_format(q3_opt, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2)
    add_run(q3_opt, "ア recognize　　　イ baffle　　　ウ conduct　　　エ rate")

    q3_body = doc.add_paragraph()
    set_para_format(q3_body, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=2, space_after=2)
    add_run(q3_body,
        "Lastly, people need to have seen some emoticons before they can understand their meanings. "
        "An experiment was （　1　）ed in Japan, Cameroon, and Tanzania. "
        "The participants were asked to （　2　） three different styles of emoticons by using a "
        "'sadness-happiness' scale. "
        "The Japanese participants easily （　3　）d the emotions in the emoticons. "
        "On the other hand, the participants in Cameroon and Tanzania hardly understood them. "
        "They were utterly （　4　）d by what the shape of each emoticon indicated. "
        "In other words, emoticons do not look like facial expressions to everyone.")

    q3_ans = doc.add_paragraph()
    set_para_format(q3_ans, align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=6)
    add_run(q3_ans, "１ウ　２エ　３ア　４イ", bold=True, yellow=True)

    # =========================================================
    # 大問４：語句挿入（Lesson 3 Part 4 Copenhagenization 使用）
    # =========================================================
    add_section_header(doc, 4,
        "この英文中には下の５つの語句が抜けている。本来入るべき場所を指摘しなさい。"
        "解答欄には，それぞれの語句が入る場所の前後の単語を書きなさい。"
        "No.０は解答例である。１〜５を解答しなさい。",
        points="１０")

    word_table = doc.add_table(rows=1, cols=6)
    word_table.style = 'Table Grid'
    words = ["0. once", "1. so that", "2. such as", "3. quicker", "4. instead of", "5. well"]
    for i, word in enumerate(words):
        cell = word_table.cell(0, i)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_run(p, word, size=10)

    doc.add_paragraph()

    ex_para = doc.add_paragraph()
    set_para_format(ex_para, space_before=0, space_after=2, indent_left=0.3)
    add_run(ex_para, "解答例　　（ planners ） once （ used ）")

    # 語句挿入本文（Lesson 3 Part 4 そのまま・0〜5の語を削除）
    body_para1 = doc.add_paragraph()
    set_para_format(body_para1, align=WD_ALIGN_PARAGRAPH.JUSTIFY,
                    space_before=2, space_after=0)
    add_run(body_para1,
        "Surprisingly, Copenhagen's urban planners used to favor cars over other forms of "
        "transportation. The oil crisis of the 1970s led them to revise their transportation systems "
        "they would not have to rely on oil. Since then, the city has been installing cycling "
        "infrastructure the Green Wave and the Bicycle Snake. As a result, it is now to go downtown "
        "by bicycle than by car. That has led more people to cycle driving.")

    body_para2 = doc.add_paragraph()
    set_para_format(body_para2, align=WD_ALIGN_PARAGRAPH.JUSTIFY,
                    space_before=0, space_after=4)
    add_run(body_para2,
        "Making cities healthier and more attractive by adopting bike-friendly policies has come to "
        "be known as \"Copenhagenization.\" Even New York is following Copenhagen's example. It has "
        "started locating car parking spaces in the middle of the street. That approach is called the "
        "\"Protected Bicycle Lane\" policy and it prevents vehicles from entering or parking in the "
        "bike lane. Consequently, bicycle traffic has increased 1.6 times. Moreover, there are fewer "
        "accidents. Many other cities may \"Copenhagenize\" as they seek to build more sustainable, "
        "livable communities. The Copenhagen model is changing the world for the better.")

    ans4_para = doc.add_paragraph()
    set_para_format(ans4_para, space_before=2, space_after=6, indent_left=0.3)
    ans4_items = [
        "1.（systems）so that（they）",
        "2.（infrastructure）such as（the）",
        "3.（now）quicker（to）",
        "4.（cycle）instead of（driving）",
        "5.（may）well（\"Copenhagenize\"）",
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
    # 大問６：並べ替え（動画でわかる英文法 例文51〜60より・10点）
    # =========================================================
    add_section_header(doc, 6,
        "日本語の意味を表す英文になるように語を並べ替え，（　）内の４番目と８番目"
        "（文頭からではなく，（　）内であることに注意）に来る語を解答欄に記入しなさい。"
        "（解答欄に記入するのは１語ずつである。また，文頭に来る語も１文字目は小文字になっている）",
        points="１０")

    q6_items = [
        (
            "定期的に運動する人々は自分自身により満足している。",
            "( those / who / exercise / regularly / feel / better / about / themselves ).",
            "regularly", "themselves",
            "Those who exercise regularly feel better about themselves."
        ),
        (
            "今日できることを明日に延期するな。",
            "Don't ( put / off / until / tomorrow / what / you / can / do ) today.",
            "tomorrow", "do",
            "Don't put off until tomorrow what you can do today."
        ),
        (
            "彼女は、その賞を取ると私が思っている女の子だ。",
            "She ( is / the / girl / who / I / think / will / win ) the prize.",
            "who", "win",
            "She is the girl who I think will win the prize."
        ),
        (
            "あなたに必要なのは十分な睡眠だ。",
            "( what / you / need / is / to / get / enough / sleep ).",
            "is", "sleep",
            "What you need is to get enough sleep."
        ),
        (
            "新しい経験を共有することができる人たちと友だちになることが重要だ。",
            "It is important ( to / make / friends / with / people / with / whom / you ) can share new experiences.",
            "with", "you",
            "It is important to make friends with people with whom you can share new experiences."
        ),
    ]

    for i, (jp, en, ans4th, ans8th, full_sentence) in enumerate(q6_items, 1):
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
    # 大問７：初見長文読解「シェイクスピアの言語」（英検2級レベル・15点）
    # =========================================================
    add_section_header(doc, 7,
        "以下の英文を読み、各問いに答えなさい。",
        points="１５")

    ltitle = doc.add_paragraph()
    ltitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_para_format(ltitle, space_before=2, space_after=2)
    add_run(ltitle, "Shakespeare and the English Language", bold=True)

    reading_paras = [
        "　William Shakespeare, who lived from 1564 to 1616, is widely considered the greatest writer in the English language. His plays and poems have been translated into every major language and are performed more often than those of any other playwright. However, many people do not realize how deeply Shakespeare has influenced the way we speak English today.",
        "　During Shakespeare's time, the English language was going through a period of rapid change known as Early Modern English. New words were being created at an extraordinary rate to describe new ideas, places, and inventions. Shakespeare himself is believed to have invented more than 1,700 words that are still used in modern English. Words such as \"bedroom,\" \"lonely,\" \"generous,\" and \"fashionable\" all appear for the first time in Shakespeare's works.",
        "　Shakespeare also contributed many phrases that remain common expressions today. When someone says \"break the ice\" to describe starting a conversation with a stranger, or \"all that glitters is not gold\" as a warning not to judge by appearances, they are quoting Shakespeare — often without knowing it.",
        "　Readers today sometimes struggle with Shakespeare's language because it contains archaic forms. For example, Shakespeare often used \"thou\" and \"thee\" instead of \"you,\" and verb endings like \"-eth\" and \"-est\" are no longer part of standard English. Despite these differences, studying Shakespeare's original language can give us a unique window into how English has changed over the past 400 years.",
        "　Today, Shakespeare's influence can be felt not only in literature but also in everyday conversation. Understanding his language helps us appreciate the rich history of English and the remarkable creativity of one of its greatest contributors.",
    ]

    for rp in reading_paras:
        p = doc.add_paragraph()
        set_para_format(p, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=0, line_spacing=18)
        add_run(p, rp)

    doc.add_paragraph()

    q7_items = [
        ("(1)", "What is one thing that surprises many people about Shakespeare?", "3",
         ["He lived in a time when there were very few books available to read.",
          "His plays are performed less often than those of other famous playwrights.",
          "He had a deep influence on the words and expressions we use in English today.",
          "He translated his own works into many different languages."]),
        ("(2)", "Which of the following is NOT mentioned as a word invented by Shakespeare?", "4",
         ["bedroom",
          "fashionable",
          "generous",
          "extraordinary"]),
        ("(3)", "What does \"break the ice\" mean, according to the passage?", "2",
         ["To physically break something frozen in cold weather.",
          "To start a conversation with someone you do not know well.",
          "To perform a scene from a Shakespeare play on stage.",
          "To warn others not to make hasty judgments."]),
        ("(4)", "Why do modern readers sometimes find Shakespeare's language difficult?", "3",
         ["His plays contain words that cannot be found in any dictionary.",
          "The plots of his plays are too complicated to follow.",
          "He used old-fashioned pronouns and verb endings no longer used today.",
          "His works were written in a completely different language."]),
        ("(5)", "What is the main idea of this passage?", "3",
         ["Shakespeare's plays are the most widely performed in the world.",
          "Early Modern English was very different from the English spoken today.",
          "Shakespeare made lasting contributions to the English language that continue to influence us.",
          "Studying old literature is the best way to improve your English skills."]),
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
            "congestion", "bicycle",
            "has reduced traffic congestion by expanding its bicycle lanes."
        ),
        (
            "毎朝何千人もの人々が安全に職場まで自転車で通勤している。",
            "Every morning, ( thousands / of / people / commute / to / work / by / bicycle ) safely.",
            "commute", "bicycle",
            "thousands of people commute to work by bicycle safely."
        ),
        (
            "市が自転車専用の橋を建設したのは、利用者の便利さを考えたからだ。",
            "The city built ( a / bridge / just / for / cyclists / because / it / considered ) their convenience.",
            "for", "considered",
            "a bridge just for cyclists because it considered their convenience."
        ),
        (
            "より多くの都市が自転車に優しい政策を取り入れることを期待されている。",
            "More cities ( are / expected / to / adopt / policies / that / favor / cyclists ) in the future.",
            "adopt", "cyclists",
            "are expected to adopt policies that favor cyclists in the future."
        ),
        (
            "この成功例は他の国々が見習うべきモデルとなっている。",
            "This successful example ( has / become / a / model / that / other / countries / should ) follow.",
            "model", "should",
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
