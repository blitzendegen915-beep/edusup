"""定期考査ジェネレーター CLI

  python -m exam_app.cli index    --materials ./materials [--out materials_index.json]
  python -m exam_app.cli generate --order my_order.yaml   [--outdir output]
  python -m exam_app.cli verify   --draft output/exam_draft.json
"""
import argparse
import json
import sys
from pathlib import Path

import yaml


def cmd_index(args):
    from . import extract
    folder = Path(args.materials)
    docs = extract.scan_folder(folder)
    if not docs:
        sys.exit(f"教材が見つかりません: {folder}")
    from . import generate
    index = {}
    for doc_id, d in docs.items():
        print(f"索引化中 (Haiku): {doc_id} ...")
        if d["text"].startswith("[PDF:"):
            print(f"  スキップ: {d['text']}")
            continue
        index[doc_id] = {"path": d["path"], **generate.index_material(doc_id, d["text"])}
        print(f"  {len(index[doc_id]['usable_items'])} アイテム")
    out = Path(args.out)
    out.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"保存: {out}")


def cmd_generate(args):
    from . import generate
    order = yaml.safe_load(Path(args.order).read_text(encoding="utf-8"))
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
    from . import generate
    draft = json.loads(Path(args.draft).read_text(encoding="utf-8"))
    report = ["# 別解チェック結果（Sonnet 敵対的検証）", ""]
    ng = 0
    for sec in draft["sections"]:
        for q in sec["questions"]:
            v = generate.adversarial_verify(q, sec["type"])
            mark = "❌ 別解あり" if v["has_alternate_answer"] else "✅"
            if v["has_alternate_answer"]:
                ng += 1
            print(f"大問{sec['no']}({q['number']}): {mark}")
            report.append(f"## 大問{sec['no']} ({q['number']}) {mark}")
            report.append(f"- 問題: {q['body'][:120]}")
            report.append(f"- 判定理由: {v['explanation']}")
            if v["has_alternate_answer"]:
                report.append(f"- 修正案: {v['suggested_fix']}")
            report.append("")
    out = Path(args.draft).parent / "verify_report.md"
    out.write_text("\n".join(report), encoding="utf-8")
    print(f"\n保存: {out}  （要修正: {ng}問）")
    if ng:
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(prog="exam_app")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("index", help="教材フォルダを索引化（Haiku）")
    s.add_argument("--materials", required=True)
    s.add_argument("--out", default="materials_index.json")
    s.set_defaults(func=cmd_index)

    s = sub.add_parser("generate", help="オーダー通りに作問（Sonnet）")
    s.add_argument("--order", required=True)
    s.add_argument("--outdir", default="output")
    s.set_defaults(func=cmd_generate)

    s = sub.add_parser("verify", help="別解の敵対的チェック（Sonnet）")
    s.add_argument("--draft", required=True)
    s.set_defaults(func=cmd_verify)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
