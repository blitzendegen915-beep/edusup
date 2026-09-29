"""ChatGPT（OpenAI）連携のテスト。本物のAPIは使わず、偽のOpenAIサーバーで検証する。
実行: python -m exam_app.tests.test_openai_mock
"""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from exam_app import generate  # noqa: E402

SEEN = []


class FakeOpenAI(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append((self.headers.get("Authorization"), body))
        schema = body["response_format"]["json_schema"]["schema"]
        if "questions" in schema["properties"]:
            content = {"questions": [{"number": 1, "body": "She（ will / girl ）the prize.", "answer": "the / I",
                                      "source_ref": "例文56", "alt_answer_risk": "なし"}]}
        else:
            content = {"has_alternate_answer": False, "explanation": "別解なし", "suggested_fix": ""}
        out = json.dumps({"choices": [{"message": {"content": json.dumps(content, ensure_ascii=False)}}],
                          "usage": {"prompt_tokens": 100, "completion_tokens": 20}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    srv = HTTPServer(("127.0.0.1", 0), FakeOpenAI)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    generate.OPENAI_URL = f"http://127.0.0.1:{srv.server_address[1]}/v1/chat/completions"
    os.environ.update(EXAM_AI_PROVIDER="openai", OPENAI_API_KEY="sk-test", OPENAI_MODEL="gpt-test")
    os.environ.pop("ANTHROPIC_API_KEY", None)
    os.environ["NO_PROXY"] = "*"
    try:
        assert generate.provider() == "openai" and generate.provider_ready()
        q = generate.make_pinpoint("She is the girl who I think will win the prize.", "reorder_2nd_5th")
        assert q["answer"] == "the / I", q
        v = generate.adversarial_verify(q, "reorder_2nd_5th")
        assert v["has_alternate_answer"] is False
        auth, body = SEEN[0]
        assert auth == "Bearer sk-test" and body["model"] == "gpt-test"
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["messages"][0]["role"] == "system"
        assert "ChatGPT使用量" in generate.cost_report()
        print("PASS test_openai_mock（ChatGPT連携）")
    finally:
        srv.shutdown()
        for k in ("EXAM_AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL"):
            os.environ.pop(k, None)


if __name__ == "__main__":
    main()
