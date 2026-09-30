"""定期考査スタジオ（Web UI）サーバーのテスト。API・AI不使用。
実行: python -m exam_app.tests.test_ui_server
"""
import base64
import json
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from exam_app.ui import server  # noqa: E402

BASE = ""


def call(method, path, body=None, headers=None, raw=False):
    h = {"Content-Type": "application/json", "X-Exam-Studio": "1"}
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req) as r:
            payload = r.read()
            return r.status, (payload if raw else json.loads(payload))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def test_all():
    global BASE
    tmp = Path(tempfile.mkdtemp())
    httpd = server.make_server(0, tmp / "ws")
    BASE = f"http://127.0.0.1:{httpd.server_address[1]}"
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        # 画面が配信される
        st, html = call("GET", "/", raw=True)
        assert st == 200 and "定期考査スタジオ" in html.decode()

        # 他サイトからの書き込み（独自ヘッダーなし）は拒否
        st, r = call("POST", "/api/projects", {"title": "x"}, headers={"X-Exam-Studio": ""})
        assert st == 403, r
        # ホスト名偽装（DNSリバインディング）は拒否
        st, r = call("GET", "/api/status", headers={"Host": "evil.example"})
        assert st == 403, r

        # 作成（大問番号はサーバーで振り直される）
        st, r = call("POST", "/api/projects", {"title": "テスト試験", "written_points": 3,
                                               "sections": [{"no": 9, "type": "fill_blank", "points_each": 1, "count": 1}]})
        assert st == 200
        pid = r["project"]["id"]
        assert r["project"]["sections"][0]["no"] == 1

        # 教材: Shift_JIS（Windowsメモ帳）のテキストも読める
        sjis = "Hope for peace is universal.\n平和への願い".encode("cp932")
        st, r = call("POST", f"/api/projects/{pid}/materials",
                     {"name": "L4.txt", "data": base64.b64encode(sjis).decode()})
        assert st == 200 and "平和" in r["text"], r
        mid = r["material"]["id"]
        st, r = call("GET", f"/api/projects/{pid}/materials/{mid}")
        assert r["text"].startswith("Hope")
        # PDFは案内付きで拒否
        st, r = call("POST", f"/api/projects/{pid}/materials", {"name": "a.pdf", "data": ""})
        assert st == 400 and "貼り付け" in r["error"]

        # 保存 → チェック
        sections = [{"type": "fill_blank", "points_each": 1, "count": 2, "questions": [
            {"body": "平和への願いは万国共通です。\nHope for peace is （ u　　　 ）.", "answer": "universal",
             "answer_slots": ["universal"], "source_ref": "L4 Part4①(6)", "alt_answer_risk": "頭文字ヒント"},
            {"body": "I （　）（　）（　） it.", "answer": "must have left", "source_ref": "",
             "alt_answer_risk": ""}]}]
        st, r = call("PUT", f"/api/projects/{pid}", {"exam": {"title": "テスト試験", "written_points": 3},
                                                    "sections": sections})
        assert st == 200
        st, r = call("POST", f"/api/projects/{pid}/check", {})
        issues = "\n".join(r["issues"])
        assert "出典なし" in issues, issues
        assert "空所3個に対し解答枠1個" in issues, issues  # 1枠1語の検出
        assert "配点" in issues

        # 出力: Word 3点 + 出典一覧 + データ
        st, r = call("POST", f"/api/projects/{pid}/export", {})
        assert st == 200 and len(r["files"]) == 5, r
        name = [f for f in r["files"] if f.endswith("模範解答.docx")][0]
        st, data = call("GET", f"/api/projects/{pid}/files/{urllib.request.quote(name)}", raw=True)
        assert st == 200 and data[:2] == b"PK"
        # パストラバーサルは拒否
        st, r = call("GET", f"/api/projects/{pid}/files/..%2Fproject.json")
        assert st == 404, r
        st, r = call("GET", "/api/projects/../../etc")
        assert st == 404

        # 複製・取り込み・削除（ゴミ箱へ）
        st, r = call("POST", f"/api/projects/{pid}/duplicate", {})
        assert st == 200 and r["project"]["title"].endswith("（コピー）")
        st, r = call("POST", "/api/projects/import", {"data": {"exam": {"title": "取込"}, "sections": sections}})
        assert st == 200 and r["project"]["sections"][0]["questions"][1]["number"] == 2
        st, r = call("DELETE", f"/api/projects/{pid}")
        assert st == 200 and any((tmp / "ws" / ".trash").iterdir())
        st, r = call("GET", "/api/projects")
        assert len(r["projects"]) == 2

        # API抜きの作問依頼文
        st, r = call("POST", "/api/prompt", {"text": "She is the girl.", "format": "reorder_2nd_5th"})
        assert "一語も改変しないこと" in r["prompt"]
        # AI未設定なら案内付きで断る
        st, r = call("POST", "/api/ai/ask", {"text": "x"})
        assert st == 400 and "AI機能は使えません" in r["error"]


        # カテゴリー（自分で編集）
        st, r = call("GET", "/api/config")
        assert "英単語テスト" in r["categories"]
        st, r = call("PUT", "/api/config", {"categories": ["定期考査", "英単語テスト", "実力テスト"]})
        assert r["categories"][-1] == "実力テスト"
        st, r = call("PUT", "/api/config", {"categories": []})
        assert st == 400

        # テンプレート（作成・編集・削除。問題は含めない）
        tpl = {"name": "英単語テスト型（自作）", "category": "英単語テスト",
               "exam": {"written_points": 100, "numbering": "global", "heading": "bracket"},
               "sections": [{"type": "vocab_meaning", "count": 20, "points_each": 1, "questions": [{"body": "x"}]}]}
        st, r = call("POST", "/api/templates", {"template": tpl})
        tid = r["template"]["id"]
        assert st == 200 and "questions" not in r["template"]["sections"][0]
        assert r["template"]["exam"]["numbering"] == "global"
        st, r = call("PUT", f"/api/templates/{tid}", {"template": {**tpl, "name": "改名"}})
        assert r["template"]["name"] == "改名"
        st, r = call("GET", "/api/templates")
        assert [t["name"] for t in r["templates"]] == ["改名"]
        st, r = call("POST", "/api/templates", {"template": {"name": ""}})
        assert st == 400

        # 新しい項目（通し番号・表紙・選択肢・個別配点）が保存される
        st, r = call("POST", "/api/projects", {"title": "単語", "written_points": 2,
            "exam": {"category": "英単語テスト", "numbering": "global", "heading": "bracket",
                     "cover": {"enabled": True, "grade": "1学年"}},
            "sections": [{"type": "vocab_meaning", "points_each": 1, "count": 1, "choice_style": "1",
                          "bank": ["a", "b"], "questions": [{"body": "haven", "choices": ["植民地", "議会", "避難所", "国籍"],
                          "correct": 2, "answer": "3", "points": 2, "script": "haven", "source_ref": "L1",
                          "reorder": {"line": True, "n": 6, "pos": [2, 5], "before": "I", "after": "."}}]}]})
        p2 = r["project"]
        assert p2["exam"]["category"] == "英単語テスト" and p2["exam"]["cover"]["enabled"]
        q2 = p2["sections"][0]["questions"][0]
        assert q2["choices"][2] == "避難所" and q2["correct"] == 2 and q2["points"] == 2 and q2["reorder"]["pos"] == [2, 5]
        st, r = call("GET", "/api/projects")
        assert any(x["category"] == "英単語テスト" for x in r["projects"])
        assert p2["exam"]["end_note"] == "問題は以上です。"  # 最後の一言の既定値

        # カテゴリー名の変更は、既存の試験とテンプレートにも反映される
        st, r = call("PUT", "/api/config", {"categories": ["定期考査", "単語テスト", "実力テスト"],
                                            "rename": {"英単語テスト": "単語テスト"}})
        assert st == 200 and r["categories"][1] == "単語テスト"
        st, r = call("GET", "/api/projects")
        assert any(x["category"] == "単語テスト" for x in r["projects"])
        assert not any(x["category"] == "英単語テスト" for x in r["projects"])
        st, r = call("GET", "/api/templates")
        assert r["templates"][0]["category"] == "単語テスト"

        # バックアップ → 復元（同じIDは別の試験として追加）
        st, zipdata = call("GET", "/api/backup", raw=True)
        assert st == 200 and zipdata[:2] == b"PK"
        before = len(call("GET", "/api/projects")[1]["projects"])
        st, r = call("POST", "/api/restore", {"data": base64.b64encode(zipdata).decode()})
        assert st == 200 and r["added"] == before, r
        assert len(call("GET", "/api/projects")[1]["projects"]) == before * 2
        # 不正なZIP（../ を含む）は中身を無視する
        import io, zipfile
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("../evil.txt", "x")
        st, r = call("POST", "/api/restore", {"data": base64.b64encode(buf.getvalue()).decode()})
        assert st == 200 and r["added"] == 0 and not (tmp / "evil.txt").exists()

        # AIに注文（自然言語）・仮想の生徒・使用量（AIは偽物に差し替えて確認）
        from exam_app import generate
        from types import SimpleNamespace
        fake_usage = SimpleNamespace(input_tokens=1000, output_tokens=500)
        seen = {}

        def fake_order(order, passage, material, context=""):
            seen["order"], seen["passage"], seen["material"] = order, passage, material
            generate._track(generate.SONNET, fake_usage)
            return [{"kind": "content_match", "instructions": "一致するものを選べ", "body": "Which is true?", "choices": ["a", "b"],
                     "correct": 1, "answer": "b", "focus": "第1段落", "source_ref": "本文 第1段落", "alt_answer_risk": "x"},
                    {"kind": "synonym", "instructions": "", "body": "x", "choices": [], "correct": -1, "answer": "y",
                     "focus": "", "source_ref": "", "alt_answer_risk": ""}]

        def fake_student(items, level=""):
            seen["items"] = items
            generate._track(generate.HAIKU, fake_usage)
            return {"results": [{"id": items[0]["id"], "correct": False, "alternate_ok": True, "problem": "別解", "fix": "",
                                 "focus": "", "student_answer": "c", "confidence": "mid", "trouble": ""}],
                    "duplicates": [], "summary": "ok"}
        orig = (generate.provider_ready, generate.make_order, generate.virtual_student)
        generate.provider_ready, generate.make_order, generate.virtual_student = (lambda: True), fake_order, fake_student
        try:
            st, r = call("POST", "/api/projects", {"title": "長文", "sections": [
                {"type": "auto", "count": 1, "passage": "Tom likes dogs.", "big_title": "読んで答えよ",
                 "questions": [{"body": "Q1", "answer": "A1", "source_ref": "s"}]}]})
            lp = r["project"]["id"]
            call("POST", f"/api/projects/{lp}/materials", {"name": "L1", "text": "Tom likes dogs. He has two.",
                                                          "sid": r["project"]["sections"][0]["sid"]})
            st, r = call("POST", "/api/ai/order", {"pid": lp, "index": 0, "order": "内容一致を1問、同意語を1問"})
            assert st == 200 and len(r["questions"]) == 1 and r["dropped"] == 1, r   # 出典のない問題は破棄
            assert seen["passage"] == "Tom likes dogs." and "He has two." in seen["material"]
            st, r = call("POST", "/api/ai/order", {"pid": lp, "index": 0, "order": ""})
            assert st == 400
            st, r = call("POST", "/api/ai/student", {"pid": lp})
            assert st == 200 and r["report"]["results"][0]["alternate_ok"] and seen["items"][0]["id"] == "大問1(1)"
            assert seen["items"][0]["passage"] == "Tom likes dogs."
            st, r = call("POST", "/api/prompt/student", {"pid": lp})
            assert "模範解答: A1" in r["prompt"]
            st, r = call("POST", "/api/prompt/order", {"pid": lp, "index": 0, "order": "内容一致を2問"})
            assert "内容一致を2問" in r["prompt"] and "Tom likes dogs." in r["prompt"]
            st, u = call("GET", "/api/usage")
            assert u["month"]["calls"] == 2 and u["month"]["cost_usd"] > 0 and u["recent"][0]["task"]
        finally:
            generate.provider_ready, generate.make_order, generate.virtual_student = orig

        # ChatGPTに切り替え（キーはメモリのみ）→ 消去で元に戻る
        st, r = call("POST", "/api/settings", {"provider": "openai", "key": "sk-test", "model": "gpt-x"})
        assert r["status"]["provider"] == "openai" and r["status"]["ai"] and r["status"]["openai_model"] == "gpt-x"
        assert not list((tmp / "ws").rglob("*sk-test*"))
        st, r = call("POST", "/api/settings", {"provider": "openai", "key": "", "clear": True})
        assert not r["status"]["ai"]
        call("POST", "/api/settings", {"provider": "anthropic"})
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    test_all()
    print("PASS test_all（UIサーバー）")
