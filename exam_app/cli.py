"""定期考査ジェネレーター CLI

  python -m exam_app.cli index    --materials ./materials [--out materials_index.json]
  python -m exam_app.cli generate --order my_order.yaml   [--outdir output]
  python -m exam_app.cli verify   --draft output/exam_draft.json
  python -m exam_app.cli fix      --draft output/exam_draft.json  # 別解問題を差し替え
  python -m exam_app.cli docx     --draft output/exam_draft.json  # Word 3点セット出力
"""
import argparse
import json
import sys
from pathlib import Path

import yaml


def _load_order(path) -> dict:
    """order.yaml を読む。YAML 1.1 では `no:` がブール False に化けるので
    正規化する（大問番号キーの事故対策）。"""
    order = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    for sec in order.get("sections", []):
        if False in sec and "no" not in sec:
            sec["no"] = sec.pop(False)
    return order


def cmd_index(args):
    from . import extract
    folder = Path(args.materials)
    docs = extract.scan_folder(folder)
    if not docs:
        sys.exit(f"教材が見つかりません: {folder}")
    index = {}
    if args.no_api:
        # API抜き: 生テキストをそのまま1アイテムとして索引化（無料）。
        # 出題アイテムへの分解は指揮者(Claude/Codex)が読む前提。
        for doc_id, d in docs.items():
            index[doc_id] = {
                "path": d["path"],
                "summary": "(no-api: 生テキスト)",
                "usable_items": [{"kind": "raw", "ref": doc_id, "text": d["text"]}],
            }
            print(f"索引化 (no-api): {doc_id} ({len(d['text'])}文字)")
    else:
        from . import generate
        for doc_id, d in docs.items():
            print(f"索引化中 (Haiku): {doc_id} ...")
            if d["text"].startswith("[PDF:"):
                print(f"  スキップ: {d['text']}")
                continue
            index[doc_id] = {"path": d["path"],
                             **generate.index_material(doc_id, d["text"])}
            print(f"  {len(index[doc_id]['usable_items'])} アイテム")
        print(generate.cost_report())
    out = Path(args.out)
    out.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"保存: {out}")


def cmd_generate(args):
    from . import generate
    order = _load_order(args.order)
    index = json.loads(Path(order["materials_index"]).read_text(encoding="utf-8"))
    exam = order["exam"]

    # 配点の事前検算（skills/exam-verify Step3）
    total = sum(s["points_each"] * s["count"] for s in order["sections"])
    if total != exam["written_points"]:
        print(f"⚠ 配点合計 {total} 点 ≠ written_points {exam['written_points']} 点")

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    draft = {"exam": exam, "sections": []}

    for sec in order["sections"]:
        src = sec["source"]
        if src not in index:
            sys.exit(f"大問{sec['no']}: 教材ID '{src}' が索引にありません。"
                     f" 利用可能: {list(index)}")
        print(f"作問中 (Sonnet): 大問{sec['no']} ({sec['type']}) ← {src} ...")
        result = generate.make_section(sec, index[src]["usable_items"],
                                       exam_context=exam["title"])
        # 出典なしの問題は破棄（創作防止の最後の砦）
        kept = [q for q in result["questions"] if q["source_ref"].strip()]
        dropped = len(result["questions"]) - len(kept)
        if dropped:
            print(f"  ⚠ 出典なしの{dropped}問を破棄しました")
        draft["sections"].append({**sec, "questions": kept})

    (outdir / "exam_draft.json").write_text(
        json.dumps(draft, ensure_ascii=False, indent=1), encoding="utf-8")
    _write_markdown(draft, outdir)

    from . import checks
    issues = checks.run_all(draft)
    if issues:
        print("\n⚠ 決定論チェックで問題を検出:")
        for i in issues:
            print(f"  - {i}")
    else:
        print("決定論チェック: 合格")
    print(generate.cost_report())
    print(f"保存: {outdir}/exam_draft.json / exam_draft.md / sources_draft.md")
    print("次: python -m exam_app.cli verify --draft", outdir / "exam_draft.json")


def _write_markdown(draft, outdir: Path):
    md = [f"# {draft['exam']['title']}", ""]
    src = ["# 出典一覧（sources/ へコピーして使う）", ""]
    for sec in draft["sections"]:
        md.append(f"\n## 大問{sec['no']}（{sec['points_each']}点×{len(sec['questions'])}）")
        src.append(f"\n## 大問{sec['no']}")
        src.append("| 問 | 答え | 出典 |")
        src.append("|---|---|---|")
        for q in sec["questions"]:
            md.append(f"\n**({q['number']})** {q['body']}")
            md.append(f"> 解答: {q['answer']}  ／ 別解リスク: {q['alt_answer_risk']}")
            src.append(f"| ({q['number']}) | {q['answer']} | {q['source_ref']} |")
    (outdir / "exam_draft.md").write_text("\n".join(md), encoding="utf-8")
    (outdir / "sources_draft.md").write_text("\n".join(src), encoding="utf-8")


def cmd_verify(args):
    from . import checks
    draft_path = Path(args.draft)
    draft = json.loads(draft_path.read_text(encoding="utf-8"))

    report = ["# 精査結果", "", "## 決定論チェック"]
    det = checks.run_all(draft)
    report += [f"- ⚠ {i}" for i in det] or ["- 合格"]
    for i in det:
        print(f"⚠ {i}")

    if args.no_api:
        out = draft_path.parent / "verify_report.md"
        report += ["", "## 別解チェック", "- (no-api: 未実施。指揮者が "
                   "skills/exam-unique-answer/SKILL.md の手順で行うこと)"]
        out.write_text("\n".join(report), encoding="utf-8")
        print(f"決定論チェックのみ実施（NG: {len(det)}件）→ {out}")
        sys.exit(1 if det else 0)

    from . import generate
    report += ["", "## 別解チェック（Sonnet 敵対的検証）", ""]
    ng = 0
    verdicts = {}
    for sec in draft["sections"]:
        for q in sec["questions"]:
            v = generate.adversarial_verify(q, sec["type"])
            key = f"{sec['no']}-{q['number']}"
            verdicts[key] = v
            mark = "❌ 別解あり" if v["has_alternate_answer"] else "✅"
            if v["has_alternate_answer"]:
                ng += 1
            print(f"大問{sec['no']}({q['number']}): {mark}")
            report.append(f"### 大問{sec['no']} ({q['number']}) {mark}")
            report.append(f"- 問題: {q['body'][:120]}")
            report.append(f"- 判定理由: {v['explanation']}")
            if v["has_alternate_answer"]:
                report.append(f"- 修正案: {v['suggested_fix']}")
            report.append("")

    out = draft_path.parent / "verify_report.md"
    out.write_text("\n".join(report), encoding="utf-8")
    # fixコマンド用に判定を保存
    (draft_path.parent / "verdicts.json").write_text(
        json.dumps(verdicts, ensure_ascii=False, indent=1), encoding="utf-8")
    print(generate.cost_report())
    print(f"\n保存: {out}  （別解あり: {ng}問 / 決定論NG: {len(det)}件）")
    if ng:
        print("差し替え: python -m exam_app.cli fix --draft", draft_path)
        sys.exit(1)


def cmd_fix(args):
    """verify で別解が出た問題を差し替える。差し替え内容は必ず表示する
    （skills/exam-provenance: 黙って変えない）。"""
    from . import checks, generate
    draft_path = Path(args.draft)
    draft = json.loads(draft_path.read_text(encoding="utf-8"))
    verdicts_path = draft_path.parent / "verdicts.json"
    if not verdicts_path.exists():
        sys.exit("verdicts.json がありません。先に verify を実行してください。")
    verdicts = json.loads(verdicts_path.read_text(encoding="utf-8"))
    order_index = json.loads(Path(args.index).read_text(encoding="utf-8")) \
        if args.index else None

    changed = []
    for sec in draft["sections"]:
        items = (order_index or {}).get(sec.get("source", ""), {}).get("usable_items", [])
        used = [q["source_ref"] for q in sec["questions"]]
        for i, q in enumerate(sec["questions"]):
            v = verdicts.get(f"{sec['no']}-{q['number']}")
            if not (v and v["has_alternate_answer"]):
                continue
            print(f"差し替え中 (Sonnet): 大問{sec['no']}({q['number']}) ...")
            new_q = generate.regenerate_question(
                sec, q, v, items, used, draft["exam"]["title"])
            new_q["number"] = q["number"]
            sec["questions"][i] = new_q
            changed.append(
                f"大問{sec['no']}({q['number']}): 「{q['body'][:60]}…」\n"
                f"  → 「{new_q['body'][:60]}…」（出典: {new_q['source_ref']}）")

    if not changed:
        print("差し替え対象なし")
        return
    print("\n== 差し替え内容（要確認） ==")
    for c in changed:
        print(c)

    draft_path.write_text(json.dumps(draft, ensure_ascii=False, indent=1),
                          encoding="utf-8")
    _write_markdown(draft, draft_path.parent)
    for i in checks.run_all(draft):
        print(f"⚠ {i}")
    print(generate.cost_report())
    print(f"\n更新: {draft_path}")
    print("再検証: python -m exam_app.cli verify --draft", draft_path)


def cmd_skeleton(args):
    """API抜き運用の入口: オーダーから空のdraft雛形を作る。
    問題は指揮者(Claude Code/Codex)か教員が skills/ に従って埋める。"""
    order = _load_order(args.order)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    draft = {"exam": order["exam"], "sections": []}
    for sec in order["sections"]:
        qs = [{"number": i + 1, "body": "", "answer": "",
               "source_ref": "", "alt_answer_risk": ""}
              for i in range(sec["count"])]
        draft["sections"].append({**sec, "questions": qs})
    out = outdir / "exam_draft.json"
    out.write_text(json.dumps(draft, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"雛形を保存: {out}")
    print("問題を埋めたら: verify --no-api → docx の順で実行")


def cmd_docx(args):
    from . import build_docx
    draft_path = Path(args.draft)
    draft = json.loads(draft_path.read_text(encoding="utf-8"))
    files = build_docx.build_all(draft, draft_path.parent)
    for f in files:
        print(f"保存: {f}")
    print("※体裁は叩き台。テンプレート運用する場合は scripts/ の方式を使う")


def main():
    p = argparse.ArgumentParser(prog="exam_app")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("index", help="教材フォルダを索引化（Haiku / --no-apiで無料）")
    s.add_argument("--materials", required=True)
    s.add_argument("--out", default="materials_index.json")
    s.add_argument("--no-api", action="store_true",
                   help="APIを使わず生テキストで索引化")
    s.set_defaults(func=cmd_index)

    s = sub.add_parser("generate", help="オーダー通りに作問（Sonnet）")
    s.add_argument("--order", required=True)
    s.add_argument("--outdir", default="output")
    s.set_defaults(func=cmd_generate)

    s = sub.add_parser("verify", help="決定論チェック＋別解の敵対的チェック（Sonnet）")
    s.add_argument("--draft", required=True)
    s.add_argument("--no-api", action="store_true",
                   help="決定論チェックのみ（無料）")
    s.set_defaults(func=cmd_verify)

    s = sub.add_parser("skeleton", help="手作業/指揮者作問用の draft雛形を出力（API不使用）")
    s.add_argument("--order", required=True)
    s.add_argument("--outdir", default="output")
    s.set_defaults(func=cmd_skeleton)

    s = sub.add_parser("fix", help="別解ありの問題を差し替え（Sonnet）")
    s.add_argument("--draft", required=True)
    s.add_argument("--index", help="materials_index.json（差し替え候補の出典元）")
    s.set_defaults(func=cmd_fix)

    s = sub.add_parser("docx", help="Word 3点セットを出力（API不使用）")
    s.add_argument("--draft", required=True)
    s.set_defaults(func=cmd_docx)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
