"""scripts.kaikei の単体テスト。pytest不要、`python3 tests/test_kaikei.py` で実行できる。"""
import contextlib
import io
import shutil
import sys
import tempfile
from argparse import Namespace
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.kaikei import model as m  # noqa: E402
from scripts.kaikei import checks  # noqa: E402
from scripts.kaikei import cli  # noqa: E402

PASS = 0
FAIL = 0


def check(label, condition):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"OK   {label}")
    else:
        FAIL += 1
        print(f"FAIL {label}")


def main():
    camp = m.load("2026-summer")

    # -- コアアルゴリズム: 食事レベルの在籍判定 -------------------------------

    full_timer = next(p for p in camp.attending_roster() if p.is_full_time)
    pres = camp.roster_presence(full_timer)
    check(
        f"全日参加者({full_timer.name})の宿泊は6泊",
        len(pres.lodging_nights) == 6,
    )
    check(f"全日参加者({full_timer.name})の昼食は7回", len(pres.lunches) == 7)
    check(f"全日参加者({full_timer.name})の朝食は6回", len(pres.breakfasts) == 6)
    check(f"全日参加者({full_timer.name})の夕食は6回", len(pres.dinners) == 6)

    yoshida = next(p for p in camp.attending_roster() if p.name == "吉田 青空")
    yoshida_pres = camp.roster_presence(yoshida)
    check("吉田青空(8/5夕食〜合流)の宿泊は2泊", len(yoshida_pres.lodging_nights) == 2)

    shiina = next(p for p in camp.attending_roster() if p.name == "椎名 薫")
    shiina_pres = camp.roster_presence(shiina)
    check("椎名薫(8/4夕食〜合流)の宿泊は3泊", len(shiina_pres.lodging_nights) == 3)

    # attends=no の生徒は除外されているか
    names_attending = {p.name for p in camp.attending_roster()}
    check("attends=noの生徒(塩貝蒼達)は除外されている", "塩貝 蒼達" not in names_attending)

    # -- 全体規約: 初日朝食なし・最終日夕食なし -------------------------------

    check("合宿初日は朝食なし", camp.meals_exist(camp.start)["breakfast"] is False)
    check("合宿最終日は夕食なし", camp.meals_exist(camp.end)["dinner"] is False)
    check("合宿最終日は朝食あり", camp.meals_exist(camp.end)["breakfast"] is True)
    check("合宿初日は夕食あり", camp.meals_exist(camp.start)["dinner"] is True)

    # -- 曜日ヘルパー ----------------------------------------------------------

    check("2026-08-01は土曜日", checks.weekday_ja(date(2026, 8, 1)) == "土")
    check("2026-08-07は金曜日", checks.weekday_ja(date(2026, 8, 7)) == "金")

    # -- 収入計算 ---------------------------------------------------------------

    inc = m.income(camp)
    full_select_totals = {
        l.total for l in inc["lines"] if l.is_full_time and l.person.role == "選手"
    }
    full_mgr_totals = {
        l.total for l in inc["lines"] if l.is_full_time and l.person.role == "マネージャー"
    }
    check("全日参加・選手の徴収額は一律¥79,090", full_select_totals == {79090})
    check("全日参加・マネージャーの徴収額は一律¥78,060", full_mgr_totals == {78060})

    yoshida_income = next(l for l in inc["lines"] if l.person.name == "吉田 青空")
    check("吉田青空の徴収額は¥33,110", yoshida_income.total == 33110)

    shiina_income = next(l for l in inc["lines"] if l.person.name == "椎名 薫")
    check("椎名薫の徴収額は¥42,250", shiina_income.total == 42250)

    check("収入合計は¥3,236,900", inc["total"] == 3236900)

    # -- 人数表 ------------------------------------------------------------------

    hc = m.headcount(camp)
    check("延べ宿泊人泊数は258人泊(名簿ベース)", hc["totals"]["lodging"] == 258)

    # -- 収支 -----------------------------------------------------------------

    bal = m.balance(camp)
    check("支出合計(ホテル+バス+小口)は¥3,054,465", bal["expense_total"] == 3054465)
    check("収支差額(残額)は¥182,435", bal["diff"] == 182435)

    # -- 立替金精算 ----------------------------------------------------------
    # (占部先生は夏合宿でも r009・r010 の2件を立替済み)

    settle = m.settlement(camp)
    check("畠山先生の未精算立替金は¥32,675", settle["by_payer"]["畠山"]["total"] == 32675)
    check("占部先生の未精算立替金は¥21,070", settle["by_payer"]["占部"]["total"] == 21070)
    check("立替金合計は¥53,745", settle["grand_total"] == 53745)

    # -- checks.py: 既知の論点が検出されるか ------------------------------------

    findings = checks.run_all(camp)
    submitted_mismatches = [
        f for f in findings if f.code == "submitted_headcount_mismatch"
    ]
    check("8/3の申告済み人数の不一致が検出される(既知の論点)", any("8/3" in f.message for f in submitted_mismatches))
    # 名簿ベースの人数とホテルへの申告人数は5日分ずれている。
    # 原因は(1)選手1名の在籍差(2)コーチの帯同日の未確定 で、いずれも未解決の論点。
    # 数が減ったらそれは解決したということなので、テストを更新すること。
    check("申告済み人数の不一致は5日分", len(submitted_mismatches) == 5)

    error_findings = [f for f in findings if f.severity == "error"]
    check("エラーレベルのfindingは無い(想定通りの残額のため)", len(error_findings) == 0)

    # 8/7は星野コーチ謝礼(r010)が計上されたため、支出記録の無い日は8/4・8/5の2日分になった。
    missing_receipt_findings = [f for f in findings if f.code == "missing_receipts"]
    check("支出記録の無い日が2日分検出される(8/4,8/5)", len(missing_receipt_findings) == 2)
    check(
        "支出記録の無い日の警告に前年度実績(36件・¥164,602)が入っている",
        all("雑費36件" in f.message and "¥164,602" in f.message for f in missing_receipt_findings),
    )

    misc_findings = [f for f in findings if f.code.startswith("misc_vs_prior_year")]
    check("雑費(分類C)対前年比の finding が1件ある", len(misc_findings) == 1)
    # 金額そのものは領収書が追加されるたびに変わるので、値ではなく
    # 「前年比50%未満なら warn になる」という判定の振る舞いを検証する。
    camp = m.load("2026-summer")
    this_year = sum(e.amount for e in camp.expenses if e.category == "C")
    prior_total = sum(r.amount for r in m.load_prior_year_misc())
    ratio = this_year / prior_total
    check(
        f"雑費(分類C)対前年比の判定が正しい(今年¥{this_year:,}/前年¥{prior_total:,}={ratio:.0%})",
        misc_findings[0].severity == ("warn" if ratio < 0.5 else "info")
        and f"¥{this_year:,}" in misc_findings[0].message
        and f"¥{prior_total:,}" in misc_findings[0].message,
    )

    # -- 前年度雑費台帳の読み込み -------------------------------------------

    test_prior_year_misc()

    # -- add / --settle (実データを汚さないよう一時ディレクトリで検証) -----------

    test_add_and_settle()

    # -- 年間経費台帳(ledger-2026.csv): 読み込み・合算精算・checkへの組み込み --

    test_load_ledger()
    test_combined_settlement()
    test_ledger_checks()

    # -- ledger / add --event / settle --all (一時ディレクトリで検証) -----------

    test_ledger_cli()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


def test_prior_year_misc():
    prior = m.prior_year_misc_summary()
    check("前年度(2025)雑費台帳は36件", prior["count"] == 36)
    check("前年度(2025)雑費台帳の合計は¥164,602", prior["total"] == 164602)
    check(
        "前年度雑費台帳の各行はdate/item/amountを持つ",
        all(isinstance(i.date, date) and isinstance(i.item, str) and isinstance(i.amount, int) for i in prior["items"]),
    )


def _run_cmd_add(ns: Namespace):
    """cli.cmd_add を実行し、(終了コード, 標準出力)を返す。"""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = cli.cmd_add(ns)
    return code, buf.getvalue()


def _add_ns(camp="2026-summer", **overrides):
    base = dict(
        camp=camp,
        date=None,
        vendor=None,
        description=None,
        amount=None,
        category=None,
        payer=None,
        receipt=None,
        note="",
        settle=None,
        event=None,
        all=False,
    )
    base.update(overrides)
    return Namespace(**base)


def test_add_and_settle():
    """model.append_expense / settle_payer_rows / cli.cmd_add を、一時コピーのCSVに対して検証する。

    real の data/rugby/expenses-2026-summer.csv には一切触れない
    (model.DATA_DIR を一時ディレクトリに差し替えて実行する)。
    """
    orig_data_dir = m.DATA_DIR
    tmpdir = Path(tempfile.mkdtemp(prefix="kaikei-test-"))
    try:
        # cli.cmd_add は model.load() で合宿期間・立替金の再計算も行うため、
        # 支出台帳だけでなく camp yml・roster も一時ディレクトリにコピーする。
        for name in ("expenses-2026-summer.csv", "camp-2026-summer.yml", "roster-2026.csv"):
            shutil.copy(orig_data_dir / name, tmpdir / name)
        m.DATA_DIR = tmpdir
        cli.model.DATA_DIR = tmpdir  # cli は `from . import model` で同じモジュールを参照している

        rows_before, fieldnames = m._read_expense_rows("2026-summer")
        check("テスト用コピーの初期行数は10行", len(rows_before) == 10)
        check(
            "既存の列順(date,vendor,description,amount,category,payer,settled,receipt,note)が保持されている",
            fieldnames == m.EXPENSE_FIELDNAMES,
        )

        # -- cli.cmd_add: 入力エラーはファイルを一切変更しない ----------------

        code, out = _run_cmd_add(_add_ns(date="2026-08-04", vendor="テスト店", description="テスト", amount=-5, category="C", payer="畠山"))
        check("金額が負ならexit 1", code == 1)
        check("金額が負ならエラーメッセージに'正の整数'を含む", "正の整数" in out)
        rows, _ = m._read_expense_rows("2026-summer")
        check("金額エラー後もファイルは10行のまま", len(rows) == 10)

        code, out = _run_cmd_add(_add_ns(date="2026-08-04", vendor="テスト店", description="テスト", amount=500, category="X", payer="畠山"))
        check("会計分類が不正ならexit 1", code == 1)
        rows, _ = m._read_expense_rows("2026-summer")
        check("会計分類エラー後もファイルは10行のまま", len(rows) == 10)

        code, out = _run_cmd_add(_add_ns(date="2026/08/04", vendor="テスト店", description="テスト", amount=500, category="C", payer="畠山"))
        check("日付形式が不正ならexit 1", code == 1)
        rows, _ = m._read_expense_rows("2026-summer")
        check("日付エラー後もファイルは10行のまま", len(rows) == 10)

        code, out = _run_cmd_add(_add_ns(date="2026-08-04", vendor="テスト店", description="テスト", amount=500, category="C", payer="   "))
        check("空のpayerならexit 1", code == 1)

        # -- cli.cmd_add: 正常な追加 --------------------------------------------

        code, out = _run_cmd_add(
            _add_ns(date="2026-08-04", vendor="テスト店", description="テスト品", amount=500, category="C", payer="畠山", note="単体テスト")
        )
        check("正常な追加はexit 0", code == 0)
        check("領収書番号が自動採番される(r011)", "r011" in out)
        check("追加行と未精算合計が出力に含まれる", "テスト品" in out and "畠山" in out)

        rows_after, _ = m._read_expense_rows("2026-summer")
        check("追加後は11行", len(rows_after) == 11)
        added_row = next(r for r in rows_after if r["receipt"] == "r011")
        check("追加行のsettledは既定でno", added_row["settled"] == "no")
        check("追加行の内容が正しい", added_row["date"] == "2026-08-04" and added_row["amount"] == "500")

        dates_sorted = [r["date"] for r in rows_after]
        check("日付でソートされている(昇順)", dates_sorted == sorted(dates_sorted))

        # -- model.append_expense: 領収書番号の重複はValueErrorでファイル未変更 ----

        raised = False
        try:
            m.append_expense(
                "2026-summer",
                {
                    "date": "2026-08-05",
                    "vendor": "x",
                    "description": "y",
                    "amount": 1,
                    "category": "C",
                    "payer": "畠山",
                    "settled": "no",
                    "receipt": "r011",
                    "note": "",
                },
            )
        except ValueError:
            raised = True
        check("重複する領収書番号を指定するとValueError", raised)
        rows_after_dup, _ = m._read_expense_rows("2026-summer")
        check("重複エラー後もファイルは11行のまま", len(rows_after_dup) == 11)

        # -- 期間外の日付は警告のみでブロックしない ------------------------------

        code, out = _run_cmd_add(
            _add_ns(date="2026-07-15", vendor="テスト店", description="期間外テスト", amount=100, category="C", payer="畠山", receipt="r999")
        )
        check("期間外の日付でもexit 0(警告のみ)", code == 0)
        check("期間外の日付は警告文言を含む", "合宿期間" in out and "外です" in out)
        rows_after_oor, _ = m._read_expense_rows("2026-summer")
        check("期間外の日付でも追加される(12行)", len(rows_after_oor) == 12)

        # -- --settle: 指定した payer の未精算行がすべて yes になる ---------------

        before_settle = m.settlement(m.load("2026-summer"))
        check("settle前の畠山の未精算額には追加分が含まれる", before_settle["by_payer"]["畠山"]["total"] == 32675 + 500 + 100)

        code, out = _run_cmd_add(_add_ns(settle="畠山"))
        check("--settle 畠山 はexit 0", code == 0)
        check("--settle の出力に精算額が含まれる", "33,275" in out or "33275" in out)

        after_settle_rows, _ = m._read_expense_rows("2026-summer")
        hatakeyama_unsettled = [r for r in after_settle_rows if r["payer"] == "畠山" and r["settled"].strip().lower() != "yes"]
        check("--settle 後は畠山の未精算行が0件", len(hatakeyama_unsettled) == 0)
        occube_unsettled = [r for r in after_settle_rows if r["payer"] == "占部" and r["settled"].strip().lower() != "yes"]
        check("--settle 畠山 は占部の行に影響しない", len(occube_unsettled) == 2)

        code, out = _run_cmd_add(_add_ns(settle="畠山"))
        check("再度 --settle しても対象0件でexit 0", code == 0)
        check("再度 --settle した旨のメッセージが出る", "未精算の立替金はありません" in out)

        code, out = _run_cmd_add(_add_ns(settle="  "))
        check("空文字の --settle はexit 1", code == 1)

    finally:
        m.DATA_DIR = orig_data_dir
        cli.model.DATA_DIR = orig_data_dir
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_load_ledger():
    """model.load_ledger: 実データの読み込みと、存在しない年度への耐性。"""
    entries = m.load_ledger("2026")
    check("年間経費台帳(2026)は2件", len(entries) == 2)
    check(
        "各行はdate/event/amount/categoryを持つ",
        all(
            isinstance(e.date, date) and isinstance(e.event, str) and isinstance(e.amount, int) and e.category in ("A", "B", "C")
            for e in entries
        ),
    )
    y001 = next(e for e in entries if e.receipt == "y001")
    check("y001は秋季大会・分類A・占部立替・¥12,000", y001.event == "秋季大会" and y001.category == "A" and y001.payer == "占部" and y001.amount == 12000)
    check("y001は未精算(settled=no)", y001.is_settled is False)

    # 存在しない年度のファイルはエラーにせず空リストを返す
    missing = m.load_ledger("1999")
    check("存在しない年度のledgerはエラーにならず空リスト", missing == [])


def test_combined_settlement():
    """model.settlement/ledger_settlement/combined_settlement: 夏合宿と年間経費台帳の合算。"""
    camp = m.load("2026-summer")
    camp_settle = m.settlement(camp)

    ledger_entries = m.load_ledger("2026")
    ledger_settle = m.ledger_settlement(ledger_entries)
    check("年間経費台帳の未精算立替は占部のみ", set(ledger_settle["by_payer"]) == {"占部"})
    check("年間経費台帳の占部の未精算額は¥13,624", ledger_settle["by_payer"]["占部"]["total"] == 13624)
    check("年間経費台帳の未精算合計は¥13,624", ledger_settle["grand_total"] == 13624)

    combined = m.combined_settlement(camp_id="2026-summer")
    check("combined_settlementのfiscal_yearは2026", combined["fiscal_year"] == "2026")
    check("combined_settlementのcampはsettlement(camp)と一致", combined["camp"]["grand_total"] == camp_settle["grand_total"])
    check("combined_settlementのledgerはledger_settlement()と一致", combined["ledger"]["grand_total"] == ledger_settle["grand_total"])

    check("合算: 畠山は夏合宿分のみ¥32,675", combined["combined"]["畠山"]["total"] == 32675 and combined["combined"]["畠山"]["ledger"] == 0)
    check(
        "合算: 占部は夏合宿¥21,070＋年間経費¥13,624＝¥34,694",
        combined["combined"]["占部"]["camp"] == 21070
        and combined["combined"]["占部"]["ledger"] == 13624
        and combined["combined"]["占部"]["total"] == 34694,
    )
    check(
        "合算の総合計は夏合宿+年間経費台帳の合計¥67,369",
        combined["grand_total"] == combined["camp"]["grand_total"] + combined["ledger"]["grand_total"] == 67369,
    )

    # settle(camp)そのものの挙動(camp限定)は変わっていないことの確認
    check("settle(camp)は従来どおりcampのみを集計する(年間経費台帳は含まない)", "占部" in camp_settle["by_payer"] and camp_settle["by_payer"]["占部"]["total"] == 21070)


def test_ledger_checks():
    """checks.check_category_a_reimbursement / check_ledger_category_totals / run_all_ledger。"""
    ledger_entries = m.load_ledger("2026")

    findings = checks.run_all_ledger(ledger_entries)
    a_findings = [f for f in findings if f.code == "category_a_reimbursement_pending"]
    check("分類Aの未精算立替がwarnとして1件検出される", len(a_findings) == 1)
    check("警告のseverityはwarn", a_findings[0].severity == "warn")
    check("警告に未精算合計¥12,000が含まれる", "¥12,000" in a_findings[0].message)
    check("警告に事務室への請求が必要である旨が明記されている", "事務室へ予算請求する必要がある" in a_findings[0].message)

    totals_findings = [f for f in findings if f.code == "ledger_category_totals"]
    check("年間経費台帳の分類別小計findingが1件ある", len(totals_findings) == 1)
    check(
        "年間経費台帳の分類別小計にA/B/Cそれぞれの金額が含まれる",
        "¥12,000" in totals_findings[0].message and "¥1,624" in totals_findings[0].message and "¥0" in totals_findings[0].message,
    )

    # 全件精算済みなら分類Aのwarnはinfoになる
    settled_entries = [
        m.LedgerEntry(
            date=e.date, event=e.event, vendor=e.vendor, description=e.description, amount=e.amount,
            category=e.category, payer=e.payer, settled="yes", receipt=e.receipt, note=e.note,
        )
        for e in ledger_entries
    ]
    settled_findings = checks.check_category_a_reimbursement(settled_entries)
    check("分類Aがすべて精算済みならinfo(OK)になる", settled_findings[0].severity == "info" and settled_findings[0].code == "category_a_reimbursement_ok")

    # ledgerが空でもエラーにならない
    empty_findings = checks.run_all_ledger([])
    check("年間経費台帳が空でもrun_all_ledgerはエラーにならない(ledger_empty)", any(f.code == "ledger_empty" for f in empty_findings))

    # cmd_check(camp) が年間経費台帳のチェックも含むことを確認
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        cli.cmd_check("2026-summer")
    out = buf.getvalue()
    check("checkコマンドの出力に分類Aの事務室請求の警告が含まれる", "事務室へ予算請求する必要がある" in out)
    check("checkコマンドの出力に年間経費台帳の分類別小計が含まれる", "年間経費台帳 会計分類別の小計" in out)


def test_ledger_cli():
    """cli.cmd_add(--event) / cli.cmd_ledger / cli.cmd_settle(--all) を一時コピーで検証する。

    real の data/rugby/ledger-2026.csv・expenses-2026-summer.csv には一切触れない。
    """
    orig_data_dir = m.DATA_DIR
    tmpdir = Path(tempfile.mkdtemp(prefix="kaikei-ledger-test-"))
    try:
        for name in ("expenses-2026-summer.csv", "camp-2026-summer.yml", "roster-2026.csv", "ledger-2026.csv"):
            shutil.copy(orig_data_dir / name, tmpdir / name)
        m.DATA_DIR = tmpdir
        cli.model.DATA_DIR = tmpdir

        # -- add --event: 年間経費台帳へ追加され、合宿台帳(expenses-*.csv)は変わらない ---

        expense_rows_before, _ = m._read_expense_rows("2026-summer")

        code, out = _run_cmd_add(
            _add_ns(date="2026-10-01", vendor="テスト業者", description="テスト行事費", amount=3000, category="C", payer="畠山", event="新人戦")
        )
        check("add --event はexit 0", code == 0)
        check("add --event の領収書番号はy003(yNNN採番)", "y003" in out)
        check("add --event の出力に年間経費台帳向けの文言が含まれる", "年間経費台帳" in out)

        expense_rows_after, _ = m._read_expense_rows("2026-summer")
        check("add --event は合宿台帳(expenses-*.csv)を変更しない", expense_rows_after == expense_rows_before)

        ledger_rows, ledger_fieldnames = m._read_ledger_rows("2026")
        check("add --event 後の年間経費台帳は3行", len(ledger_rows) == 3)
        check(
            "年間経費台帳の列順が保持されている",
            ledger_fieldnames == m.LEDGER_FIELDNAMES,
        )
        added = next(r for r in ledger_rows if r["receipt"] == "y003")
        check("追加行のeventが正しい", added["event"] == "新人戦")
        check("追加行のsettledは既定でno", added["settled"] == "no")

        # -- add --event: 必須項目欠落やカテゴリ不正はエラーでファイル未変更 --------

        code, out = _run_cmd_add(_add_ns(date="2026-10-01", vendor="x", description="y", amount=100, category="C", payer="畠山"))
        check("--event を指定しない通常のaddは従来どおり合宿台帳に入る(exit 0)", code == 0)
        ledger_rows_unchanged, _ = m._read_ledger_rows("2026")
        check("--event なしのaddは年間経費台帳を変更しない(3行のまま)", len(ledger_rows_unchanged) == 3)

        code, out = _run_cmd_add(
            _add_ns(date="2026-10-02", vendor="x", description="y", amount=100, category="Z", payer="畠山", event="新人戦")
        )
        check("add --event でも会計分類が不正ならexit 1", code == 1)
        ledger_rows_after_err, _ = m._read_ledger_rows("2026")
        check("会計分類エラー後も年間経費台帳は3行のまま", len(ledger_rows_after_err) == 3)

        code, out = _run_cmd_add(
            _add_ns(date="2026-10-02", vendor="x", description="y", amount=100, category="C", payer="畠山", event="   ")
        )
        check("--event が空白のみならexit 1", code == 1)

        # -- cmd_ledger: 分類別グルーピングとフィルタ -----------------------------

        from argparse import Namespace as _NS

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            cli.cmd_ledger(_NS(category=None, event=None, fiscal_year="2026"))
        out = buf.getvalue()
        check("ledgerコマンドの出力に分類Aの小計が含まれる", "分類A" in out and "¥12,000" in out)
        check("ledgerコマンドの出力に合計が含まれる", "合計" in out)

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = cli.cmd_ledger(_NS(category="A", event=None, fiscal_year="2026"))
        out = buf.getvalue()
        check("ledger --category A は分類Aのみを表示する", "分類A" in out and "分類B" not in out and "分類C" not in out)
        check("ledger --category A はexit 0", code == 0)

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            cli.cmd_ledger(_NS(category=None, event="新人戦", fiscal_year="2026"))
        out = buf.getvalue()
        check("ledger --event 新人戦 は該当行のみ表示する", "テスト業者" in out and "東京都高体連" not in out)

        # -- settle --all: 合宿＋年間経費台帳を合算表示する(表示のみ・ファイル未変更) --

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = cli.cmd_settle(_NS(camp="2026-summer", all=True))
        out = buf.getvalue()
        check("settle --all はexit 0", code == 0)
        check("settle --all の出力に夏合宿の見出しが含まれる", "夏合宿" in out)
        check("settle --all の出力に年間経費台帳の見出しが含まれる", "年間経費台帳" in out)
        check("settle --all の出力に合算の見出しが含まれる", "合算" in out)
        check("settle --all の出力に占部の合算額¥34,694が含まれる", "34,694" in out)

        # -- add --settle --all: 両ファイルの指定payerの未精算行をすべてyesにする -----

        code, out = _run_cmd_add(_add_ns(settle="占部", all=True))
        check("add --settle --all はexit 0", code == 0)
        check("add --settle --all の出力に夏合宿分の精算メッセージが含まれる", "夏合宿" in out)
        check("add --settle --all の出力に年間経費台帳分の精算メッセージが含まれる", "年間経費台帳" in out)

        expense_rows_final, _ = m._read_expense_rows("2026-summer")
        occube_unsettled_final = [r for r in expense_rows_final if r["payer"] == "占部" and r["settled"].strip().lower() != "yes"]
        check("add --settle --all 後は夏合宿の占部の未精算行が0件", len(occube_unsettled_final) == 0)

        ledger_rows_final, _ = m._read_ledger_rows("2026")
        occube_ledger_unsettled_final = [r for r in ledger_rows_final if r["payer"] == "占部" and r["settled"].strip().lower() != "yes"]
        check("add --settle --all 後は年間経費台帳の占部の未精算行が0件", len(occube_ledger_unsettled_final) == 0)

    finally:
        m.DATA_DIR = orig_data_dir
        cli.model.DATA_DIR = orig_data_dir
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
