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
