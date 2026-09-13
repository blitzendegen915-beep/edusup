"""会計データの整合性チェック。

各 check_* 関数は Finding のリストを返す。severity は 'error' / 'warn' / 'info'。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from . import model

WEEKDAY_JA = ["月", "火", "水", "木", "金", "土", "日"]


def weekday_ja(d: date) -> str:
    """datetimeの曜日番号から日本語の曜日ラベルを返す（月曜=0起点）。"""
    return WEEKDAY_JA[d.weekday()]


def date_ja(d: date) -> str:
    return f"{d.month}/{d.day}（{weekday_ja(d)}）"


@dataclass
class Finding:
    severity: str  # 'error' | 'warn' | 'info'
    code: str
    message: str


# ---------------------------------------------------------------------------


def check_weekdays(camp: model.Camp) -> list:
    findings = []
    labels = [date_ja(d) for d in camp.date_range()]
    findings.append(
        Finding(
            "info",
            "weekdays",
            "合宿期間の日付・曜日: " + " ／ ".join(labels)
            + f"（初日{date_ja(camp.start)}は朝食なし、最終日{date_ja(camp.end)}は夕食なしとして計算しています）",
        )
    )
    return findings


def check_submitted_headcount(camp: model.Camp) -> list:
    findings = []
    hc = model.headcount(camp)
    any_diff = False
    for d in camp.date_range():
        submitted = camp.submitted_headcount.get(d)
        if submitted is None:
            continue
        computed = hc["per_date"][d]["present"]
        diff = computed - submitted
        if diff != 0:
            any_diff = True
            findings.append(
                Finding(
                    "warn",
                    "submitted_headcount_mismatch",
                    f"{date_ja(d)}: 名簿から計算した現地人数 {computed}名 と、"
                    f"畠山先生がホテルへ申告した人数 {submitted}名 が一致しません"
                    f"（差 {diff:+d}名）。ホテルへの申告済み人数を優先しつつ、原因の確認が必要です。",
                )
            )
    if not any_diff:
        findings.append(
            Finding("info", "submitted_headcount_ok", "申告済み日別人数と名簿からの計算人数はすべて一致しました。")
        )
    return findings


def check_hotel_total(camp: model.Camp) -> list:
    findings = []
    bill = model.hotel_bill(camp)
    diff = camp.hotel_invoice_total - bill["total"]
    lines = [f"再構成した宿泊費内訳: 合計 ¥{bill['total']:,}（人泊数 {bill['person_nights']}人泊）"]
    for item in bill["items"]:
        lines.append(f"  ・{item['name']}: ¥{item['unit']:,} × {item['qty']} = ¥{item['amount']:,}")
    findings.append(Finding("info", "hotel_bill_breakdown", "\n".join(lines)))

    if diff == 0:
        findings.append(Finding("info", "hotel_total_ok", "再構成した宿泊費合計は請求書の金額と完全に一致しました。"))
    else:
        stay3 = camp.hotel_rates["stay3"]
        equiv_nights = diff / stay3
        findings.append(
            Finding(
                "warn",
                "hotel_total_mismatch",
                f"再構成した宿泊費合計 ¥{bill['total']:,} と請求書合計 ¥{camp.hotel_invoice_total:,} が"
                f"¥{diff:,} 一致しません（1泊3食単価¥{stay3:,}換算で約{equiv_nights:.2f}人泊相当）。\n"
                "  この再構成は「1泊3食×人泊数／増昼食／BBQ／グラウンド使用料」のみの簡易モデルであり、"
                "途中合流・途中離脱の大人が生む単発の増朝食・増夕食・増宿泊のような、"
                "1泊3食パッケージに収まらない細目までは再現していません。差額はその範囲内と考えられますが、"
                "請求書の明細と突き合わせて確認してください。",
            )
        )
    return findings


def check_balance(camp: model.Camp) -> list:
    bal = model.balance(camp)
    findings = [
        Finding(
            "info",
            "balance_breakdown",
            f"収入合計 ¥{bal['income_total']:,} － 支出合計 ¥{bal['expense_total']:,}"
            f"（ホテル ¥{bal['hotel_invoice_total']:,} ＋ バス ¥{bal['bus_quote']:,} ＋ その他支出 ¥{bal['expenses_total']:,}）"
            f" ＝ 残額 ¥{bal['diff']:,}",
        )
    ]
    if bal["diff"] < 0:
        findings.append(
            Finding(
                "error",
                "balance_negative",
                f"支出が収入を ¥{-bal['diff']:,} 上回っています。財源の確認が必要です。",
            )
        )
    else:
        findings.append(
            Finding(
                "info",
                "balance_surplus",
                f"残額 ¥{bal['diff']:,} は、コーチ謝礼・バスの追加請求（有料道路代等）・予備費未使用分の"
                "返金などが未確定のままの暫定値です。これらが確定するまで最終決算にはなりません。",
            )
        )
    return findings


def check_unsettled(camp: model.Camp) -> list:
    findings = []
    settle = model.settlement(camp)
    if not settle["by_payer"]:
        findings.append(Finding("info", "unsettled_none", "未精算の立替金はありません。"))
        return findings
    for payer, info in settle["by_payer"].items():
        item_desc = "、".join(f"{e.date.month}/{e.date.day}{e.vendor}¥{e.amount:,}" for e in info["items"])
        findings.append(
            Finding(
                "warn",
                "unsettled_advance",
                f"{payer}: 未精算の立替金 ¥{info['total']:,}（{len(info['items'])}件: {item_desc}）",
            )
        )
    findings.append(
        Finding("info", "unsettled_total", f"未精算の立替金 合計 ¥{settle['grand_total']:,}")
    )
    return findings


def check_missing_receipts(camp: model.Camp) -> list:
    findings = []
    dates_with_expense = {e.date for e in camp.expenses}

    try:
        prior = model.prior_year_misc_summary()
        prior_note = f"昨年は雑費{prior['count']}件・計¥{prior['total']:,} が記録されている"
    except FileNotFoundError:
        prior_note = "昨年の雑費台帳データが見つからず件数の比較はできない"

    for d in camp.date_range():
        if d not in dates_with_expense:
            findings.append(
                Finding(
                    "warn",
                    "missing_receipts",
                    f"{date_ja(d)} の支出記録が1件もありません。"
                    f"{prior_note}のに対し、合宿7日間で支出ゼロの日があるのは"
                    "領収書の回収漏れの可能性が高いです。畠山先生・占部先生に確認してください。",
                )
            )
    return findings


def check_misc_vs_prior_year(camp: model.Camp) -> list:
    """今年の雑費(分類C)合計を昨年の雑費台帳合計と比較し、大幅な過少を警告する。"""
    findings = []
    try:
        prior = model.prior_year_misc_summary()
    except FileNotFoundError:
        return findings

    prior_total = prior["total"]
    if prior_total == 0:
        return findings

    this_year_total = sum(e.amount for e in camp.expenses if e.category == "C")
    ratio = this_year_total / prior_total

    if ratio < 0.5:
        findings.append(
            Finding(
                "warn",
                "misc_vs_prior_year_low",
                f"今年の雑費（分類C）合計は ¥{this_year_total:,} で、"
                f"昨年の雑費合計 ¥{prior_total:,} の {ratio:.0%} にとどまっています。"
                "領収書の回収漏れがないか確認してください。",
            )
        )
    else:
        findings.append(
            Finding(
                "info",
                "misc_vs_prior_year_ok",
                f"今年の雑費（分類C）合計 ¥{this_year_total:,} は、"
                f"昨年の雑費合計 ¥{prior_total:,} の {ratio:.0%} です。",
            )
        )
    return findings


def check_category_split(camp: model.Camp) -> list:
    findings = []
    totals = {"A": 0, "B": 0, "C": 0}
    counts = {"A": 0, "B": 0, "C": 0}
    for e in camp.expenses:
        if e.category in totals:
            totals[e.category] += e.amount
            counts[e.category] += 1
        else:
            findings.append(
                Finding("warn", "category_unknown", f"未知の会計分類 '{e.category}'（{e.description}）があります。")
            )
    findings.append(
        Finding(
            "info",
            "category_totals",
            "会計分類別の小計: "
            + " ／ ".join(f"{k}（{'校友会' if k=='A' else '父母会' if k=='B' else '都度徴収'}）¥{totals[k]:,}（{counts[k]}件）" for k in "ABC"),
        )
    )
    if totals["B"] > 0:
        b_items = "、".join(f"{e.date.month}/{e.date.day}{e.vendor}¥{e.amount:,}" for e in camp.expenses if e.category == "B")
        findings.append(
            Finding(
                "warn",
                "category_b_in_camp_report",
                f"分類B（父母会予算）の支出が ¥{totals['B']:,} 分含まれています（{b_items}）。"
                "分類Bは父母会予算から精算し、合宿費の会計報告には混ぜない部のルールです。"
                "balance() の支出合計にはこれらもそのまま含まれているため、"
                "収支報告書を作成する際は合宿費部分と分けて扱ってください。",
            )
        )
    return findings


ALL_CHECKS = [
    check_weekdays,
    check_submitted_headcount,
    check_hotel_total,
    check_balance,
    check_unsettled,
    check_missing_receipts,
    check_misc_vs_prior_year,
    check_category_split,
]


def run_all(camp: model.Camp) -> list:
    findings = []
    for check in ALL_CHECKS:
        findings.extend(check(camp))
    return findings


# ---------------------------------------------------------------------------
# 年間経費台帳(ledger-<年度>.csv)向けチェック
# ---------------------------------------------------------------------------


def check_ledger_category_totals(ledger_entries: list) -> list:
    """年間経費台帳を会計分類別に集計する(check が年間の全体像を報告するため)。"""
    findings = []
    if not ledger_entries:
        findings.append(
            Finding("info", "ledger_empty", "年間経費台帳(ledger-*.csv)にはまだ記録がありません。")
        )
        return findings

    totals = {"A": 0, "B": 0, "C": 0}
    counts = {"A": 0, "B": 0, "C": 0}
    for e in ledger_entries:
        if e.category in totals:
            totals[e.category] += e.amount
            counts[e.category] += 1
        else:
            findings.append(
                Finding(
                    "warn",
                    "ledger_category_unknown",
                    f"年間経費台帳に未知の会計分類 '{e.category}'（{e.description}）があります。",
                )
            )

    grand_total = sum(totals.values())
    findings.append(
        Finding(
            "info",
            "ledger_category_totals",
            "年間経費台帳 会計分類別の小計: "
            + " ／ ".join(f"{k}（{model.CATEGORY_JA[k]}）¥{totals[k]:,}（{counts[k]}件）" for k in "ABC")
            + f" ／ 合計 ¥{grand_total:,}（{len(ledger_entries)}件）",
        )
    )
    return findings


def check_category_a_reimbursement(ledger_entries: list) -> list:
    """分類A(校友会予算)は事務室から精算されるべき予算。settled=noのまま残っていれば
    部が立て替えたまま事務室へ請求できていないということなので、明示的に警告する。
    """
    findings = []
    unsettled_a = [e for e in ledger_entries if e.category == "A" and not e.is_settled]
    if not unsettled_a:
        findings.append(
            Finding("info", "category_a_reimbursement_ok", "分類A（校友会予算）の未精算の立替はありません。")
        )
        return findings

    total = sum(e.amount for e in unsettled_a)
    items_desc = "、".join(
        f"{e.date.month}/{e.date.day}[{e.event}]{e.vendor}¥{e.amount:,}（{e.payer}立替・{e.receipt}）"
        for e in unsettled_a
    )
    findings.append(
        Finding(
            "warn",
            "category_a_reimbursement_pending",
            f"分類A（校友会予算）の支出で未精算(settled=no)のものが{len(unsettled_a)}件、"
            f"合計¥{total:,}あります（{items_desc}）。"
            "分類Aは本来、部が立て替えても事務室から精算される予算です。"
            "精算(settled=yes)にしていないということは、まだ事務室から部へ返金されておらず、"
            "部が実質的に立て替えたままになっています。事務室へ予算請求する必要がある。",
        )
    )
    return findings


LEDGER_CHECKS = [
    check_ledger_category_totals,
    check_category_a_reimbursement,
]


def run_all_ledger(ledger_entries: list) -> list:
    findings = []
    for check in LEDGER_CHECKS:
        findings.extend(check(ledger_entries))
    return findings
