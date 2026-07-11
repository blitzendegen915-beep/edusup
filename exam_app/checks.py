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
    issues += check_duplicates(draft)
    issues += check_choice_balance(draft)
    return issues


def check_points(draft) -> list[str]:
    total = sum(s["points_each"] * len(s["questions"]) for s in draft["sections"])
    want = draft["exam"].get("written_points")
    if want and total != want:
        return [f"配点: 合計{total}点 ≠ 指定{want}点"]
    return []


def check_numbering(draft) -> list[str]:
    issues = []
    for s in draft["sections"]:
        nums = [q["number"] for q in s["questions"]]
        if nums != list(range(1, len(nums) + 1)):
            issues.append(f"大問{s['no']}: 小問番号が連番でない {nums}")
        if len(s["questions"]) != s.get("count", len(nums)):
            issues.append(
                f"大問{s['no']}: 問数{len(s['questions'])} ≠ オーダー{s['count']}")
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
            if src and src in seen_src:
                issues.append(f"{key}: 出典 '{src}' が {seen_src[src]} と重複")
            elif src:
                seen_src[src] = key
    return issues


_CHOICE_MARKS = set("1234アイウエオ①②③④")


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
