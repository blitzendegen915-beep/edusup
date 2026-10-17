"""Claude（Anthropic）連携のテスト。anthropic パッケージなし・偽のサーバーで検証する。
実行: python -m exam_app.tests.test_anthropic_mock
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


class FakeAnthropic(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN.append(({k.lower(): v for k, v in self.headers.items()}, body))
        content = {"has_alternate_answer": False, "explanation": "別解なし", "suggested_fix": ""}
        out = json.dumps({"content": [{"type": "thinking", "thinking": "..."},
                                      {"type": "text", "text": json.dumps(content, ensure_ascii=False)}],
                          "stop_reason": "end_turn", "usage": {"input_tokens": 1000, "output_tokens": 200}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    srv = HTTPServer(("127.0.0.1", 0), FakeAnthropic)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    generate.ANTHROPIC_URL = f"http://127.0.0.1:{srv.server_address[1]}/v1/messages"
    os.environ.pop("EXAM_AI_PROVIDER", None)
    os.environ.update(ANTHROPIC_API_KEY="sk-ant-test", NO_PROXY="*")
    try:
        assert generate.provider() == "anthropic" and generate.provider_ready()  # パッケージなしでも使える
        v = generate.adversarial_verify({"body": "x", "answer": "y"}, "fill_blank")
        assert v["has_alternate_answer"] is False
        headers, body = SEEN[0]
        assert headers.get("x-api-key") == "sk-ant-test" and headers.get("anthropic-version")
        assert body["model"] == generate.SONNET and body["output_config"]["format"]["type"] == "json_schema"
        assert generate.usage_log[-1]["cost_usd"] > 0
        print("PASS test_anthropic_mock（Claude連携・パッケージ不要）")
    finally:
        srv.shutdown()


if __name__ == "__main__":
    main()
