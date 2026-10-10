"""API不使用部分の回帰テスト。実行: python -m exam_app.tests.test_offline"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from exam_app import checks, build_docx, extract  # noqa: E402


def _draft(**exam):
    return {
        "exam": {"title": "テスト試験", **exam},
        "sections": [
            {"no": 1, "type": "fill_blank", "points_each": 1, "count": 2, "questions": [
                {"number": 1, "body": "Many people (  ) to Nagoya.",
                 "answer": "commute", "source_ref": "L3 Part3①(6)", "alt_answer_risk": "低"},
                {"number": 2, "body": "Hope for peace is ( u ).",
                 "answer": "universal", "source_ref": "L4 Part4①(6)", "alt_answer_risk": "uヒント"},
            ]},
        ],
    }


def test_checks_pass():
    assert checks.run_all(_draft(written_points=2)) == []


def test_checks_detect():
    d = _draft(written_points=5)                      # 配点ズレ
    d["sections"][0]["questions"][1]["number"] = 3    # 連番ズレ
    d["sections"][0]["questions"][1]["source_ref"] = ""  # 出典なし
    issues = checks.run_all(d)
    assert any("配点" in i for i in issues)
    assert any("連番" in i for i in issues)
    assert any("出典なし" in i for i in issues)


def test_checks_duplicates_and_bias():
    d = _draft()
    d["sections"].append({"no": 2, "type": "choice", "points_each": 2, "count": 3,
        "questions": [
            {"number": i, "body": f"C{i}", "answer": "ア",
             "source_ref": f"s{i}", "alt_answer_risk": ""} for i in (1, 2, 3)]})
    issues = checks.run_all(d)
    assert any("偏って" in i for i in issues)
    assert not any("'ア' が" in i for i in issues)  # 選択記号は重複扱いしない
    d["sections"][0]["questions"][1]["answer"] = "commute"
    assert any("重複" in i for i in checks.run_all(d))


def test_docx_roundtrip():
    from docx import Document
    d = _draft()
    with tempfile.TemporaryDirectory() as tmp:
        files = build_docx.build_all(d, Path(tmp))
        assert [f.name for f in files] == [
            "exam_draft.docx", "answersheet_draft.docx", "modelanswer_draft.docx"]
        model = Document(str(files[2]))
        cells = [c.text for t in model.tables for r in t.rows for c in r.cells]
        assert "universal" in cells
        blank = Document(str(files[1]))
        cells = [c.text for t in blank.tables for r in t.rows for c in r.cells]
        assert "universal" not in cells  # 解答用紙に答えが漏れていない


def _vocab_draft():
    """英単語テストの形（通し番号・【1】見出し・選択肢・並び替えの番号・個別配点）。"""
    return {
        "exam": {"title": "英単語試験", "written_points": 6, "numbering": "global", "heading": "bracket",
                 "date": "2026.9.1（火）実施", "end_note": "問題は以上です。よく見直しましょう。"},
        "sections": [
            {"no": 1, "type": "listen_meaning", "points_each": 1, "count": 2, "choice_style": "1", "questions": [
                {"number": 1, "body": "", "script": "haven", "choices": ["植民地", "議会", "避難所", "国籍"], "correct": 2,
                 "answer": "3", "source_ref": "単語集 No.1", "alt_answer_risk": "自動"},
                {"number": 2, "body": "", "script": "colony", "choices": ["植民地", "議会", "避難所", "国籍"], "correct": 0,
                 "answer": "1", "source_ref": "単語集 No.2", "alt_answer_risk": "自動"}]},
            {"no": 2, "type": "reorder_2nd_5th", "points_each": 2, "count": 1, "questions": [
                {"number": 1, "body": "［ 1. ask　2. my　3. brother ］", "answer": "3 / 1", "answer_slots": ["3", "1"],
                 "slot_labels": ["2番目", "5番目"], "kind": "reorder_2nd_5th", "source_ref": "L2", "alt_answer_risk": "x",
                 "reorder": {"line": True, "n": 6, "pos": [2, 5], "before": "I will", "after": "my homework."}}]},
            {"no": 3, "type": "vocab_spelling", "points_each": 1, "count": 1, "questions": [
                {"number": 1, "body": "私たちはついに頂上に着いた。\nWe （ f　　　 ） reached the top.", "answer": "finally",
                 "source_ref": "単語集 No.27", "alt_answer_risk": "頭文字", "points": 2}]},
        ],
    }


def test_layout_numbering():
    from exam_app import layout
    d = _vocab_draft()
    plan = layout.numbering(d)
    assert [n["label"] for n in plan[0]] == ["1.", "2."]
    assert plan[1][0]["label"] == "(1)" and plan[1][0]["slots"] == ["3", "4"]  # 並び替えは箇所ごとに通し番号
    assert plan[2][0]["cell"] == "5"
    assert layout.reorder_line(d["sections"][1]["questions"][0], ["3", "4"]) == \
        "I will (　　) ( 3 ) (　　) (　　) ( 4 ) (　　) my homework."
    assert layout.per_row(d["sections"][0]) == 5 and layout.per_row(d["sections"][1]) == 2
    assert layout.heading(d["exam"], d["sections"][0]).endswith("（各1点）")
    assert layout.points_label(d["sections"][2], ["5"]) == "【2点×1】"
    sec = {"points_each": 1, "questions": [{}, {}, {"points": 2}]}
    assert layout.points_label(sec, ["7", "8", "9"]) == "【1点×2・9のみ2点】"
    assert layout.planned_points(d["sections"][2]) == 2
    d["exam"]["numbering"] = "section"
    assert layout.numbering(d)[2][0]["label"] == "(1)"


def test_vocab_docx():
    from docx import Document
    d = _vocab_draft()
    assert checks.run_all(d) == [], checks.run_all(d)
    with tempfile.TemporaryDirectory() as tmp:
        files = build_docx.build_all(d, Path(tmp))
        exam = Document(str(files[0]))
        text = "\n".join(p.text for p in exam.paragraphs)
        cells = [c.text for t in exam.tables for r in t.rows for c in r.cells]
        assert "【1】" in text and "よく見直しましょう" in text
        assert any("2026.9.1" in c for c in [c.text for t in exam.tables for r in t.rows for c in r.cells])  # 実施日は試験名の枠の中
        assert "3. 避難所" in cells and "1." in cells                     # 選択肢の表・通し番号
        assert "I will (　　) ( 3 )" in text                              # 解答位置の行
        model = Document(str(files[2]))
        mtext = "\n".join(p.text for p in model.paragraphs)
        assert "放送文" in mtext and "haven" in mtext                     # 放送文は模範解答にだけ
        assert "haven" not in text


def test_big_question_groups():
    """大問＝本文＋設問（問1・問2…）。見出し・本文・問番号・呼び名。"""
    from docx import Document
    from exam_app import layout
    q = lambda b, a: {"number": 1, "body": b, "answer": a, "source_ref": "L5 Part1", "alt_answer_risk": "x"}
    d = {"exam": {"title": "T", "written_points": 7}, "sections": [
        {"type": "fill_blank", "points_each": 1, "count": 1, "questions": [q("He ( ) it.", "did")]},
        {"type": "fill_blank", "points_each": 2, "count": 1, "big_title": "次の英文を読んで、後の問いに答えなさい。",
         "passage": "Tokito had a __dream__.", "questions": [q("（ 1 ）に入る語", "dream")]},
        {"type": "translation", "points_each": 4, "count": 1, "new_big": False, "instructions": "下線部を和訳しなさい。",
         "questions": [q("下線部(A)", "夢")]}]}
    assert checks.run_all(d) == [], checks.run_all(d)       # 同じ本文の設問は出典が同じでも警告しない
    assert [s["label"] for s in d["sections"]] == ["大問1", "大問2 問1", "大問2 問2"]
    assert layout.groups(d["sections"]) == [[0], [1, 2]]
    with tempfile.TemporaryDirectory() as tmp:
        files = build_docx.build_all(d, Path(tmp))
        text = "\n".join(p.text for p in Document(str(files[0])).paragraphs)
        assert "２　次の英文を読んで、後の問いに答えなさい。（6点）" in text and "問2　下線部を和訳しなさい。（4点）" in text
        cells = [c.text for tb in Document(str(files[0])).tables for r in tb.rows for c in r.cells]
        assert any("Tokito had a dream." in c for c in cells)   # 本文は枠（表）の中
        sheet = "\n".join(p.text for p in Document(str(files[1])).paragraphs)
        assert "問1　【2点×1】" in sheet


def test_choice_answer_checks():
    """正解の選択肢と解答の記号のずれ・語群の問題の記号のずれを見つける（模範解答の誤り防止）。"""
    d = _draft(written_points=2)
    d["sections"] = [{"no": 1, "type": "choice_4", "points_each": 1, "count": 2, "choice_style": "ア", "bank": ["x", "y", "z"],
                      "questions": [
                          {"number": 1, "body": "Q", "choices": ["a", "b"], "correct": 1, "answer": "ア", "source_ref": "s", "alt_answer_risk": "x"},
                          {"number": 2, "body": "def", "bank_idx": 2, "answer": "イ", "source_ref": "s", "alt_answer_risk": "x"}]}]
    issues = checks.run_all(d)
    assert any("正解の選択肢（イ）" in i for i in issues), issues
    assert any("語群の正解（ウ）" in i for i in issues), issues
    d["sections"][0]["questions"][0].pop("correct")
    assert any("正解の選択肢が選ばれていない" in i for i in checks.run_all(d))


def test_extract_three_layers():
    folder = Path(__file__).resolve().parents[2] / "materials"
    if not folder.is_dir():  # 配布用ZIPには試験の実物（materials/）を入れていない
        print("SKIP test_extract_three_layers（materials/ なし）")
        return
    docs = extract.scan_folder(folder)
    assert docs, "materials/ が空"
    text = docs["exam_comm2_master"]["text"]
    assert "TABLE" in text or len(text) > 1000


def main():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\n{len(fns)}件すべて合格")


if __name__ == "__main__":
    main()
