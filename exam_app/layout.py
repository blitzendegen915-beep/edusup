"""試験のレイアウト計算（番号・配点・選択肢記号・解答用紙の詰め方）。

Word出力（build_docx.py）とチェック（checks.py）が共通で使う。画面のプレビュー
（ui/static/app.js の同名関数）も同じ規則で作ってあるので、変えるときは両方を直すこと。
"""

# 選択肢・語群の記号
CHOICE_MARKS = {
    "1": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    "ア": list("アイウエオカキクケコサシ"),
    "①": list("①②③④⑤⑥⑦⑧⑨⑩⑪⑫"),
    "a": list("abcdefghijkl"),
}

# 解答欄を広く取る形式（1行に1問）
LONG_TYPES = {"translation", "writing", "qa", "table_fill", "paraphrase", "underline_grammar", "rewrite", "referent"}
# 答えが記号1つの形式（1行に5問）
MARK_TYPES = {"choice_4", "choice_3", "definition", "listen_meaning", "vocab_meaning", "vocab_word",
              "vocab_context", "content_match", "accent", "pattern", "reading_misfit", "listening_choice"}


def mark(style: str, i: int) -> str:
    marks = CHOICE_MARKS.get(style or "1", CHOICE_MARKS["1"])
    return marks[i] if 0 <= i < len(marks) else str(i + 1)


def choice_line(style: str, choices) -> list:
    """選択肢を「1. xxx」の形に並べる（数字は「1.」、それ以外は「ア xxx」）。"""
    out = []
    for i, c in enumerate(choices or []):
        m = mark(style, i)
        out.append(f"{m}. {c}" if (style or "1") in ("1", "a") else f"{m} {c}")
    return out


def answer_slots(q: dict) -> list:
    slots = q.get("answer_slots")
    if isinstance(slots, list) and any(str(x).strip() for x in slots):
        return [str(x) for x in slots]
    ans = str(q.get("answer", ""))
    if " / " in ans:
        return [a.strip() for a in ans.split(" / ")]
    return [ans]


def q_points(sec: dict, q: dict) -> int:
    p = q.get("points")
    return int(p) if isinstance(p, int) or (isinstance(p, str) and p.isdigit()) else int(sec.get("points_each", 0))


def section_points(sec: dict) -> int:
    """作成済みの問題の配点合計（個別配点を反映）。"""
    return sum(q_points(sec, q) for q in sec.get("questions", []))


def planned_points(sec: dict) -> int:
    """予定の配点（問数×配点に、作成済みの個別配点の差分を足す）。"""
    base = int(sec.get("points_each", 0))
    extra = sum(q_points(sec, q) - base for q in sec.get("questions", []))
    return base * int(sec.get("count", 0)) + extra


def points_label(sec: dict, labels=None) -> str:
    """解答用紙の配点表示。例: 【1点×8・(9)のみ2点】"""
    qs = sec.get("questions", [])
    pts = [q_points(sec, q) for q in qs]
    # いちばん多い配点を基準にする（同数なら大問の配点）
    base = max(sorted(set(pts)), key=lambda v: (pts.count(v), v == int(sec.get("points_each", 0)))) if pts else 0
    odd = [(i, p) for i, p in enumerate(pts) if p != base]
    head = f"{base}点×{len(qs) - len(odd)}"
    if not odd:
        return f"【{base}点×{len(qs)}】"
    parts = []
    for i, p in odd:
        lab = labels[i] if labels else f"({i + 1})"
        parts.append(f"{lab}のみ{p}点")
    return f"【{head}・{'・'.join(parts)}】"


def per_slot(q: dict) -> bool:
    """通し番号のとき、答える箇所ごとに番号を振る問題か（並び替えの「○番目」など）。"""
    return str(q.get("kind", "")).startswith("reorder") and bool(q.get("slot_labels"))


def numbering(draft: dict) -> list:
    """問題番号を計算する。戻り値は大問ごとのリストで、各問は
    {"label": 問題用紙の番号, "cell": 解答用紙の番号, "slots": 箇所ごとの番号 or None}。"""
    mode = draft.get("exam", {}).get("numbering", "section")
    plan, n = [], 1
    for sec in draft.get("sections", []):
        rows = []
        for i, q in enumerate(sec.get("questions", [])):
            if mode != "global":
                rows.append({"label": f"({i + 1})", "cell": f"({i + 1})", "slots": None})
                continue
            if per_slot(q):
                # 実物どおり、問題は大問内の (1)(2)…、答える箇所に通し番号（34, 35）を振る
                nums = [str(x) for x in range(n, n + len(answer_slots(q)))]
                n += len(nums)
                rows.append({"label": f"({i + 1})", "cell": f"({i + 1})", "slots": nums})
            else:
                rows.append({"label": f"{n}.", "cell": str(n), "slots": None})
                n += 1
        plan.append(rows)
    return plan


def per_row(sec: dict) -> int:
    """解答用紙で1行に並べる問題数。"""
    if int(sec.get("per_row") or 0) > 0:
        return int(sec["per_row"])
    qs = sec.get("questions", [])
    if not qs:
        return 1
    width = max(len(answer_slots(q)) for q in qs)
    if sec.get("type") in LONG_TYPES:
        return 1
    if width == 1:
        return 5 if sec.get("type") in MARK_TYPES or all(q.get("choices") for q in qs) else 3
    if width == 2:
        return 2
    return 1


def reorder_line(q: dict, labels) -> str:
    """並び替えの「解答位置を示す行」。例: I will (　) (　) ( 34 ) (　) ( 35 ) (　) from ..."""
    r = q.get("reorder") or {}
    if not r.get("line") or not r.get("n"):
        return ""
    pos = list(r.get("pos") or [])
    cells = []
    for i in range(1, int(r["n"]) + 1):
        if i in pos and pos.index(i) < len(labels):
            cells.append(f"( {labels[pos.index(i)]} )")
        else:
            cells.append("(　　)")
    return " ".join(x for x in [r.get("before", ""), " ".join(cells), r.get("after", "")] if x).strip()


def heading(exam: dict, sec: dict) -> str:
    """大問の見出し。番号の書き方と配点の書き方は試験の設定に従う。"""
    instr = (sec.get("instructions") or "").strip()
    qs = sec.get("questions", [])
    pts = {q_points(sec, q) for q in qs}
    if exam.get("heading") == "bracket":
        p = f"（各{pts.pop()}点）" if len(pts) == 1 else f"（{section_points(sec)}点）"
        return f"【{sec['no']}】{instr}{p if qs else ''}"
    zen = str(sec["no"]).translate(str.maketrans("0123456789", "０１２３４５６７８９"))
    return f"{zen}　{instr}（{section_points(sec)}点）" if qs else f"{zen}　{instr}"


# ---------------------------------------------------------------- 大問のまとまり
# sections の1つ1つは「設問」。new_big=False の設問は直前の大問の続き（同じ本文を使う問2・問3…）。
# 大問の先頭の設問が、大問の指示文 big_title と本文 passage を持つ。

def groups(sections) -> list:
    """大問ごとに設問の添字をまとめる。例: [[0], [1, 2, 3], [4]]"""
    out = []
    for i, s in enumerate(sections):
        if not out or s.get("new_big") is not False:
            out.append([i])
        else:
            out[-1].append(i)
    return out


def apply_labels(sections) -> None:
    """no（大問番号）・part（問番号。設問が1つなら0）・label（「大問2 問1」）を振る。"""
    for g_no, g in enumerate(groups(sections), 1):
        multi = len(g) > 1
        for k, i in enumerate(g, 1):
            s = sections[i]
            s["no"], s["part"] = g_no, (k if multi else 0)
            s["new_big"] = k == 1
            s["label"] = f"大問{g_no} 問{k}" if multi else f"大問{g_no}"


def big_heading(exam: dict, secs: list) -> str:
    """設問が複数ある大問の見出し。例: ２　次の英文を読んで、後の問いに答えなさい。（20点）"""
    head = secs[0]
    instr = (head.get("big_title") or "").strip()
    total = sum(section_points(s) for s in secs)
    if exam.get("heading") == "bracket":
        return f"【{head['no']}】{instr}（{total}点）"
    zen = str(head["no"]).translate(str.maketrans("0123456789", "０１２３４５６７８９"))
    return f"{zen}　{instr}（{total}点）"


def part_heading(exam: dict, sec: dict) -> str:
    """大問の中の設問の見出し。例: 問1　下線部を和訳しなさい。（4点）"""
    instr = (sec.get("instructions") or "").strip()
    qs = sec.get("questions", [])
    pts = {q_points(sec, q) for q in qs}
    p = f"（各{pts.pop()}点）" if len(pts) == 1 and len(qs) > 1 else f"（{section_points(sec)}点）"
    return f"問{sec.get('part') or 1}　{instr}{p if qs else ''}"
