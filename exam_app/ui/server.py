"""定期考査スタジオ — ローカルWeb UI サーバー

起動:  python -m exam_app.ui                 （ブラウザが自動で開く）
      python -m exam_app.ui --port 9000 --no-browser

・127.0.0.1 でのみ待ち受ける（校内LANの他のPCからは見えない）
・必要なのは python-docx だけ。AI機能を使う場合のみ anthropic と APIキー
・データは ./exam_workspace/<プロジェクトID>/ に保存する。試験の実物を含むので
  生徒が閲覧できる共有フォルダには置かないこと
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import os
import re
import shutil
import sys
import threading
import time
import traceback
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from .. import build_docx, checks, extract

VERSION = "2.0"
STATIC_DIR = Path(__file__).resolve().parent / "static"
MAX_BODY = 40 * 1024 * 1024
PROJECT_ID = re.compile(r"^[0-9a-f]{12}$")
MATERIAL_ID = re.compile(r"^[0-9a-f]{8}$")
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}

WORKSPACE = Path("exam_workspace").resolve()
_lock = threading.RLock()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------------------------------------------------------------- 保存領域

def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _to_int(value, default=0, lo=0, hi=999) -> int:
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def _project_dir(pid: str) -> Path:
    if not PROJECT_ID.match(pid or ""):
        raise ApiError(404, "プロジェクトが見つかりません")
    d = WORKSPACE / pid
    if not (d / "project.json").is_file():
        raise ApiError(404, "プロジェクトが見つかりません")
    return d


def _load(pid: str) -> dict:
    return json.loads((_project_dir(pid) / "project.json").read_text(encoding="utf-8"))


def _write(p: dict) -> dict:
    d = WORKSPACE / p["id"]
    d.mkdir(parents=True, exist_ok=True)
    p["updated_at"] = _now()
    tmp = d / "project.json.tmp"
    tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, d / "project.json")  # 書き込み途中で落ちても壊れないように
    return p


def _clean_question(q: dict, number: int) -> dict:
    out = {k: str(q.get(k) or "") for k in
           ("body", "answer", "source_ref", "alt_answer_risk", "focus", "kind")}
    out["number"] = number
    for key in ("answer_slots", "slot_labels"):
        val = q.get(key)
        if isinstance(val, list) and any(str(x).strip() for x in val):
            out[key] = [str(x) for x in val]
    if isinstance(q.get("verdict"), dict):
        out["verdict"] = q["verdict"]
    return out


def _clean_sections(sections) -> list:
    """クライアントから来た大問を検証・正規化する。大問番号・小問番号は
    常に振り直す（番号ズレ事故の対策）。"""
    out = []
    for i, s in enumerate(sections or []):
        if not isinstance(s, dict):
            continue
        qs = [_clean_question(q, j + 1)
              for j, q in enumerate(q for q in (s.get("questions") or [])
                                    if isinstance(q, dict))]
        out.append({
            "no": i + 1,
            "type": str(s.get("type") or "other"),
            "points_each": _to_int(s.get("points_each"), 1),
            "count": _to_int(s.get("count"), len(qs)),
            "instructions": str(s.get("instructions") or ""),
            "source": str(s.get("source") or ""),
            "questions": qs,
        })
    return out


def _clean_exam(exam) -> dict:
    exam = exam if isinstance(exam, dict) else {}
    return {
        "title": str(exam.get("title") or "新しい定期考査")[:200],
        "written_points": _to_int(exam.get("written_points"), 80),
        "notes": str(exam.get("notes") or "")[:500],
    }


def _new_project(title="", written_points=80, sections=None) -> dict:
    return {
        "id": uuid.uuid4().hex[:12],
        "exam": _clean_exam({"title": title, "written_points": written_points}),
        "sections": _clean_sections(sections),
        "materials": [],
        "checklist": {},
        "created_at": _now(),
        "updated_at": _now(),
    }


def _summary(p: dict) -> dict:
    secs = p.get("sections", [])
    return {
        "id": p["id"],
        "title": p["exam"].get("title", ""),
        "updated_at": p.get("updated_at", ""),
        "sections": len(secs),
        "questions": sum(len(s.get("questions", [])) for s in secs),
        "count": sum(int(s.get("count", 0)) for s in secs),
        "points": sum(int(s.get("points_each", 0)) * int(s.get("count", 0)) for s in secs),
        "written_points": p["exam"].get("written_points"),
        "materials": len(p.get("materials", [])),
    }


def _as_draft(p: dict) -> dict:
    return {"exam": p["exam"], "sections": p["sections"]}


def _list_projects() -> list:
    items = []
    for d in WORKSPACE.iterdir() if WORKSPACE.exists() else []:
        f = d / "project.json"
        if d.is_dir() and PROJECT_ID.match(d.name) and f.is_file():
            try:
                items.append(_summary(json.loads(f.read_text(encoding="utf-8"))))
            except (OSError, ValueError, KeyError):
                continue  # 壊れたファイルは一覧から外す
    return sorted(items, key=lambda x: x["updated_at"], reverse=True)


# ---------------------------------------------------------------- 教材

def _decode_text(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp932", "utf-16"):  # Windowsのメモ帳(Shift_JIS)にも対応
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _add_material(pid: str, name: str, data_b64=None, text=None) -> dict:
    d = _project_dir(pid)
    mdir = d / "materials"
    mdir.mkdir(exist_ok=True)
    mid = uuid.uuid4().hex[:8]
    name = (Path(str(name or "")).name or "教材").strip()[:120]

    if text is not None:
        body = str(text)
    else:
        try:
            raw = base64.b64decode(data_b64 or "", validate=True)
        except (ValueError, TypeError):
            raise ApiError(400, "ファイルを読み込めませんでした")
        ext = Path(name).suffix.lower()
        if ext == ".docx":
            src = mdir / f"{mid}.docx"
            src.write_bytes(raw)
            try:
                body = extract.extract_docx(src)
            except Exception:
                src.unlink(missing_ok=True)
                raise ApiError(400, f"Wordファイルを読み取れませんでした: {name}")
        elif ext in (".txt", ".md"):
            body = _decode_text(raw)
        elif ext == ".pdf":
            raise ApiError(400, "PDFは直接読めません。本文をコピーして「テキストを貼り付け」で追加してください")
        elif ext == ".doc":
            raise ApiError(400, "古い .doc 形式は読めません。Wordで .docx 形式で保存し直してください")
        else:
            raise ApiError(400, f"対応していない形式です（.docx / .txt に対応）: {name}")
    if not body.strip():
        raise ApiError(400, "テキストが見つかりませんでした")

    (mdir / f"{mid}.txt").write_text(body, encoding="utf-8")
    meta = {"id": mid, "name": name, "chars": len(body), "added_at": _now()}
    with _lock:
        p = _load(pid)
        p.setdefault("materials", []).append(meta)
        _write(p)
    return {"material": meta, "text": body}


def _material_path(pid: str, mid: str) -> Path:
    if not MATERIAL_ID.match(mid or ""):
        raise ApiError(404, "教材が見つかりません")
    f = _project_dir(pid) / "materials" / f"{mid}.txt"
    if not f.is_file():
        raise ApiError(404, "教材が見つかりません")
    return f


def _material_items(p: dict, only_id: str = "") -> list:
    items = []
    for m in p.get("materials", []):
        if only_id and m["id"] != only_id:
            continue
        try:
            text = _material_path(p["id"], m["id"]).read_text(encoding="utf-8")
        except ApiError:
            continue
        items.append({"kind": "raw", "ref": m["name"], "text": text})
    return items


# ---------------------------------------------------------------- 出力

def _safe_filename(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\s]+', "_", s or "").strip("_.")
    return s[:60] or "exam"


def _sources_md(p: dict) -> str:
    lines = [f"# {p['exam']['title']}　出典一覧", "", f"作成: {_now()}", ""]
    for s in p["sections"]:
        lines += [f"## 大問{s['no']}（{s['points_each']}点×{len(s['questions'])}）", "",
                  "| 問 | 解答 | 出典 | 別解の検討 |", "|---|---|---|---|"]
        for q in s["questions"]:
            cells = [f"({q['number']})", q["answer"], q["source_ref"],
                     q.get("alt_answer_risk", "")]
            lines.append("| " + " | ".join(c.replace("|", "／").replace("\n", " ")
                                            for c in cells) + " |")
        lines.append("")
    return "\n".join(lines)


def _export(pid: str) -> dict:
    d = _project_dir(pid)
    p = _load(pid)
    draft = _as_draft(p)
    out = d / "exports"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    base = _safe_filename(p["exam"]["title"])
    names = []
    for f, label in zip(build_docx.build_all(draft, out), ("問題用紙", "解答用紙", "模範解答")):
        target = out / f"{base}_{label}.docx"
        f.rename(target)
        names.append(target.name)
    (out / f"{base}_出典一覧.md").write_text(_sources_md(p), encoding="utf-8")
    (out / f"{base}_データ.json").write_text(
        json.dumps(draft, ensure_ascii=False, indent=1), encoding="utf-8")
    names += [f"{base}_出典一覧.md", f"{base}_データ.json"]
    return {"files": names, "issues": checks.run_all(draft)}


def _export_file(pid: str, name: str) -> Path:
    out = (_project_dir(pid) / "exports").resolve()
    f = (out / name).resolve()
    if f.parent != out or not f.is_file():
        raise ApiError(404, "ファイルが見つかりません（もう一度「Wordファイルを作成」を押してください）")
    return f


# ---------------------------------------------------------------- AI（任意）

def _ai_status() -> dict:
    installed = importlib.util.find_spec("anthropic") is not None
    key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {"ai": installed and key, "anthropic_installed": installed, "key_set": key}


def _generate():
    if not _ai_status()["ai"]:
        raise ApiError(400, "AI機能は使えません（anthropic 未インストール、またはAPIキー未設定）。"
                            "クイック作問の手作業モード、または「作問依頼文」をご利用ください")
    from .. import generate
    return generate


def _prompt_text(text, fmt, focus, note, source) -> str:
    from ..generate import FORMAT_HINTS, RULES
    return f"""あなたは高校英語の定期考査の作問者です。次のルールを厳守して、1問だけ作ってください。

{RULES}

■ 対象文（一語も改変しないこと）
{text}

■ 出典: {source or '（教員が記入）'}
■ 形式: {fmt} — {FORMAT_HINTS.get(fmt, fmt)}
■ 問いたい点: {focus or '文の中心的な文法事項'}
■ 補足: {note or 'なし'}

■ 出力形式（説明は不要。次のJSONだけを返すこと）
{{"body": "生徒に見せる問題文（日本語訳を付ける場合は1行目、英文は2行目。改行は \\n）",
 "answer": "模範解答",
 "answer_slots": ["解答用紙の枠ごとの答え（1枠1語）"],
 "source_ref": "出典",
 "alt_answer_risk": "別解の検討結果と、潰すために行った工夫"}}
"""


# ---------------------------------------------------------------- ルーティング

def route(method: str, parts: list, body) -> object:
    n = len(parts)

    if parts == ["status"] and method == "GET":
        return {**_ai_status(), "version": VERSION, "workspace": str(WORKSPACE)}

    if parts == ["projects"]:
        if method == "GET":
            return {"projects": _list_projects()}
        if method == "POST":
            b = body()
            with _lock:
                p = _write(_new_project(b.get("title"), b.get("written_points", 80),
                                        b.get("sections")))
            return {"project": p}

    if parts == ["projects", "import"] and method == "POST":
        data = body().get("data")
        if not isinstance(data, dict) or not isinstance(data.get("sections"), list):
            raise ApiError(400, "試験データ（exam_draft.json / ○○_データ.json）ではありません")
        exam = data.get("exam") or {}
        with _lock:
            p = _write(_new_project(exam.get("title", "取り込んだ試験"),
                                    exam.get("written_points", 80), data["sections"]))
            p["exam"]["notes"] = str(exam.get("notes") or "")
            _write(p)
        return {"project": p}

    if n >= 2 and parts[0] == "projects":
        pid, rest = parts[1], parts[2:]
        if not rest:
            if method == "GET":
                return {"project": _load(pid)}
            if method == "PUT":
                b = body()
                with _lock:
                    p = _load(pid)
                    if "exam" in b:
                        p["exam"] = _clean_exam(b["exam"])
                    if "sections" in b:
                        p["sections"] = _clean_sections(b["sections"])
                    if isinstance(b.get("checklist"), dict):
                        p["checklist"] = {str(k): bool(v) for k, v in b["checklist"].items()}
                    _write(p)
                return {"project": {"id": p["id"], "updated_at": p["updated_at"]}}
            if method == "DELETE":
                d = _project_dir(pid)
                trash = WORKSPACE / ".trash"
                trash.mkdir(exist_ok=True)
                shutil.move(str(d), str(trash / f"{pid}_{time.strftime('%Y%m%d%H%M%S')}"))
                return {"ok": True}
        if rest == ["duplicate"] and method == "POST":
            src = _project_dir(pid)
            with _lock:
                p = _load(pid)
                p["id"] = uuid.uuid4().hex[:12]
                p["exam"]["title"] = p["exam"]["title"] + "（コピー）"
                p["created_at"] = _now()
                p["checklist"] = {}
                if (src / "materials").exists():
                    shutil.copytree(src / "materials", WORKSPACE / p["id"] / "materials")
                _write(p)
            return {"project": _summary(p)}
        if rest == ["materials"] and method == "POST":
            b = body()
            return _add_material(pid, b.get("name"), b.get("data"), b.get("text"))
        if len(rest) == 2 and rest[0] == "materials":
            f = _material_path(pid, rest[1])
            if method == "GET":
                return {"text": f.read_text(encoding="utf-8")}
            if method == "DELETE":
                with _lock:
                    p = _load(pid)
                    p["materials"] = [m for m in p["materials"] if m["id"] != rest[1]]
                    for s in p["sections"]:
                        if s.get("source") == rest[1]:
                            s["source"] = ""
                    _write(p)
                for g in f.parent.glob(f"{rest[1]}.*"):
                    g.unlink(missing_ok=True)
                return {"ok": True}
        if rest == ["check"] and method == "POST":
            b = body()
            if "sections" in b:  # 未保存の編集内容でもチェックできるように
                draft = {"exam": _clean_exam(b.get("exam")),
                         "sections": _clean_sections(b["sections"])}
            else:
                draft = _as_draft(_load(pid))
            return {"issues": checks.run_all(draft)}
        if rest == ["export"] and method == "POST":
            return _export(pid)
        if len(rest) == 2 and rest[0] == "files" and method == "GET":
            return ("file", _export_file(pid, rest[1]))

    if parts == ["prompt"] and method == "POST":
        b = body()
        return {"prompt": _prompt_text(b.get("text", ""), b.get("format", ""),
                                       b.get("focus", ""), b.get("note", ""),
                                       b.get("source", ""))}

    if parts == ["settings", "apikey"] and method == "POST":
        key = str(body().get("key") or "").strip()
        if key:
            os.environ["ANTHROPIC_API_KEY"] = key  # ファイルには保存しない
        else:
            os.environ.pop("ANTHROPIC_API_KEY", None)
        mod = sys.modules.get("exam_app.generate")
        if mod is not None:
            mod._client = None
        return {"status": _ai_status()}

    if n == 2 and parts[0] == "ai" and method == "POST":
        b = body()
        gen = _generate()
        if parts[1] == "ask":
            q = gen.make_pinpoint(b.get("text", ""), b.get("format", ""),
                                  b.get("focus", ""), b.get("note", ""))
            q["verdict"] = gen.adversarial_verify(q, b.get("format", ""))
            return {"question": q, "cost": gen.cost_report()}
        if parts[1] == "verify_one":
            q = b.get("question") or {}
            return {"verdict": gen.adversarial_verify(q, b.get("type", "")),
                    "cost": gen.cost_report()}
        if parts[1] == "section":
            p = _load(b.get("pid", ""))
            idx = _to_int(b.get("index"), -1, -1)
            if not 0 <= idx < len(p["sections"]):
                raise ApiError(400, "大問が見つかりません")
            sec = p["sections"][idx]
            items = _material_items(p, sec.get("source", "")) or _material_items(p)
            if not items:
                raise ApiError(400, "教材がありません。先に「教材」で教材を追加してください")
            res = gen.make_section(sec, items, p["exam"]["title"])
            kept = [q for q in res["questions"] if str(q.get("source_ref", "")).strip()]
            return {"questions": kept, "dropped": len(res["questions"]) - len(kept),
                    "cost": gen.cost_report()}

    raise ApiError(404, "見つかりません")


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = f"ExamStudio/{VERSION}"

    def log_message(self, fmt, *args):  # アクセスログは出さない
        pass

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _read_json(self) -> dict:
        size = int(self.headers.get("Content-Length") or 0)
        if size > MAX_BODY:
            raise ApiError(413, "ファイルが大きすぎます（30MBまで）")
        raw = self.rfile.read(size) if size else b""
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except ValueError:
            raise ApiError(400, "リクエストの形式が正しくありません")
        return data if isinstance(data, dict) else {}

    def _guard(self, method: str):
        # DNSリバインディング・他サイトからのリクエストを拒否する
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        if host not in ("127.0.0.1", "localhost"):
            raise ApiError(403, "このツールはこのPCのブラウザからのみ利用できます")
        if method != "GET" and self.headers.get("X-Exam-Studio") != "1":
            raise ApiError(403, "不正なリクエストです")

    def _send(self, status: int, data: bytes, ctype: str, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, status=200):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   CONTENT_TYPES[".json"])

    def _dispatch(self, method: str):
        path = urlparse(self.path).path
        try:
            self._guard(method)
            if path.startswith("/api/"):
                parts = [unquote(x) for x in path[5:].split("/") if x]
                result = route(method, parts, self._read_json)
                if isinstance(result, tuple) and result[0] == "file":
                    f = result[1]
                    self._send(200, f.read_bytes(),
                               CONTENT_TYPES.get(f.suffix, "application/octet-stream"),
                               {"Content-Disposition":
                                f"attachment; filename*=UTF-8''{quote(f.name)}"})
                else:
                    self._json(result)
            elif method == "GET":
                self._static(path)
            else:
                raise ApiError(404, "見つかりません")
        except ApiError as e:
            self._json({"error": e.message}, e.status)
        except SystemExit as e:  # generate.client_or_die() の案内メッセージ
            self._json({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001 — 画面にエラーを出して落ちないようにする
            traceback.print_exc()
            self._json({"error": f"内部エラー: {e}"}, 500)

    def _static(self, path: str):
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        f = (STATIC_DIR / rel).resolve()
        if STATIC_DIR not in f.parents or not f.is_file():
            raise ApiError(404, "見つかりません")
        self._send(200, f.read_bytes(),
                   CONTENT_TYPES.get(f.suffix, "application/octet-stream"))


def make_server(port: int, workspace: Path) -> ThreadingHTTPServer:
    global WORKSPACE
    WORKSPACE = workspace.resolve()
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m exam_app.ui",
                                 description="定期考査スタジオ（ローカルWeb UI）")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--workspace",
                    default=os.environ.get("EXAM_WORKSPACE", "exam_workspace"),
                    help="データの保存先フォルダ（既定: ./exam_workspace）")
    ap.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")
    args = ap.parse_args(argv)

    httpd = None
    for port in range(args.port, args.port + 10):  # 使用中なら次の番号を試す
        try:
            httpd = make_server(port, Path(args.workspace))
            break
        except OSError:
            continue
    if httpd is None:
        sys.exit(f"ポート {args.port}〜{args.port + 9} がすべて使用中です。--port で別の番号を指定してください")

    url = f"http://127.0.0.1:{httpd.server_address[1]}/"
    ai = "有効" if _ai_status()["ai"] else "オフ（API抜きモード）"
    print("=" * 56)
    print("  定期考査スタジオ を起動しました")
    print(f"  ブラウザで開く: {url}")
    print(f"  データ保存先  : {WORKSPACE}")
    print(f"  AI機能        : {ai}")
    print("  終了するには、この画面で Ctrl+C を押すか、ウィンドウを閉じてください")
    print("=" * 56)
    if not args.no_browser:
        threading.Timer(0.8, webbrowser.open, (url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n終了しました")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
