"""データ読み込みと会計計算のコアロジック。

食事レベルの在籍判定（コアアルゴリズム）
---------------------------------------
1日の食事は 朝食(0) < 昼食(1) < 夕食(2) の順序を持つ。
「位置」を (日付, 食事インデックス) のタプルで表す。

- 全体規約: 合宿初日は朝食なし、合宿最終日は夕食なし。
- 各人の在籍区間は
    開始位置 = (join_date または合宿初日, join_meal または '昼食')
    終了位置 = (leave_date または合宿最終日, leave_meal または '昼食')
  で表される。
- ある(日付, 食事)にその人がカウントされるのは、
    開始位置 <= (日付, 食事) <= 終了位置  かつ  その日にその食事が存在する
  ときだけ。
- ある夜 D の宿泊は、その人が D の夕食にカウントされるとき、かつそのときに限りカウントする。
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import yaml

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "rugby"

MEAL_NAMES = ("breakfast", "lunch", "dinner")
MEAL_JA = {"breakfast": "朝食", "lunch": "昼食", "dinner": "夕食"}
MEAL_ORDER = {"breakfast": 0, "lunch": 1, "dinner": 2}


def _parse_date(value) -> Optional[date]:
    """YAML/CSVの日付値をdateに変換する。空文字・Noneのときは None を返す。"""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    value = str(value).strip()
    if not value:
        return None
    return date.fromisoformat(value)


def _parse_claimed(value) -> str:
    """CSVの claimed 列を正規化する。空文字・None・未知の値は 'n-a' として扱う
    (claimed列を持たない古いファイルでも読み込めるようにするため)。
    """
    value = (value or "").strip().lower()
    if value in ("yes", "no", "n-a"):
        return value
    return "n-a"


# ---------------------------------------------------------------------------
# データクラス
# ---------------------------------------------------------------------------


@dataclass
class GroundFee:
    unit: int
    count: int


@dataclass
class Adult:
    name: str
    role: str
    from_date: date
    from_meal: str
    to_date: date
    to_meal: str


@dataclass
class RosterPerson:
    grade: str
    klass: str
    name: str
    role: str
    attends: str
    join_date: Optional[date]
    join_meal: Optional[str]
    leave_date: Optional[date]
    leave_meal: Optional[str]

    @property
    def is_full_time(self) -> bool:
        return self.join_date is None and self.leave_date is None


@dataclass
class Expense:
    date: date
    vendor: str
    description: str
    amount: int
    category: str
    payer: str
    settled: str
    receipt: str
    note: str
    claimed: str = "n-a"

    @property
    def is_settled(self) -> bool:
        """立替者(payer)へ部からお金が返っているか。事務室への請求(claimed)とは別の話。"""
        return self.settled.strip().lower() == "yes"

    @property
    def is_claimed(self) -> bool:
        """事務室へ請求して部にお金が戻っているか。分類A以外は 'n-a' なので常にFalse。"""
        return self.claimed.strip().lower() == "yes"


@dataclass
class PriorYearMiscItem:
    date: date
    item: str
    amount: int


@dataclass
class LedgerEntry:
    """年間経費台帳(ledger-<年度>.csv)の1行。合宿以外の部の支出。"""

    date: date
    event: str
    vendor: str
    description: str
    amount: int
    category: str
    payer: str
    settled: str
    receipt: str
    note: str
    claimed: str = "n-a"

    @property
    def is_settled(self) -> bool:
        """立替者(payer)へ部からお金が返っているか。事務室への請求(claimed)とは別の話。"""
        return self.settled.strip().lower() == "yes"

    @property
    def is_claimed(self) -> bool:
        """事務室へ請求して部にお金が戻っているか。分類A以外は 'n-a' なので常にFalse。"""
        return self.claimed.strip().lower() == "yes"


CATEGORY_JA = {"A": "校友会予算", "B": "父母会予算", "C": "都度徴収"}


@dataclass
class Presence:
    """ある一人について、合宿期間中に在籍が認められる食事・宿泊日の集合。"""

    breakfasts: set = field(default_factory=set)
    lunches: set = field(default_factory=set)
    dinners: set = field(default_factory=set)

    @property
    def lodging_nights(self) -> set:
        # 夜Dの宿泊は、その人がDの夕食にカウントされるとき、かつそのときに限る。
        return set(self.dinners)

    @property
    def days_present(self) -> set:
        return self.breakfasts | self.lunches | self.dinners


@dataclass
class Camp:
    id: str
    name: str
    venue: str
    start: date
    end: date
    meal_rule: str
    late_join_meal: str
    special_days: dict
    hotel_rates: dict
    ground_fees: list
    adults: list
    submitted_headcount: dict
    hotel_invoice_total: int
    bus: dict
    collection: dict
    roster: list
    expenses: list

    # -- 日付・食事の存在判定 -------------------------------------------------

    def date_range(self) -> list:
        days = []
        d = self.start
        while d <= self.end:
            days.append(d)
            d += timedelta(days=1)
        return days

    def meals_exist(self, d: date) -> dict:
        """その日に朝食・昼食・夕食がそれぞれ存在するか。"""
        return {
            "breakfast": d != self.start,
            "lunch": True,
            "dinner": d != self.end,
        }

    # -- 在籍計算 --------------------------------------------------------------

    def _window(self, join_date, join_meal, leave_date, leave_meal):
        start_date = join_date or self.start
        start_meal = join_meal or "lunch"
        end_date = leave_date or self.end
        end_meal = leave_meal or "lunch"
        start_pos = (start_date, MEAL_ORDER[start_meal])
        end_pos = (end_date, MEAL_ORDER[end_meal])
        return start_pos, end_pos

    def presence(self, join_date, join_meal, leave_date, leave_meal) -> Presence:
        start_pos, end_pos = self._window(join_date, join_meal, leave_date, leave_meal)
        pres = Presence()
        bucket = {"breakfast": pres.breakfasts, "lunch": pres.lunches, "dinner": pres.dinners}
        for d in self.date_range():
            exists = self.meals_exist(d)
            for meal in MEAL_NAMES:
                if not exists[meal]:
                    continue
                pos = (d, MEAL_ORDER[meal])
                if start_pos <= pos <= end_pos:
                    bucket[meal].add(d)
        return pres

    def roster_presence(self, person: RosterPerson) -> Presence:
        return self.presence(person.join_date, person.join_meal, person.leave_date, person.leave_meal)

    def adult_presence(self, adult: Adult) -> Presence:
        return self.presence(adult.from_date, adult.from_meal, adult.to_date, adult.to_meal)

    def attending_roster(self):
        return [p for p in self.roster if p.attends.strip().lower() == "yes"]


# ---------------------------------------------------------------------------
# 読み込み
# ---------------------------------------------------------------------------


def _load_camp_yaml(camp_id: str) -> Camp:
    path = DATA_DIR / f"camp-{camp_id}.yml"
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    adults = []
    for a in raw.get("adults", []):
        adults.append(
            Adult(
                name=a["name"],
                role=a["role"],
                from_date=_parse_date(a.get("from")),
                from_meal=a.get("from_meal") or "lunch",
                to_date=_parse_date(a.get("to")),
                to_meal=a.get("to_meal") or "lunch",
            )
        )

    ground_fees = [GroundFee(unit=g["unit"], count=g["count"]) for g in raw.get("ground_fees", [])]

    special_days = {k: _parse_date(v) for k, v in raw.get("special_days", {}).items()}
    submitted_headcount = {
        _parse_date(k): v for k, v in raw.get("submitted_headcount", {}).items()
    }

    return Camp(
        id=raw["id"],
        name=raw["name"],
        venue=raw["venue"],
        start=_parse_date(raw["start"]),
        end=_parse_date(raw["end"]),
        meal_rule=raw.get("meal_rule", "stay3"),
        late_join_meal=raw.get("late_join_meal", "dinner"),
        special_days=special_days,
        hotel_rates=raw["hotel_rates"],
        ground_fees=ground_fees,
        adults=adults,
        submitted_headcount=submitted_headcount,
        hotel_invoice_total=raw["hotel_invoice_total"],
        bus=raw["bus"],
        collection=raw["collection"],
        roster=[],
        expenses=[],
    )


def _load_roster(year: str) -> list:
    path = DATA_DIR / f"roster-{year}.csv"
    people = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            people.append(
                RosterPerson(
                    grade=row["grade"],
                    klass=row["class"],
                    name=row["name"],
                    role=row["role"],
                    attends=row["attends"],
                    join_date=_parse_date(row["join_date"]),
                    join_meal=row["join_meal"].strip() or None if row["join_meal"] else None,
                    leave_date=_parse_date(row["leave_date"]),
                    leave_meal=row["leave_meal"].strip() or None if row["leave_meal"] else None,
                )
            )
    return people


def _load_expenses(camp_id: str) -> list:
    path = DATA_DIR / f"expenses-{camp_id}.csv"
    rows = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rows.append(
                Expense(
                    date=_parse_date(row["date"]),
                    vendor=row["vendor"],
                    description=row["description"],
                    amount=int(row["amount"]),
                    category=row["category"].strip(),
                    payer=row["payer"].strip(),
                    settled=row["settled"].strip(),
                    receipt=row["receipt"].strip(),
                    note=row["note"].strip(),
                    claimed=_parse_claimed(row.get("claimed")),
                )
            )
    return rows


def load(camp_id: str = "2026-summer") -> Camp:
    camp = _load_camp_yaml(camp_id)
    year = camp_id.split("-")[0]
    camp.roster = _load_roster(year)
    camp.expenses = _load_expenses(camp_id)
    return camp


def load_prior_year_misc(year: str = "2025") -> list:
    """前年度の雑費台帳（data/rugby/prior-year-misc-<year>.csv）を読み込む。"""
    path = DATA_DIR / f"prior-year-misc-{year}.csv"
    items = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            items.append(
                PriorYearMiscItem(
                    date=_parse_date(row["date"]),
                    item=row["item"],
                    amount=int(row["amount"]),
                )
            )
    return items


def prior_year_misc_summary(year: str = "2025") -> dict:
    items = load_prior_year_misc(year)
    return {"year": year, "items": items, "count": len(items), "total": sum(i.amount for i in items)}


def load_ledger(fiscal_year: str = "2026") -> list:
    """年間経費台帳(ledger-<年度>.csv)を読み込む。合宿費以外の部の支出(秋季大会・文化祭等)。

    ファイルが存在しない場合はエラーにせず空リストを返す(まだ経費が発生していない年度もあるため)。
    """
    path = DATA_DIR / f"ledger-{fiscal_year}.csv"
    if not path.exists():
        return []
    entries = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            entries.append(
                LedgerEntry(
                    date=_parse_date(row["date"]),
                    event=row.get("event", "").strip(),
                    vendor=row["vendor"],
                    description=row["description"],
                    amount=int(row["amount"]),
                    category=row["category"].strip(),
                    payer=row["payer"].strip(),
                    settled=row["settled"].strip(),
                    receipt=row["receipt"].strip(),
                    note=row["note"].strip(),
                    claimed=_parse_claimed(row.get("claimed")),
                )
            )
    return entries


# ---------------------------------------------------------------------------
# 支出台帳(CSV)の追記・精算フラグ更新
# ---------------------------------------------------------------------------

EXPENSE_FIELDNAMES = [
    "date", "vendor", "description", "amount", "category", "payer", "settled", "receipt", "note", "claimed",
]


def claimed_default(category: str) -> str:
    """新規に行を追加するときの claimed の既定値。分類Aは事務室への請求が必要なので'no'、
    それ以外(B/C)は請求そのものが発生しないので'n-a'。
    """
    return "no" if category == "A" else "n-a"


def expenses_csv_path(camp_id: str) -> Path:
    return DATA_DIR / f"expenses-{camp_id}.csv"


def _read_expense_rows(camp_id: str):
    """支出台帳を文字列のままdictの行リストとして読み込む(列順を保持するため)。"""
    path = expenses_csv_path(camp_id)
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    return rows, fieldnames


def _write_expense_rows(camp_id: str, rows: list, fieldnames: list) -> None:
    path = expenses_csv_path(camp_id)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _receipt_sort_key(receipt: str):
    receipt = (receipt or "").strip()
    if receipt.startswith("r") and receipt[1:].isdigit():
        return (0, int(receipt[1:]), receipt)
    return (1, 0, receipt)


def next_receipt_id(rows: list) -> str:
    """既存の rNNN のうち最大の番号の次を返す。"""
    max_n = 0
    for row in rows:
        rid = (row.get("receipt") or "").strip()
        if rid.startswith("r") and rid[1:].isdigit():
            max_n = max(max_n, int(rid[1:]))
    return f"r{max_n + 1:03d}"


def append_expense(camp_id: str, new_row: dict) -> dict:
    """支出台帳に1行追加する。日付→領収書番号の順でソートして書き戻す。

    new_row["receipt"] が空なら次の空き番号を自動採番する。既存と重複する
    番号が指定された場合は ValueError を送出し、ファイルには一切触れない。
    """
    rows, fieldnames = _read_expense_rows(camp_id)
    existing_receipts = {(r.get("receipt") or "").strip() for r in rows}

    receipt = (new_row.get("receipt") or "").strip()
    if not receipt:
        receipt = next_receipt_id(rows)
    elif receipt in existing_receipts:
        raise ValueError(f"領収書番号 '{receipt}' は既に使われています。")

    row = dict(new_row)
    row["receipt"] = receipt
    row = {k: str(row.get(k, "")) for k in fieldnames}

    rows.append(row)
    rows.sort(key=lambda r: (r["date"], _receipt_sort_key(r["receipt"])))
    _write_expense_rows(camp_id, rows, fieldnames)
    return row


def settle_payer_rows(camp_id: str, payer: str) -> dict:
    """指定した立替者の未精算行(settled=no)をすべて yes にして書き戻す。"""
    rows, fieldnames = _read_expense_rows(camp_id)
    settled_items = []
    for r in rows:
        if r.get("payer", "").strip() == payer and r.get("settled", "").strip().lower() != "yes":
            r["settled"] = "yes"
            settled_items.append(r)
    if settled_items:
        _write_expense_rows(camp_id, rows, fieldnames)
    total = sum(int(r["amount"]) for r in settled_items)
    return {"items": settled_items, "total": total}


# ---------------------------------------------------------------------------
# 年間経費台帳(CSV)の追記・精算フラグ更新
# ---------------------------------------------------------------------------

LEDGER_FIELDNAMES = [
    "date", "event", "vendor", "description", "amount", "category", "payer", "settled", "receipt", "note", "claimed",
]


def ledger_csv_path(fiscal_year: str) -> Path:
    return DATA_DIR / f"ledger-{fiscal_year}.csv"


def _read_ledger_rows(fiscal_year: str):
    """年間経費台帳を文字列のままdictの行リストとして読み込む。ファイルが無ければ空。"""
    path = ledger_csv_path(fiscal_year)
    if not path.exists():
        return [], LEDGER_FIELDNAMES
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or LEDGER_FIELDNAMES
        rows = list(reader)
    return rows, fieldnames


def _write_ledger_rows(fiscal_year: str, rows: list, fieldnames: list) -> None:
    path = ledger_csv_path(fiscal_year)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _ledger_receipt_sort_key(receipt: str):
    receipt = (receipt or "").strip()
    if receipt.startswith("y") and receipt[1:].isdigit():
        return (0, int(receipt[1:]), receipt)
    return (1, 0, receipt)


def next_ledger_receipt_id(rows: list) -> str:
    """既存の yNNN のうち最大の番号の次を返す(合宿の rNNN とは別採番)。"""
    max_n = 0
    for row in rows:
        rid = (row.get("receipt") or "").strip()
        if rid.startswith("y") and rid[1:].isdigit():
            max_n = max(max_n, int(rid[1:]))
    return f"y{max_n + 1:03d}"


def append_ledger_entry(fiscal_year: str, new_row: dict) -> dict:
    """年間経費台帳に1行追加する。日付→領収書番号の順でソートして書き戻す。

    new_row["receipt"] が空なら次の空き番号(yNNN)を自動採番する。既存と重複する
    番号が指定された場合は ValueError を送出し、ファイルには一切触れない。
    ファイルが存在しない場合はヘッダー付きで新規作成する。
    """
    rows, fieldnames = _read_ledger_rows(fiscal_year)
    existing_receipts = {(r.get("receipt") or "").strip() for r in rows}

    receipt = (new_row.get("receipt") or "").strip()
    if not receipt:
        receipt = next_ledger_receipt_id(rows)
    elif receipt in existing_receipts:
        raise ValueError(f"領収書番号 '{receipt}' は既に使われています。")

    row = dict(new_row)
    row["receipt"] = receipt
    row = {k: str(row.get(k, "")) for k in fieldnames}

    rows.append(row)
    rows.sort(key=lambda r: (r["date"], _ledger_receipt_sort_key(r["receipt"])))
    _write_ledger_rows(fiscal_year, rows, fieldnames)
    return row


def settle_ledger_rows(fiscal_year: str, payer: str) -> dict:
    """年間経費台帳で指定した立替者の未精算行(settled=no)をすべて yes にして書き戻す。"""
    rows, fieldnames = _read_ledger_rows(fiscal_year)
    settled_items = []
    for r in rows:
        if r.get("payer", "").strip() == payer and r.get("settled", "").strip().lower() != "yes":
            r["settled"] = "yes"
            settled_items.append(r)
    if settled_items:
        _write_ledger_rows(fiscal_year, rows, fieldnames)
    total = sum(int(r["amount"]) for r in settled_items)
    return {"items": settled_items, "total": total}


def claim_ledger_row(fiscal_year: str, receipt_id: str) -> dict:
    """年間経費台帳の指定した行を「事務室へ請求して部にお金が戻った(claimed=yes)」にする。

    これは立替者(payer)への返金(settled)とは別の操作。分類A(校友会予算)以外の行、
    存在しない領収書番号、既にclaimed=yesの行はValueErrorを送出し、ファイルには
    一切触れない。claimed列を持たない古い形式のファイルでも動作するよう、
    書き戻し前に列を補う。
    """
    rows, fieldnames = _read_ledger_rows(fiscal_year)
    if "claimed" not in fieldnames:
        fieldnames = list(fieldnames) + ["claimed"]
    for r in rows:
        if not (r.get("claimed") or "").strip():
            r["claimed"] = "n-a"

    receipt_id = (receipt_id or "").strip()
    row = next((r for r in rows if (r.get("receipt") or "").strip() == receipt_id), None)
    if row is None:
        raise ValueError(
            f"領収書番号 '{receipt_id}' は年間経費台帳(ledger-{fiscal_year}.csv)に見つかりません。"
        )

    category = row.get("category", "").strip()
    if category != "A":
        raise ValueError(
            f"{receipt_id} は分類{category or '不明'}の行です。"
            "claimed(事務室への請求)は分類A（校友会予算）の行にのみ使います。"
        )

    if (row.get("claimed") or "").strip().lower() == "yes":
        raise ValueError(f"{receipt_id} は既に事務室へ請求済み(claimed=yes)です。")

    row["claimed"] = "yes"
    _write_ledger_rows(fiscal_year, rows, fieldnames)
    return row


# ---------------------------------------------------------------------------
# 計算: 人数表
# ---------------------------------------------------------------------------


def headcount(camp: Camp) -> dict:
    """日付ごとの {breakfast, lunch, dinner, lodging, present} 人数（存在しない食事は None）。

    present は「その日いずれかの食事にカウントされる人数」＝現地在籍人数。
    畠山先生がホテルへ申告する日別人数（submitted_headcount）はこの定義に対応する。
    """

    presences = [camp.roster_presence(p) for p in camp.attending_roster()]
    presences += [camp.adult_presence(a) for a in camp.adults]

    per_date = {}
    for d in camp.date_range():
        exists = camp.meals_exist(d)
        bf = sum(1 for pres in presences if d in pres.breakfasts) if exists["breakfast"] else None
        lu = sum(1 for pres in presences if d in pres.lunches) if exists["lunch"] else None
        di = sum(1 for pres in presences if d in pres.dinners) if exists["dinner"] else None
        lodging = di  # 宿泊人数 = その夜の夕食人数（夕食が存在しない日は宿泊もなし）
        present = sum(1 for pres in presences if d in pres.days_present)
        per_date[d] = {"breakfast": bf, "lunch": lu, "dinner": di, "lodging": lodging, "present": present}

    totals = {
        "breakfast": sum(v["breakfast"] for v in per_date.values() if v["breakfast"] is not None),
        "lunch": sum(v["lunch"] for v in per_date.values() if v["lunch"] is not None),
        "dinner": sum(v["dinner"] for v in per_date.values() if v["dinner"] is not None),
        "lodging": sum(v["lodging"] for v in per_date.values() if v["lodging"] is not None),
    }
    return {"per_date": per_date, "totals": totals}


def fmt_meal(v) -> str:
    return "－" if v is None else str(v)


# ---------------------------------------------------------------------------
# 計算: ホテル請求の再現
# ---------------------------------------------------------------------------


def hotel_bill(camp: Camp) -> dict:
    hc = headcount(camp)
    person_nights = hc["totals"]["lodging"]

    items = []
    rates = camp.hotel_rates

    items.append(
        {"name": "1泊3食", "unit": rates["stay3"], "qty": person_nights, "amount": rates["stay3"] * person_nights}
    )

    extra_lunch_day = camp.special_days.get("extra_lunch")
    extra_lunch_qty = hc["per_date"][extra_lunch_day]["lunch"] if extra_lunch_day else 0
    items.append(
        {
            "name": "増昼食",
            "unit": rates["lunch"],
            "qty": extra_lunch_qty,
            "amount": rates["lunch"] * extra_lunch_qty,
        }
    )

    bbq_day = camp.special_days.get("bbq")
    bbq_qty = hc["per_date"][bbq_day]["dinner"] if bbq_day else 0
    items.append({"name": "BBQ", "unit": rates["bbq"], "qty": bbq_qty, "amount": rates["bbq"] * bbq_qty})

    for gf in camp.ground_fees:
        items.append(
            {
                "name": "グラウンド使用料",
                "unit": gf.unit,
                "qty": gf.count,
                "amount": gf.unit * gf.count,
            }
        )

    total = sum(i["amount"] for i in items)
    return {"items": items, "total": total, "person_nights": person_nights}


# ---------------------------------------------------------------------------
# 計算: 収入（徴収額）
# ---------------------------------------------------------------------------


@dataclass
class IncomeLine:
    person: RosterPerson
    is_full_time: bool
    nights: int
    days_present: int
    lodging_meals: int
    extra_lunch: int
    bbq: int
    transport: int
    misc: int
    ground: int
    reserve: int
    coach_fee: int

    @property
    def total(self) -> int:
        return (
            self.lodging_meals
            + self.extra_lunch
            + self.bbq
            + self.transport
            + self.misc
            + self.ground
            + self.reserve
            + self.coach_fee
        )


def income(camp: Camp) -> dict:
    col = camp.collection
    extra_lunch_day = camp.special_days.get("extra_lunch")
    bbq_day = camp.special_days.get("bbq")
    lodging_per_night = col["lodging_meals"] / 6  # 1泊3食の徴収単価(6泊分)を1泊あたりに換算

    lines = []
    for p in camp.attending_roster():
        pres = camp.roster_presence(p)
        nights = len(pres.lodging_nights)
        days_present = len(pres.days_present)
        is_selects = p.role == "選手"

        if p.is_full_time:
            lodging_meals = col["lodging_meals"]
            extra_lunch = col["extra_lunch"]
            bbq = col["bbq"]
            transport = col["transport"]
        else:
            lodging_meals = round(lodging_per_night * nights)
            extra_lunch = col["extra_lunch"] if (extra_lunch_day and extra_lunch_day in pres.lunches) else 0
            bbq = col["bbq"] if (bbq_day and bbq_day in pres.dinners) else 0
            transport = col["transport_return_only"]

        misc = col["misc_per_day"] * days_present
        ground = col["ground"]
        reserve = col["reserve"]
        coach_fee = col["coach_fee"] if is_selects else 0

        lines.append(
            IncomeLine(
                person=p,
                is_full_time=p.is_full_time,
                nights=nights,
                days_present=days_present,
                lodging_meals=lodging_meals,
                extra_lunch=extra_lunch,
                bbq=bbq,
                transport=transport,
                misc=misc,
                ground=ground,
                reserve=reserve,
                coach_fee=coach_fee,
            )
        )

    total = sum(l.total for l in lines)
    return {"lines": lines, "total": total}


# ---------------------------------------------------------------------------
# 計算: 収支
# ---------------------------------------------------------------------------


def balance(camp: Camp) -> dict:
    income_total = income(camp)["total"]
    expenses_total = sum(e.amount for e in camp.expenses)
    expense_total = camp.hotel_invoice_total + camp.bus["quote"] + expenses_total
    return {
        "income_total": income_total,
        "expense_total": expense_total,
        "hotel_invoice_total": camp.hotel_invoice_total,
        "bus_quote": camp.bus["quote"],
        "expenses_total": expenses_total,
        "diff": income_total - expense_total,
    }


# ---------------------------------------------------------------------------
# 計算: 立替金精算
# ---------------------------------------------------------------------------


def _settlement_from_items(items: list) -> dict:
    by_payer: dict = {}
    for e in items:
        if e.is_settled:
            continue
        by_payer.setdefault(e.payer, {"items": [], "total": 0})
        by_payer[e.payer]["items"].append(e)
        by_payer[e.payer]["total"] += e.amount
    grand_total = sum(v["total"] for v in by_payer.values())
    return {"by_payer": by_payer, "grand_total": grand_total}


def settlement(camp: Camp) -> dict:
    return _settlement_from_items(camp.expenses)


def ledger_settlement(entries: list) -> dict:
    """年間経費台帳(load_ledgerの返り値)の未精算立替を立替者ごとに集計する。"""
    return _settlement_from_items(entries)


def combined_settlement(camp_id: str = "2026-summer", fiscal_year: str = None) -> dict:
    """夏合宿(expenses-<camp_id>.csv)と年間経費台帳(ledger-<fiscal_year>.csv)の
    未精算立替を、立替者ごとに合算する。

    fiscal_year を省略した場合は camp_id の先頭の年(例: "2026-summer" -> "2026")を使う。
    """
    if fiscal_year is None:
        fiscal_year = camp_id.split("-")[0]

    camp = load(camp_id)
    camp_settle = settlement(camp)
    ledger_entries = load_ledger(fiscal_year)
    ledger_settle = ledger_settlement(ledger_entries)

    payers = list(camp_settle["by_payer"].keys())
    for p in ledger_settle["by_payer"]:
        if p not in payers:
            payers.append(p)

    combined = {}
    for p in payers:
        camp_total = camp_settle["by_payer"].get(p, {"total": 0})["total"]
        ledger_total = ledger_settle["by_payer"].get(p, {"total": 0})["total"]
        combined[p] = {"camp": camp_total, "ledger": ledger_total, "total": camp_total + ledger_total}

    grand_total = camp_settle["grand_total"] + ledger_settle["grand_total"]
    return {
        "camp_id": camp_id,
        "fiscal_year": fiscal_year,
        "camp": camp_settle,
        "ledger": ledger_settle,
        "combined": combined,
        "grand_total": grand_total,
    }
