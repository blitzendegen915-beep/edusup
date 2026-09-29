"""決定論チェック（API不使用・無料）。skills/exam-verify Step3 の機械化。

generate直後とverify時に必ず走らせる。LLMに頼らず確実に検出できるものは
コードで検出する。
"""


def run_all(draft: dict) -> list[str]:
    """問題点のリストを返す。空なら合格。"""
    issues = []
    issues += check_points(draft)
    issues += check_numbering(draft)
    issues += check_sources(draft)
    issues += check_empty(draft)
    issues += check_slot_count(draft)
    issues += check_duplicates(draft)
    issues += check_choice_balance(draft)
    return issues


def answer_slots(q: dict) -> list[str]:
    """解答用紙の枠ごとの答え（1枠1語）。answer_slots が無ければ
    answer を " / " で区切ったもの、それも無ければ answer 全体を1枠とする。"""
    slots = q.get("answer_slots")
    if isinstance(slots, list) and any(str(x).strip() for x in slots):
        return [str(x) for x in slots]
    ans = str(q.get("answer", ""))
    if " / " in ans:
        return [a.strip() for a in ans.split(" / ")]
    return [ans]


def check_empty(draft) -> list[str]:
    """問題文・解答が空のまま残っていないか（skeleton の記入漏れ対策）。"""
    issues = []
    for s in draft["sections"]:
        for q in s["questions"]:
            key = f"大問{s['no']}({q['number']})"
            if not str(q.get("body", "")).strip():
                issues.append(f"{key}: 問題文が空")
            if not str(q.get("answer", "")).strip():
                issues.append(f"{key}: 解答が空")
    return issues


def check_slot_count(draft) -> list[str]:
    """空所補充で、空所（　）の数と解答枠の数が一致しているか（1枠1語）。"""
    issues = []
    for s in draft["sections"]:
        if s.get("type") != "fill_blank":
            continue
        for q in s["questions"]:
            blanks = str(q.get("body", "")).count("（")
            n = len(answer_slots(q))
            if blanks and n != blanks:
                issues.append(f"大問{s['no']}({q['number']}): 空所{blanks}個に対し"
                              f"解答枠{n}個（1枠1語になっていない）")
    return issues


def check_points(draft) -> list[str]:
    total = sum(s["points_each"] * len(s["questions"]) for s in draft["sections"])
    want = draft["exam"].get("written_points")
    if want and total != want:
        return [f"配点: 作成済みの問題の合計{total}点 ≠ 満点{want}点"]
    return []


def check_numbering(draft) -> list[str]:
    issues = []
    for s in draft["sections"]:
        nums = [q["number"] for q in s["questions"]]
        if nums != list(range(1, len(nums) + 1)):
            issues.append(f"大問{s['no']}: 小問番号が連番でない {nums}")
        if len(s["questions"]) != s.get("count", len(nums)):
            issues.append(
                f"大問{s['no']}: 作成済み{len(s['questions'])}問 ≠ 予定{s['count']}問")
    return issues


def check_sources(draft) -> list[str]:
    issues = []
    for s in draft["sections"]:
        for q in s["questions"]:
            if not q.get("source_ref", "").strip():
                issues.append(f"大問{s['no']}({q['number']}): 出典なし（破棄対象）")
    return issues


def check_duplicates(draft) -> list[str]:
    """同じ答え・同じ出典が試験内で重複していないか（rush/conduct事故の対策）。"""
    issues = []
    seen_ans: dict[str, str] = {}
    seen_src: dict[str, str] = {}
    for s in draft["sections"]:
        for q in s["questions"]:
            key = f"大問{s['no']}({q['number']})"
            a = q["answer"].strip().lower()
            if len(a) <= 1 or a in {c.lower() for c in _CHOICE_MARKS}:
                a = None  # 選択記号は複数問で同じでも正常（偏りは別チェック）
            if a and a in seen_ans:
                issues.append(f"{key}: 答え '{q['answer']}' が {seen_ans[a]} と重複")
            else:
                seen_ans[a] = key
            src = q.get("source_ref", "").strip()
            if s.get("type") in PASSAGE_TYPES:
                src = ""  # 長文系は同じ本文から複数問出すのが正常
            if src and src in seen_src:
                issues.append(f"{key}: 出典 '{src}' が {seen_src[src]} と重複")
            elif src:
                seen_src[src] = key
    return issues


_CHOICE_MARKS = set("1234アイウエオ①②③④")

# 1つの本文から複数問を出すのが普通の形式（出典の重複チェック対象外）
PASSAGE_TYPES = {"reading_misfit", "content_match", "insertion", "choice_4",
                 "translation", "underline_grammar"}


def check_choice_balance(draft) -> list[str]:
    """選択式の大問で正解記号が全問同じなら警告。"""
    issues = []
    for s in draft["sections"]:
        answers = [q["answer"].strip() for q in s["questions"]]
        if (len(answers) >= 3
                and all(len(a) == 1 and a in _CHOICE_MARKS for a in answers)
                and len(set(answers)) == 1):
            issues.append(f"大問{s['no']}: 正解が全問 '{answers[0]}' に偏っている")
    return issues
