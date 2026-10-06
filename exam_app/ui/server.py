"""定期考査スタジオ — ローカルWeb UI サーバー

起動:  python -m exam_app.ui                 （ブラウザが自動で開く）
      python -m exam_app.ui --port 9000 --no-browser

・127.0.0.1 でのみ待ち受ける（校内LANの他のPCからは見えない）
・必要なのは python-docx だけ。AI機能を使う場合のみ anthropic と APIキー
・データは起動した人のPCの「ドキュメント/ExamStudio」に保存する（--workspace で変更可）。
  試験の実物を含むので、生徒が閲覧できる場所には置かないこと
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import io
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
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from .. import build_docx, checks, extract, layout

VERSION = "2.0"
STATIC_DIR = Path(__file__).resolve().parent / "static"
MAX_BODY = 200 * 1024 * 1024  # バックアップの復元に備えて大きめ
PROJECT_ID = re.compile(r"^[0-9a-f]{12}$")
MATERIAL_ID = re.compile(r"^[0-9a-f]{8}$")
CHOICE_STYLES = ("1", "ア", "①", "a")
DEFAULT_CATEGORIES = ["定期考査", "英単語テスト", "小テスト", "その他"]
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


HISTORY_KEEP = 40          # 残す版の数
HISTORY_GAP = 120          # 前の版から何秒たったら新しい版を残すか
HISTORY_NAME = re.compile(r"^\d{8}-\d{6}\.json$")


def _snapshot(d: Path, force: bool = False):
    """保存の直前の内容を history/ に残す（自動保存のたびではなく、2分おき）。"""
    cur = d / "project.json"
    if not cur.is_file():
        return
    h = d / "history"
    h.mkdir(exist_ok=True)
    olds = sorted(x for x in h.iterdir() if HISTORY_NAME.match(x.name))
    if olds and not force and time.time() - olds[-1].stat().st_mtime < HISTORY_GAP:
        return
    name = time.strftime("%Y%m%d-%H%M%S") + ".json"
    shutil.copyfile(cur, h / name)
    for x in sorted(x for x in h.iterdir() if HISTORY_NAME.match(x.name))[:-HISTORY_KEEP]:
        x.unlink(missing_ok=True)


def _history(pid: str) -> list:
    h = _project_dir(pid) / "history"
    items = []
    for f in sorted((x for x in h.iterdir() if HISTORY_NAME.match(x.name)), reverse=True) if h.is_dir() else []:
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        secs = p.get("sections", [])
        items.append({"name": f.name, "at": f"{f.name[:4]}-{f.name[4:6]}-{f.name[6:8]} {f.name[9:11]}:{f.name[11:13]}",
                      "questions": sum(len(s.get("questions", [])) for s in secs), "sections": len(secs),
                      "title": p.get("exam", {}).get("title", "")})
    return items


def _variant(draft: dict, seed: str) -> dict:
    """B版: 選択肢の順番を入れ替えた版（問題・本文はそのまま、正解の記号だけ変わる）。"""
    import random
    rnd = random.Random(seed)
    v = json.loads(json.dumps(draft))
    v["exam"]["title"] = v["exam"].get("title", "") + "（B）"
    for s in v["sections"]:
        style = s.get("choice_style") or "1"
        for q in s.get("questions", []):
            ch, c = q.get("choices"), q.get("correct")
            if not ch or not isinstance(c, int) or not 0 <= c < len(ch) or len(ch) < 2:
                continue
            order = list(range(len(ch)))
            for _ in range(8):
                rnd.shuffle(order)
                if order.index(c) != c:
                    break
            q["choices"] = [ch[k] for k in order]
            q["correct"] = order.index(c)
            q["answer"] = layout.mark(style, q["correct"])
            q["answer_slots"] = [q["answer"]]
    return v


def _write(p: dict) -> dict:
    d = WORKSPACE / p["id"]
    d.mkdir(parents=True, exist_ok=True)
    _snapshot(d)
    p["updated_at"] = _now()
    tmp = d / "project.json.tmp"
    tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, d / "project.json")  # 書き込み途中で落ちても壊れないように
    return p


def _str_list(val, limit=40) -> list:
    return [str(x)[:300] for x in val[:limit]] if isinstance(val, list) else []


def _clean_question(q: dict, number: int) -> dict:
    out = {k: str(q.get(k) or "") for k in
           ("body", "answer", "source_ref", "alt_answer_risk", "focus", "kind", "script")}
    out["number"] = number
    for key in ("answer_slots", "slot_labels"):
        val = q.get(key)
        if isinstance(val, list) and any(str(x).strip() for x in val):
            out[key] = [str(x) for x in val]
    choices = _str_list(q.get("choices"), 12)
    if choices:
        out["choices"] = choices
        if isinstance(q.get("correct"), int):
            out["correct"] = q["correct"]
    if q.get("points") not in (None, "") and str(q.get("points")).isdigit():
        out["points"] = _to_int(q["points"], 1)  # この問だけ配点を変える（例: 9のみ2点）
    r = q.get("reorder")
    if isinstance(r, dict):
        out["reorder"] = {"line": bool(r.get("line")), "n": _to_int(r.get("n"), 0),
                          "pos": [_to_int(x, 0) for x in (r.get("pos") or [])][:4],
                          "before": str(r.get("before") or "")[:300], "after": str(r.get("after") or "")[:300]}
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
        sid = str(s.get("sid") or "")
        if not MATERIAL_ID.match(sid):
            sid = uuid.uuid4().hex[:8]  # 大問の固定ID（並べ替えても素材との対応が崩れない）
        out.append({
            "sid": sid,
            "no": i + 1,
            "type": str(s.get("type") or "other"),
            "points_each": _to_int(s.get("points_each"), 1),
            "count": _to_int(s.get("count"), len(qs)),
            "instructions": str(s.get("instructions") or ""),
            "source": str(s.get("source") or ""),
            "scoring_note": str(s.get("scoring_note") or "")[:500],
            "per_row": _to_int(s.get("per_row"), 0, 0, 10),
            "choice_style": s.get("choice_style") if s.get("choice_style") in CHOICE_STYLES else "1",
            "bank": [b for b in _str_list(s.get("bank"), 30) if b.strip()],
            "bank_style": s.get("bank_style") if s.get("bank_style") in CHOICE_STYLES else "",
            # 大問のまとまり: new_big=False は直前の大問の続きの設問（同じ本文の問2・問3…）
            "new_big": i == 0 or s.get("new_big") is not False,
            "big_title": str(s.get("big_title") or "")[:500],
            "passage": str(s.get("passage") or "")[:30000],
            "passage_src": str(s.get("passage_src") or "")[:200],
            "order": str(s.get("order") or "")[:2000],  # 大問の「作りたい問題」（自然言語の注文）
            "questions": qs,
        })
    layout.apply_labels(out)
    return out


def _clean_cover(c) -> dict:
    c = c if isinstance(c, dict) else {}
    return {"enabled": bool(c.get("enabled")),
            **{k: str(c.get(k) or "")[:120] for k in ("grade", "subject", "name")},
            "cautions": str(c.get("cautions") or "")[:3000]}


def _clean_exam(exam) -> dict:
    exam = exam if isinstance(exam, dict) else {}
    return {
        "title": str(exam.get("title") or "新しい定期考査")[:200],
        "written_points": _to_int(exam.get("written_points"), 80),
        "notes": str(exam.get("notes") or "")[:500],
        "category": str(exam.get("category") or "定期考査")[:30],
        "date": str(exam.get("date") or "")[:60],
        "numbering": "global" if exam.get("numbering") == "global" else "section",
        "heading": "bracket" if exam.get("heading") == "bracket" else "number",
        "sheet_fields": str(exam.get("sheet_fields") or "組,番,氏名,得点")[:100],
        "cover": _clean_cover(exam.get("cover")),
        "end_note": str(exam.get("end_note") or "問題は以上です。")[:200],
    }


def _new_project(title="", written_points=80, sections=None, exam=None) -> dict:
    return {
        "id": uuid.uuid4().hex[:12],
        "exam": _clean_exam({**(exam or {}), "title": title, "written_points": written_points}),
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
        "points": sum(layout.planned_points(s) for s in secs),
        "written_points": p["exam"].get("written_points"),
        "category": p["exam"].get("category") or "定期考査",
        "date": p["exam"].get("date", ""),
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


def _add_material(pid: str, name: str, data_b64=None, text=None, sid: str = "") -> dict:
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
    if MATERIAL_ID.match(sid or ""):
        meta["sid"] = sid  # どの大問の素材か
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


def _material_items(p: dict, only_id: str = "", sid: str = "") -> list:
    items = []
    for m in p.get("materials", []):
        if only_id and m["id"] != only_id:
            continue
        if sid and m.get("sid") != sid:
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
        lines += [f"## {s.get('label') or '大問' + str(s['no'])}（{s['points_each']}点×{len(s['questions'])}）", "",
                  *([f"本文の出典: {s['passage_src']}", ""] if s.get("passage_src") else []),
                  "| 問 | 解答 | 出典 | 別解の検討 |", "|---|---|---|---|"]
        for q in s["questions"]:
            cells = [f"({q['number']})", q["answer"], q["source_ref"],
                     q.get("alt_answer_risk", "")]
            lines.append("| " + " | ".join(c.replace("|", "／").replace("\n", " ")
                                            for c in cells) + " |")
        lines.append("")
    return "\n".join(lines)


def _export(pid: str, variant: bool = False) -> dict:
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
    if variant:  # 選択肢を並べ替えたB版も作る（解答用紙は共通なので問題用紙と模範解答だけ）
        tmp = out / "_b"
        tmp.mkdir()
        files = build_docx.build_all(_variant(draft, p["id"]), tmp)
        for f, label in ((files[0], "問題用紙_B版"), (files[2], "模範解答_B版")):
            target = out / f"{base}_{label}.docx"
            f.rename(target)
            names.append(target.name)
        shutil.rmtree(tmp)
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
    from .. import generate
    prov = generate.provider()
    return {
        "ai": generate.provider_ready(),
        "provider": prov,
        "anthropic_installed": True,  # 追加パッケージ不要になった（画面の互換のため残す）
        "anthropic_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "openai_key_set": bool(os.environ.get("OPENAI_API_KEY")),
        "openai_model": os.environ.get("OPENAI_MODEL") or generate.OPENAI_DEFAULT_MODEL,
        "key_set": bool(os.environ.get("OPENAI_API_KEY" if prov == "openai" else "ANTHROPIC_API_KEY")),
    }


def _generate():
    if not _ai_status()["ai"]:
        raise ApiError(400, "AI機能は使えません（APIキー未設定）。左下の設定からClaudeまたはChatGPTのキーを入れるか、"
                            "クイック作問の手作業モード・「作問依頼文」をご利用ください")
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


def _group_of(p: dict, idx: int) -> list:
    """設問 idx を含む大問の設問の添字。"""
    for g in layout.groups(p["sections"]):
        if idx in g:
            return g
    raise ApiError(400, "大問が見つかりません")


def _order_context(p: dict, idx: int):
    """注文作問に渡す本文・教材（大問の素材）。"""
    g = _group_of(p, idx)
    head = p["sections"][g[0]]
    sids = {p["sections"][i].get("sid") for i in g}
    mats = [m for m in p.get("materials", []) if not m.get("sid") or m.get("sid") in sids]
    material = "\n\n".join(f"【{it['ref']}】\n{it['text']}" for m in mats for it in _material_items(p, only_id=m["id"]))
    return head.get("passage", ""), material


def _student_items(p: dict, scope: int = -1) -> list:
    """仮想の生徒に渡す試験（id = 「大問2 問1(3)」）。scope>=0 ならその大問だけ。"""
    items = []
    groups = layout.groups(p["sections"])
    for g in groups:
        if scope >= 0 and scope not in g:
            continue
        head = p["sections"][g[0]]
        first = True
        for i in g:
            s = p["sections"][i]
            for q in s["questions"]:
                if not (q.get("body") or q.get("script") or q.get("choices")) or not q.get("answer"):
                    continue
                ch = q.get("choices") or []
                ans = q["answer"]
                if ch and isinstance(q.get("correct"), int) and 0 <= q["correct"] < len(ch):
                    ans = f"{ans}（{ch[q['correct']]}）"
                body = q.get("body") or (f"（放送文）{q.get('script')}" if q.get("script") else "")
                items.append({"id": f"{s['label']}({q['number']})", "group": f"大問{head['no']}",
                              "passage": head.get("passage", "") if first else "",
                              "instructions": s.get("instructions", ""), "body": body,
                              "choices": [f"{layout.mark(s.get('choice_style') or '1', k)} {c}" for k, c in enumerate(ch)],
                              "answer": ans})
                first = False
    return items


USAGE_FILE = "usage.json"


def _record_usage(start: int):
    """この呼び出しで増えたAI使用量を保存先の usage.json に追記する（月ごとの合計を出すため）。"""
    from .. import generate
    new = generate.usage_log[start:]
    if not new:
        return
    with _lock:
        log = _read_json_file(USAGE_FILE, [])
        for e in new:
            log.append({**e, "at": _now()})
        _write_json_file(USAGE_FILE, log[-5000:])


def _usage() -> dict:
    from .. import generate
    log = _read_json_file(USAGE_FILE, [])
    month = time.strftime("%Y-%m")
    this_month = [e for e in log if str(e.get("at", "")).startswith(month)]
    total = lambda es: round(sum(float(e.get("cost_usd", 0)) for e in es), 4)
    return {"session": {"cost_usd": round(generate.usage_total["cost_usd"], 4), "input": generate.usage_total["input"],
                        "output": generate.usage_total["output"], "calls": len(generate.usage_log)},
            "month": {"cost_usd": total(this_month), "calls": len(this_month), "label": month},
            "all": {"cost_usd": total(log), "calls": len(log)},
            "recent": list(reversed(log[-30:])),
            "note": "料金は公式料金表から計算した目安です（為替・キャッシュ割引は含みません）。正確な請求額は各社の管理画面で確認してください。"}


# ---------------------------------------------------------------- 設定・テンプレート・バックアップ

def _read_json_file(name: str, default):
    f = WORKSPACE / name
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else default
    except (OSError, ValueError):
        return default


def _write_json_file(name: str, data):
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    tmp = WORKSPACE / (name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, WORKSPACE / name)


def _config() -> dict:
    cfg = _read_json_file("settings.json", {})
    cats = [c for c in cfg.get("categories", []) if isinstance(c, str) and c.strip()]
    return {"categories": cats or list(DEFAULT_CATEGORIES)}


def _rename_categories(rename) -> int:
    """カテゴリー名の変更を、既存の試験とテンプレートにも反映する。{旧名: 新名}"""
    if not isinstance(rename, dict):
        return 0
    table = {str(k): str(v).strip()[:30] for k, v in rename.items() if str(v).strip() and str(k) != str(v)}
    if not table:
        return 0
    changed = 0
    for d in WORKSPACE.iterdir() if WORKSPACE.exists() else []:
        f = d / "project.json"
        if not (d.is_dir() and PROJECT_ID.match(d.name) and f.is_file()):
            continue
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        cat = p.get("exam", {}).get("category") or "定期考査"
        if cat in table:
            p["exam"]["category"] = table[cat]
            f.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
            changed += 1
    items = _templates()
    for t in items:
        if t.get("category") in table:
            t["category"] = table[t["category"]]
            t.setdefault("exam", {})["category"] = t["category"]
            changed += 1
    if items:
        _write_json_file("templates.json", items)
    return changed


def _clean_template(t: dict, tid: str = "") -> dict:
    """ユーザーテンプレート（試験の構成だけ。問題そのものは含めない）。"""
    if not isinstance(t, dict):
        raise ApiError(400, "テンプレートの形式が正しくありません")
    name = str(t.get("name") or "").strip()[:60]
    if not name:
        raise ApiError(400, "テンプレートの名前を入力してください")
    exam = _clean_exam(t.get("exam"))
    secs = []
    for s in _clean_sections(t.get("sections")):
        s.pop("questions", None)
        s.pop("source", None)
        s.pop("passage", None)  # 本文は試験ごとに違うのでテンプレートには残さない
        secs.append(s)
    return {"id": tid if MATERIAL_ID.match(tid or "") else uuid.uuid4().hex[:8], "name": name,
            "category": str(t.get("category") or exam["category"])[:30], "desc": str(t.get("desc") or "")[:200],
            "exam": {k: exam[k] for k in ("written_points", "numbering", "heading", "sheet_fields", "cover",
                                          "category", "end_note")},
            "sections": secs, "updated_at": _now()}


def _templates() -> list:
    items = _read_json_file("templates.json", [])
    return [t for t in items if isinstance(t, dict) and MATERIAL_ID.match(str(t.get("id", "")))]


BACKUP_FILE = re.compile(r"^([0-9a-f]{12})/(project\.json|materials/[0-9a-f]{8}\.(txt|docx))$")


def _backup_zip() -> bytes:
    """全試験・テンプレート・設定をZIPにまとめる（PCの引っ越し・保存用）。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in ("templates.json", "settings.json"):
            if (WORKSPACE / name).is_file():
                z.write(WORKSPACE / name, name)
        for d in sorted(WORKSPACE.iterdir()) if WORKSPACE.exists() else []:
            if not (d.is_dir() and PROJECT_ID.match(d.name) and (d / "project.json").is_file()):
                continue
            z.write(d / "project.json", f"{d.name}/project.json")
            for f in sorted((d / "materials").glob("*")) if (d / "materials").is_dir() else []:
                rel = f"{d.name}/materials/{f.name}"
                if BACKUP_FILE.match(rel):
                    z.write(f, rel)
    return buf.getvalue()


def _restore_zip(data_b64: str) -> dict:
    """バックアップZIPを読み込む。既存の試験は上書きせず、同じIDがあれば別の試験として追加する。"""
    try:
        z = zipfile.ZipFile(io.BytesIO(base64.b64decode(data_b64 or "", validate=True)))
    except (ValueError, zipfile.BadZipFile):
        raise ApiError(400, "バックアップファイル（.zip）を読み込めませんでした")
    added, remap = 0, {}
    with z, _lock:
        names = z.namelist()
        for name in names:
            m = BACKUP_FILE.match(name)
            if not m:
                continue  # 想定外のファイル（../ など）は無視する
            old = m.group(1)
            if old not in remap:
                new = old if not (WORKSPACE / old).exists() else uuid.uuid4().hex[:12]
                remap[old] = new
            target = WORKSPACE / remap[old] / m.group(2)
            target.parent.mkdir(parents=True, exist_ok=True)
            data = z.read(name)
            if m.group(2) == "project.json":
                p = json.loads(data.decode("utf-8"))
                p["id"] = remap[old]
                data = json.dumps(p, ensure_ascii=False, indent=1).encode("utf-8")
                added += 1
            target.write_bytes(data)
        if "templates.json" in names:
            mine = {t["id"]: t for t in _templates()}
            for t in json.loads(z.read("templates.json").decode("utf-8")):
                if isinstance(t, dict) and t.get("id") not in mine:
                    try:
                        mine[t["id"]] = _clean_template(t, t.get("id", ""))
                    except (ApiError, KeyError):
                        pass
            _write_json_file("templates.json", list(mine.values()))
        if "settings.json" in names:
            cats = _config()["categories"]
            for c in json.loads(z.read("settings.json").decode("utf-8")).get("categories", []):
                if isinstance(c, str) and c.strip() and c not in cats:
                    cats.append(c)
            _write_json_file("settings.json", {"categories": cats})
    return {"added": added}


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
                                        b.get("sections"), b.get("exam")))
            return {"project": p}

    if parts == ["projects", "import"] and method == "POST":
        data = body().get("data")
        if not isinstance(data, dict) or not isinstance(data.get("sections"), list):
            raise ApiError(400, "試験データ（exam_draft.json / ○○_データ.json）ではありません")
        exam = data.get("exam") or {}
        with _lock:
            p = _write(_new_project(exam.get("title", "取り込んだ試験"),
                                    exam.get("written_points", 80), data["sections"], exam))
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
            return _add_material(pid, b.get("name"), b.get("data"), b.get("text"), str(b.get("sid") or ""))
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
            return _export(pid, bool(body().get("variant")))
        if rest == ["history"] and method == "GET":
            return {"history": _history(pid)}
        if len(rest) == 3 and rest[0] == "history" and rest[2] == "restore" and method == "POST":
            if not HISTORY_NAME.match(rest[1]):
                raise ApiError(400, "版の名前が正しくありません")
            f = _project_dir(pid) / "history" / rest[1]
            if not f.is_file():
                raise ApiError(404, "その版は見つかりません")
            with _lock:
                old = json.loads(f.read_text(encoding="utf-8"))
                p = _load(pid)
                _snapshot(_project_dir(pid), force=True)  # 戻す前の今の内容も版として残す
                p["exam"], p["sections"] = _clean_exam(old.get("exam")), _clean_sections(old.get("sections"))
                _write(p)
            return {"project": p}
        if len(rest) == 2 and rest[0] == "files" and method == "GET":
            return ("file", _export_file(pid, rest[1]))

    if parts == ["config"]:
        if method == "GET":
            return _config()
        if method == "PUT":
            cats = []
            for c in body().get("categories") or []:
                c = str(c).strip()[:30]
                if c and c not in cats:
                    cats.append(c)
            if not cats:
                raise ApiError(400, "カテゴリーを1つ以上残してください")
            with _lock:
                _write_json_file("settings.json", {**_read_json_file("settings.json", {}), "categories": cats})
                _rename_categories(body().get("rename"))
            return _config()

    if parts == ["templates"]:
        if method == "GET":
            return {"templates": _templates()}
        if method == "POST":
            with _lock:
                t = _clean_template(body().get("template"))
                _write_json_file("templates.json", _templates() + [t])
            return {"template": t}
    if len(parts) == 2 and parts[0] == "templates":
        with _lock:
            items = _templates()
            idx = next((i for i, t in enumerate(items) if t["id"] == parts[1]), -1)
            if idx < 0:
                raise ApiError(404, "テンプレートが見つかりません")
            if method == "PUT":
                items[idx] = _clean_template(body().get("template"), parts[1])
                _write_json_file("templates.json", items)
                return {"template": items[idx]}
            if method == "DELETE":
                items.pop(idx)
                _write_json_file("templates.json", items)
                return {"ok": True}

    if parts == ["backup"] and method == "GET":
        return ("bytes", _backup_zip(), f"ExamStudio_backup_{time.strftime('%Y%m%d')}.zip")
    if parts == ["restore"] and method == "POST":
        return _restore_zip(body().get("data"))

    if parts == ["prompt"] and method == "POST":
        b = body()
        return {"prompt": _prompt_text(b.get("text", ""), b.get("format", ""),
                                       b.get("focus", ""), b.get("note", ""),
                                       b.get("source", ""))}

    if parts[:1] == ["settings"] and method == "POST":
        # APIキーはメモリ（環境変数）にだけ保持し、ファイルには保存しない
        b = body()
        prov = str(b.get("provider") or "anthropic")
        if prov not in ("anthropic", "openai"):
            raise ApiError(400, "不明なAIです")
        if parts == ["settings", "apikey"] or "key" in b:
            env = "OPENAI_API_KEY" if prov == "openai" else "ANTHROPIC_API_KEY"
            key = str(b.get("key") or "").strip()
            if key:
                os.environ[env] = key
            elif b.get("clear"):
                os.environ.pop(env, None)
        if prov == "openai":
            os.environ["EXAM_AI_PROVIDER"] = "openai"
            model = str(b.get("model") or "").strip()
            if model:
                os.environ["OPENAI_MODEL"] = model
        else:
            os.environ.pop("EXAM_AI_PROVIDER", None)
        mod = sys.modules.get("exam_app.generate")
        if mod is not None:
            mod._client = None
        return {"status": _ai_status()}

    if parts == ["usage"] and method == "GET":
        return _usage()

    if n == 2 and parts[0] == "prompt" and method == "POST":  # API抜き: 依頼文を作る
        from .. import generate as g0
        b = body()
        p = _load(b.get("pid", ""))
        if parts[1] == "order":
            passage, material = _order_context(p, _to_int(b.get("index"), 0))
            return {"prompt": g0.order_prompt(str(b.get("order", "")), passage, material, p["exam"]["title"])}
        if parts[1] == "student":
            items = _student_items(p, _to_int(b.get("scope"), -1, -1))
            return {"prompt": g0.student_prompt(items) + "\n\n解き終わったら、次の模範解答と照合し、別解・曖昧な問題・"
                    "同じ要素を問う問題の重複を指摘してください。\n\n" + g0._student_sheet(items, with_key=True)}

    if n == 2 and parts[0] == "ai" and method == "POST":
        b = body()
        gen = _generate()
        start = len(gen.usage_log)
        try:
            return _ai_route(gen, parts[1], b)
        finally:
            _record_usage(start)

    raise ApiError(404, "見つかりません")


def _ai_route(gen, action: str, b: dict):
    if True:
        parts = ["ai", action]
        gen.current_task["name"] = {"ask": "クイック作問（AI）", "verify_one": "別解チェック", "section": "大問の一括作問",
                                    "order": "注文で作問", "student": "仮想の生徒"}.get(action, "AI")
        if parts[1] == "order":
            p = _load(b.get("pid", ""))
            idx = _to_int(b.get("index"), 0)
            order = str(b.get("order", "")).strip()
            if not order:
                raise ApiError(400, "作りたい問題を入力してください（例: 内容一致を2問、同意語選択を1問）")
            passage, material = _order_context(p, idx)
            if not passage.strip() and not material.strip():
                raise ApiError(400, "この大問に本文も素材もありません。先に素材を入れてください")
            qs = gen.make_order(order, passage, material, p["exam"]["title"])
            kept = [q for q in qs if str(q.get("source_ref", "")).strip()]
            return {"questions": kept, "dropped": len(qs) - len(kept), "cost": gen.cost_report()}
        if parts[1] == "student":
            p = _load(b.get("pid", ""))
            items = _student_items(p, _to_int(b.get("scope"), -1, -1))
            if not items:
                raise ApiError(400, "解かせる問題がありません（問題文と解答が入った問題が必要です）")
            return {"report": gen.virtual_student(items, str(b.get("level", ""))), "count": len(items),
                    "cost": gen.cost_report()}
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
            items = (_material_items(p, sid=sec.get("sid", "")) or _material_items(p, sec.get("source", ""))
                     or _material_items(p))
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
                cache = {}

                def body():  # 本文は1回しか読めないので、2回目以降は読んだ結果を返す
                    if "v" not in cache:
                        cache["v"] = self._read_json()
                    return cache["v"]
                result = route(method, parts, body)
                if isinstance(result, tuple) and result[0] == "file":
                    f = result[1]
                    self._send(200, f.read_bytes(),
                               CONTENT_TYPES.get(f.suffix, "application/octet-stream"),
                               {"Content-Disposition":
                                f"attachment; filename*=UTF-8''{quote(f.name)}"})
                elif isinstance(result, tuple) and result[0] == "bytes":
                    self._send(200, result[1], "application/zip",
                               {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(result[2])}"})
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


def default_workspace() -> Path:
    """保存先の既定値。起動した人のPCの「ドキュメント/ExamStudio」。
    ツール本体を共有フォルダに置いても、試験データは各自のPCに保存される。
    旧バージョンのデータ（起動フォルダの exam_workspace）があればそれを使い続ける。"""
    legacy = Path("exam_workspace")
    if legacy.is_dir() and any(p.is_dir() and PROJECT_ID.match(p.name) for p in legacy.iterdir()):
        return legacy
    docs = Path.home() / "Documents"
    return (docs if docs.is_dir() else Path.home()) / "ExamStudio"


def make_server(port: int, workspace: Path) -> ThreadingHTTPServer:
    global WORKSPACE
    WORKSPACE = workspace.resolve()
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m exam_app.ui",
                                 description="定期考査スタジオ（ローカルWeb UI）")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--workspace", default=os.environ.get("EXAM_WORKSPACE") or None,
                    help="データの保存先フォルダ（既定: 使っている人の ドキュメント/ExamStudio）")
    ap.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")
    args = ap.parse_args(argv)

    workspace = Path(args.workspace) if args.workspace else default_workspace()
    httpd = None
    for port in range(args.port, args.port + 10):  # 使用中なら次の番号を試す
        try:
            httpd = make_server(port, workspace)
            break
        except OSError:
            continue
    if httpd is None:
        sys.exit(f"ポート {args.port}〜{args.port + 9} がすべて使用中です。--port で別の番号を指定してください")

    url = f"http://127.0.0.1:{httpd.server_address[1]}/"
    st = _ai_status()
    ai = (("ChatGPT" if st["provider"] == "openai" else "Claude") + " 有効") if st["ai"] else "オフ（API抜きモード）"
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
