"""決定論チェック（API不使用・無料）。skills/exam-verify Step3 の機械化。

generate直後・verify時・画面のチェックで必ず走らせる。LLMに頼らず確実に検出できるものは
コードで検出する。
"""
from .layout import answer_slots, apply_labels, q_points  # noqa: F401  (answer_slots は他モジュールも利用)


def _lab(s) -> str:
    """設問の呼び名（「大問2 問1」。設問が1つの大問は「大問2」）。"""
    return s.get("label") or f"大問{s['no']}"

_CHOICE_MARKS = set("1234アイウエオ①②③④abcd")

# 1つの本文・単語リストから複数問を出すのが普通の形式（出典の重複チェック対象外）
PASSAGE_TYPES = {"reading_misfit", "content_match", "insertion", "choice_4", "choice_3",
                 "translation", "underline_grammar", "listening", "listening_choice", "qa",
                 "table_fill", "referent", "definition", "listen_meaning", "vocab_meaning", "vocab_word",
                 "vocab_context", "vocab_spelling"}


def run_all(draft: dict) -> list[str]:
    """問題点のリストを返す。空なら合格。"""
    apply_labels(draft["sections"])  # 「大問2 問1」の呼び名を振る
    issues = []
    issues += check_points(draft)
    issues += check_numbering(draft)
    issues += check_sources(draft)
    issues += check_empty(draft)
    issues += check_slot_count(draft)
    issues += check_choices(draft)
    issues += check_duplicates(draft)
    issues += check_choice_balance(draft)
    return issues


def check_points(draft) -> list[str]:
    total = sum(q_points(s, q) for s in draft["sections"] for q in s["questions"])
    want = draft["exam"].get("written_points")
    if want and total != want:
        return [f"配点: 作成済みの問題の合計{total}点 ≠ 満点{want}点"]
    return []


def check_numbering(draft) -> list[str]:
    issues = []
    for s in draft["sections"]:
        nums = [q["number"] for q in s["questions"]]
        if nums != list(range(1, len(nums) + 1)):
            issues.append(f"{_lab(s)}: 小問番号が連番でない {nums}")
        if len(s["questions"]) != s.get("count", len(nums)):
            issues.append(f"{_lab(s)}: 作成済み{len(s['questions'])}問 ≠ 予定{s['count']}問")
    return issues


def check_sources(draft) -> list[str]:
    issues = []
    for s in draft["sections"]:
        for q in s["questions"]:
            if not q.get("source_ref", "").strip():
                issues.append(f"{_lab(s)}({q['number']}): 出典なし（破棄対象）")
    return issues


def check_empty(draft) -> list[str]:
    """問題文・解答が空のまま残っていないか。リスニングは放送文があれば問題文なしで可。"""
    issues = []
    for s in draft["sections"]:
        for q in s["questions"]:
            key = f"{_lab(s)}({q['number']})"
            if not str(q.get("body", "")).strip() and not str(q.get("script", "")).strip() and not q.get("choices"):
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
            if q.get("choices"):
                continue
            blanks = str(q.get("body", "")).count("（")
            n = len(answer_slots(q))
            if blanks and n != blanks:
                issues.append(f"{_lab(s)}({q['number']}): 空所{blanks}個に対し"
                              f"解答枠{n}個（1枠1語になっていない）")
    return issues


def check_choices(draft) -> list[str]:
    """選択肢の重複・空欄、正解の番号が選択肢の範囲にあるか。"""
    issues = []
    for s in draft["sections"]:
        for q in s["questions"]:
            ch = q.get("choices")
            if not ch:
                continue
            key = f"{_lab(s)}({q['number']})"
            clean = [str(c).strip().lower() for c in ch]
            if any(not c for c in clean):
                issues.append(f"{key}: 空欄の選択肢がある")
            elif len(set(clean)) < len(clean):
                issues.append(f"{key}: 選択肢が重複している")
            c = q.get("correct")
            if isinstance(c, int) and not 0 <= c < len(ch):
                issues.append(f"{key}: 正解の番号が選択肢の範囲外")
    return issues


def check_duplicates(draft) -> list[str]:
    """同じ答え・同じ出典が試験内で重複していないか（rush/conduct事故の対策）。"""
    issues = []
    seen_ans: dict[str, str] = {}
    seen_src: dict[str, str] = {}
    for s in draft["sections"]:
        for q in s["questions"]:
            key = f"{_lab(s)}({q['number']})"
            a = str(q.get("answer", "")).strip().lower()
            if len(a) <= 1 or a in {c.lower() for c in _CHOICE_MARKS} or a.isdigit():
                a = ""  # 選択記号は複数問で同じでも正常（偏りは別チェック）
            if a and a in seen_ans:
                issues.append(f"{key}: 答え '{q['answer']}' が {seen_ans[a]} と重複")
            elif a:
                seen_ans[a] = key
            src = str(q.get("source_ref", "")).strip()
            if s.get("type") in PASSAGE_TYPES or s.get("part") or s.get("passage"):
                src = ""  # 長文系・単語リスト系は同じ出典から複数問出すのが正常
            if src and src in seen_src:
                issues.append(f"{key}: 出典 '{src}' が {seen_src[src]} と重複")
            elif src:
                seen_src[src] = key
    return issues


def check_choice_balance(draft) -> list[str]:
    """選択式の大問で正解記号が偏っていないか（全問同じ・半分以上が同じ）。"""
    issues = []
    for s in draft["sections"]:
        answers = [str(q.get("answer", "")).strip() for q in s["questions"]]
        if len(answers) < 3 or not all(len(a) <= 2 and (a in _CHOICE_MARKS or a.isdigit()) for a in answers):
            continue
        top = max(set(answers), key=answers.count)
        if len(set(answers)) == 1:
            issues.append(f"{_lab(s)}: 正解が全問 '{top}' に偏っている")
        elif len(answers) >= 8 and answers.count(top) > len(answers) / 2:
            issues.append(f"{_lab(s)}: 正解の半分以上が '{top}'（{answers.count(top)}/{len(answers)}問）")
    return issues
