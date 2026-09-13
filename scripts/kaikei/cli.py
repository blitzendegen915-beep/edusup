"""合宿会計CLI。

    python3 -m scripts.kaikei <command>

commands: check / headcount / balance / settle / report
"""
from __future__ import annotations

import argparse
import sys
from datetime import date

from . import checks, model, reports
from .checks import date_ja

SEVERITY_MARK = {"error": "❌", "warn": "⚠️", "info": "✅"}
SEVERITY_LABEL = {"error": "エラー", "warn": "要確認", "info": "OK"}
SEVERITY_ORDER = ["error", "warn", "info"]


def cmd_check(camp_id: str) -> int:
    camp = model.load(camp_id)
    fiscal_year = camp_id.split("-")[0]
    ledger_entries = model.load_ledger(fiscal_year)
    findings = checks.run_all(camp) + checks.run_all_ledger(ledger_entries)

    print(f"=== {camp.name}／年間経費台帳({fiscal_year}) 会計チェック結果 ===\n")
    has_error = False
    for sev in SEVERITY_ORDER:
        items = [f for f in findings if f.severity == sev]
        if not items:
            continue
        print(f"--- {SEVERITY_MARK[sev]} {SEVERITY_LABEL[sev]}（{len(items)}件） ---")
        for f in items:
            mark = SEVERITY_MARK[sev]
            for i, line in enumerate(f.message.split("\n")):
                prefix = f"{mark} " if i == 0 else "   "
                print(f"{prefix}{line}")
        print()
        if sev == "error":
            has_error = True

    if has_error:
        print("❌ エラーがあります。会計報告書を配布する前に解決してください。")
        return 1
    print("✅ エラーはありません。⚠️の項目は内容を確認のうえ対応してください。")
    return 0


def cmd_headcount(camp_id: str) -> int:
    camp = model.load(camp_id)
    hc = model.headcount(camp)
    print(f"=== {camp.name} 日別人数表 ===\n")
    header = f"{'日付':<10}{'朝食':>6}{'昼食':>6}{'夕食':>6}{'宿泊':>6}{'申告済':>8}"
    print(header)
    print("-" * len(header))
    for d in camp.date_range():
        v = hc["per_date"][d]
        submitted = camp.submitted_headcount.get(d)
        print(
            f"{date_ja(d):<10}"
            f"{model.fmt_meal(v['breakfast']):>6}"
            f"{model.fmt_meal(v['lunch']):>6}"
            f"{model.fmt_meal(v['dinner']):>6}"
            f"{model.fmt_meal(v['lodging']):>6}"
            f"{(submitted if submitted is not None else '－'):>8}"
        )
    t = hc["totals"]
    print("-" * len(header))
    print(f"{'合計(延べ)':<10}{t['breakfast']:>6}{t['lunch']:>6}{t['dinner']:>6}{t['lodging']:>6}")
    return 0


def cmd_balance(camp_id: str) -> int:
    camp = model.load(camp_id)
    inc = model.income(camp)
    bal = model.balance(camp)
    settle = model.settlement(camp)

    print(f"=== {camp.name} 収支サマリ ===\n")
    print(f"収入合計　　: ¥{bal['income_total']:,}（{len(inc['lines'])}名）")
    print(f"支出合計　　: ¥{bal['expense_total']:,}")
    print(f"  内訳: ホテル ¥{bal['hotel_invoice_total']:,} ／ バス ¥{bal['bus_quote']:,} ／ その他支出 ¥{bal['expenses_total']:,}")
    print(f"差引残額　　: ¥{bal['diff']:,}")
    print()
    print(f"未精算の立替金合計: ¥{settle['grand_total']:,}")
    for payer, info in settle["by_payer"].items():
        print(f"  {payer}: ¥{info['total']:,}（{len(info['items'])}件）")
    return 0


def cmd_settle(args) -> int:
    if getattr(args, "all", False):
        return _cmd_settle_all(args.camp)
    camp = model.load(args.camp)
    path = reports.write_settlement_xlsx(camp=camp)
    print(f"✅ 立替金精算表を出力しました: {path}")
    return 0


def _print_settlement_block(settle: dict) -> None:
    if not settle["by_payer"]:
        print("  未精算の立替金はありません。")
        return
    for payer, info in settle["by_payer"].items():
        print(f"  {payer}: ¥{info['total']:,}（{len(info['items'])}件）")
    print(f"  小計: ¥{settle['grand_total']:,}")


def _cmd_settle_all(camp_id: str) -> int:
    combined = model.combined_settlement(camp_id=camp_id)
    fiscal_year = combined["fiscal_year"]

    print("=== 立替金精算（夏合宿＋年間経費台帳 合算） ===\n")

    print(f"--- 夏合宿（expenses-{camp_id}.csv） ---")
    _print_settlement_block(combined["camp"])
    print()

    print(f"--- 年間経費台帳（ledger-{fiscal_year}.csv） ---")
    _print_settlement_block(combined["ledger"])
    print()

    print("--- 合算（立替者ごとに精算すべき合計） ---")
    if not combined["combined"]:
        print("  未精算の立替金はありません。")
    else:
        for payer, info in combined["combined"].items():
            print(f"  {payer}: ¥{info['total']:,}（夏合宿 ¥{info['camp']:,} ＋ 年間経費 ¥{info['ledger']:,}）")
    print(f"合計: ¥{combined['grand_total']:,}")
    return 0


def cmd_report(camp_id: str) -> int:
    camp = model.load(camp_id)
    p1 = reports.write_camp_report_xlsx(camp=camp)
    p2 = reports.write_headcount_xlsx(camp=camp)
    print(f"✅ 収支報告書を出力しました: {p1}")
    print(f"✅ 日別人数表を出力しました: {p2}")
    return 0


def _print_unsettled_totals(camp: model.Camp) -> None:
    settle = model.settlement(camp)
    print("--- 未精算の立替金（更新後） ---")
    if not settle["by_payer"]:
        print("未精算の立替金はありません。")
        return
    for payer, info in settle["by_payer"].items():
        print(f"  {payer}: ¥{info['total']:,}（{len(info['items'])}件）")
    print(f"  合計: ¥{settle['grand_total']:,}")


def _cmd_add_settle(camp_id: str, payer: str, all_flag: bool = False) -> int:
    payer = payer.strip()
    if not payer:
        print("❌ --settle には立替者名を指定してください。ファイルは変更していません。")
        return 1

    result = model.settle_payer_rows(camp_id, payer)
    ledger_result = None
    if all_flag:
        fiscal_year = camp_id.split("-")[0]
        ledger_result = model.settle_ledger_rows(fiscal_year, payer)

    if not result["items"] and not (ledger_result and ledger_result["items"]):
        print(f"{payer} の未精算の立替金はありません。")
        return 0

    if result["items"]:
        suffix = "（夏合宿）" if all_flag else ""
        print(f"✅ {payer} の立替金 ¥{result['total']:,}（{len(result['items'])}件）{suffix}を精算済み(settled=yes)にしました。")
        for r in result["items"]:
            print(f"  {r['date']} {r['vendor']} ¥{int(r['amount']):,}（{r['receipt']}）")
    elif all_flag:
        print(f"{payer} の夏合宿分の未精算の立替金はありません。")

    if ledger_result is not None:
        if ledger_result["items"]:
            print(
                f"✅ {payer} の立替金 ¥{ledger_result['total']:,}（{len(ledger_result['items'])}件）"
                "（年間経費台帳）を精算済み(settled=yes)にしました。"
            )
            for r in ledger_result["items"]:
                print(f"  {r['date']} [{r.get('event', '')}] {r['vendor']} ¥{int(r['amount']):,}（{r['receipt']}）")
        else:
            print(f"{payer} の年間経費台帳分の未精算の立替金はありません。")
    return 0


def _cmd_add_row(args) -> int:
    camp_id = args.camp
    required = [
        ("--date", args.date),
        ("--vendor", args.vendor),
        ("--description", args.description),
        ("--amount", args.amount),
        ("--category", args.category),
        ("--payer", args.payer),
    ]
    missing = [name for name, val in required if val is None]
    if missing:
        print("❌ 次の項目の指定が必要です: " + "、".join(missing))
        print("ファイルは変更していません。")
        return 1

    errors = []
    parsed_date = None
    try:
        parsed_date = date.fromisoformat(args.date)
    except ValueError:
        errors.append(f"日付 '{args.date}' の形式が不正です。YYYY-MM-DD の形式で指定してください。")

    if args.amount <= 0:
        errors.append(f"金額は正の整数で指定してください（指定値: {args.amount}）。")

    if args.category not in ("A", "B", "C"):
        errors.append(f"会計分類は A・B・C のいずれかで指定してください（指定値: '{args.category}'）。")

    if not args.payer.strip():
        errors.append("立替者(payer)を空にはできません。")

    if errors:
        print("❌ 入力内容にエラーがあります。ファイルは変更していません。")
        for e in errors:
            print(f"  ・{e}")
        return 1

    warn_lines = []
    try:
        camp = model.load(camp_id)
    except FileNotFoundError as e:
        print(f"❌ 合宿データの読み込みに失敗しました: {e}")
        return 1

    if parsed_date is not None and not (camp.start <= parsed_date <= camp.end):
        warn_lines.append(
            f"⚠️ 日付 {args.date} は合宿期間（{camp.start.isoformat()}〜{camp.end.isoformat()}）の外です。"
            "入力ミスでないか確認してください。"
        )

    new_row = {
        "date": args.date,
        "vendor": args.vendor,
        "description": args.description,
        "amount": args.amount,
        "category": args.category,
        "payer": args.payer.strip(),
        "settled": "no",
        "receipt": (args.receipt or "").strip(),
        "note": args.note or "",
    }
    try:
        added = model.append_expense(camp_id, new_row)
    except ValueError as e:
        print(f"❌ {e}")
        print("ファイルは変更していません。")
        return 1

    print(f"✅ 支出を追加しました（{added['receipt']}）")
    print(
        f"  {added['date']} {added['vendor']} / {added['description']} "
        f"¥{int(added['amount']):,}（分類{added['category']} 立替:{added['payer']} 精算:{added['settled']}）"
    )
    if added.get("note"):
        print(f"  備考: {added['note']}")
    for w in warn_lines:
        print(w)
    print()

    camp_after = model.load(camp_id)
    _print_unsettled_totals(camp_after)
    return 0


def _cmd_add_ledger_row(args) -> int:
    """年間経費台帳(ledger-<年度>.csv)への1行追加。--event が指定されたときの add の分岐先。"""
    required = [
        ("--date", args.date),
        ("--vendor", args.vendor),
        ("--description", args.description),
        ("--amount", args.amount),
        ("--category", args.category),
        ("--payer", args.payer),
        ("--event", args.event),
    ]
    missing = [name for name, val in required if val is None]
    if missing:
        print("❌ 次の項目の指定が必要です: " + "、".join(missing))
        print("ファイルは変更していません。")
        return 1

    errors = []
    try:
        date.fromisoformat(args.date)
    except ValueError:
        errors.append(f"日付 '{args.date}' の形式が不正です。YYYY-MM-DD の形式で指定してください。")

    if args.amount <= 0:
        errors.append(f"金額は正の整数で指定してください（指定値: {args.amount}）。")

    if args.category not in ("A", "B", "C"):
        errors.append(f"会計分類は A・B・C のいずれかで指定してください（指定値: '{args.category}'）。")

    if not args.payer.strip():
        errors.append("立替者(payer)を空にはできません。")

    if not args.event.strip():
        errors.append("行事名(--event)を空にはできません。")

    if errors:
        print("❌ 入力内容にエラーがあります。ファイルは変更していません。")
        for e in errors:
            print(f"  ・{e}")
        return 1

    fiscal_year = args.camp.split("-")[0]
    new_row = {
        "date": args.date,
        "event": args.event.strip(),
        "vendor": args.vendor,
        "description": args.description,
        "amount": args.amount,
        "category": args.category,
        "payer": args.payer.strip(),
        "settled": "no",
        "receipt": (args.receipt or "").strip(),
        "note": args.note or "",
    }
    try:
        added = model.append_ledger_entry(fiscal_year, new_row)
    except ValueError as e:
        print(f"❌ {e}")
        print("ファイルは変更していません。")
        return 1

    print(f"✅ 年間経費台帳に支出を追加しました（{added['receipt']}）")
    print(
        f"  {added['date']} [{added['event']}] {added['vendor']} / {added['description']} "
        f"¥{int(added['amount']):,}（分類{added['category']} 立替:{added['payer']} 精算:{added['settled']}）"
    )
    if added.get("note"):
        print(f"  備考: {added['note']}")
    print()

    entries_after = model.load_ledger(fiscal_year)
    ledger_settle = model.ledger_settlement(entries_after)
    print("--- 年間経費台帳 未精算の立替金（更新後） ---")
    if not ledger_settle["by_payer"]:
        print("未精算の立替金はありません。")
    else:
        for payer, info in ledger_settle["by_payer"].items():
            print(f"  {payer}: ¥{info['total']:,}（{len(info['items'])}件）")
        print(f"  合計: ¥{ledger_settle['grand_total']:,}")
    return 0


def cmd_add(args) -> int:
    if args.settle:
        return _cmd_add_settle(args.camp, args.settle, getattr(args, "all", False))
    if args.event:
        return _cmd_add_ledger_row(args)
    return _cmd_add_row(args)


CATEGORY_JA = model.CATEGORY_JA


def cmd_ledger(args) -> int:
    fiscal_year = getattr(args, "fiscal_year", None) or "2026"
    entries = model.load_ledger(fiscal_year)

    if args.category:
        entries = [e for e in entries if e.category == args.category]
    if args.event:
        entries = [e for e in entries if e.event == args.event]

    print(f"=== 年間経費台帳（{fiscal_year}年度） ===\n")
    if not entries:
        print("該当する行はありません。")
        return 0

    by_cat: dict = {}
    for e in entries:
        by_cat.setdefault(e.category, []).append(e)

    grand_total = 0
    grand_count = 0
    for cat in ("A", "B", "C"):
        items = by_cat.get(cat)
        if not items:
            continue
        print(f"--- 分類{cat}（{CATEGORY_JA.get(cat, cat)}） ---")
        subtotal = 0
        for e in sorted(items, key=lambda e: (e.date, e.receipt)):
            subtotal += e.amount
            mark = "  ⚠️ 未精算" if not e.is_settled else ""
            print(
                f"  {e.date.isoformat()} [{e.event}] {e.vendor} / {e.description} "
                f"¥{e.amount:,}（立替:{e.payer} {e.receipt}）{mark}"
            )
        print(f"  小計: ¥{subtotal:,}（{len(items)}件）\n")
        grand_total += subtotal
        grand_count += len(items)

    other_cats = sorted(set(by_cat) - {"A", "B", "C"})
    for cat in other_cats:
        items = by_cat[cat]
        print(f"--- 分類{cat}（未知の分類） ---")
        subtotal = sum(e.amount for e in items)
        for e in sorted(items, key=lambda e: (e.date, e.receipt)):
            mark = "  ⚠️ 未精算" if not e.is_settled else ""
            print(
                f"  {e.date.isoformat()} [{e.event}] {e.vendor} / {e.description} "
                f"¥{e.amount:,}（立替:{e.payer} {e.receipt}）{mark}"
            )
        print(f"  小計: ¥{subtotal:,}（{len(items)}件）\n")
        grand_total += subtotal
        grand_count += len(items)

    print(f"合計: ¥{grand_total:,}（{grand_count}件）")
    return 0


COMMANDS = {
    "check": cmd_check,
    "headcount": cmd_headcount,
    "balance": cmd_balance,
    "report": cmd_report,
}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m scripts.kaikei", description="ラグビー部 合宿会計ツール")
    sub = parser.add_subparsers(dest="command", required=True)

    for name in COMMANDS:
        p = sub.add_parser(name)
        p.add_argument("--camp", default="2026-summer", help="合宿ID（既定: 2026-summer）")

    settle_p = sub.add_parser("settle", help="立替金精算表を出力する。--all で年間経費台帳も合算して集計する")
    settle_p.add_argument("--camp", default="2026-summer", help="合宿ID（既定: 2026-summer）")
    settle_p.add_argument(
        "--all", action="store_true", help="夏合宿と年間経費台帳(ledger-*.csv)の未精算立替を合算して表示する"
    )

    add_p = sub.add_parser(
        "add", help="領収書を1件追加する。--event で年間経費台帳へ、--settle で立替金の精算フラグを更新する"
    )
    add_p.add_argument("--camp", default="2026-summer", help="合宿ID（既定: 2026-summer）")
    add_p.add_argument("--date", help="支出日 YYYY-MM-DD")
    add_p.add_argument("--vendor", help="支払先")
    add_p.add_argument("--description", help="品目")
    add_p.add_argument("--amount", type=int, help="金額（正の整数）")
    add_p.add_argument("--category", help="会計分類 A/B/C")
    add_p.add_argument("--payer", help="立替者")
    add_p.add_argument("--receipt", help="領収書番号（省略時は自動採番）")
    add_p.add_argument("--note", default="", help="備考")
    add_p.add_argument("--event", help="行事名（例: 秋季大会）。指定すると年間経費台帳(ledger-*.csv)に追加する")
    add_p.add_argument("--settle", metavar="PAYER", help="指定した立替者の未精算分をすべて精算済みにする")
    add_p.add_argument(
        "--all", action="store_true", help="--settle と併用: 夏合宿と年間経費台帳の両方を精算済みにする"
    )

    ledger_p = sub.add_parser("ledger", help="年間経費台帳を会計分類別に表示する")
    ledger_p.add_argument("--category", choices=["A", "B", "C"], help="会計分類で絞り込む")
    ledger_p.add_argument("--event", help="行事名で絞り込む")

    args = parser.parse_args(argv)
    if args.command == "add":
        return cmd_add(args)
    if args.command == "settle":
        return cmd_settle(args)
    if args.command == "ledger":
        return cmd_ledger(args)
    return COMMANDS[args.command](args.camp)


if __name__ == "__main__":
    sys.exit(main())
