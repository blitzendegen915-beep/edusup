"""
管理職（校長）宛ての合宿 会計報告書（Word）。

金額はすべて model の計算関数と台帳から取る。このファイルの中で金額を組み立てない。
どの領収書をどの費目で報告するかは data/rugby/report-admin-<合宿ID>.yml に人が書く。
台帳の行がどの費目にも入っていない／二重に入っている場合はエラーで止める
（報告書から支出が黙って抜け落ちるのを防ぐため）。
"""
from pathlib import Path

import yaml
from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

from . import model

WEEK = "月火水木金土日"
FONT = "游明朝"


def jdate(d):
    return f"{d.month}月{d.day}日（{WEEK[d.weekday()]}）"


def build_figures(camp_id):
    """報告書に載せる数字をすべてここで揃える（計算は model に任せる）。"""
    camp = model.load(camp_id)
    cfg = yaml.safe_load((model.DATA_DIR / f"report-admin-{camp_id}.yml").read_text())
    by_id = {e.receipt: e for e in camp.expenses}

    # 台帳の全行が、報告書の費目か「合宿会計外」のどちらか一方に1回だけ入っているか
    mapped = []
    for group in ("expense_lines", "outside_camp"):
        for ids in (cfg.get(group) or {}).values():
            mapped += ids
    unknown = sorted(set(mapped) - set(by_id))
    dup = sorted({r for r in mapped if mapped.count(r) > 1})
    unmapped = sorted(set(by_id) - set(mapped))
    errors = []
    if unknown:
        errors.append(f"設定にあるが台帳に無い領収書番号: {unknown}")
    if dup:
        errors.append(f"複数の費目に入っている領収書番号: {dup}")
    if unmapped:
        errors.append(f"どの費目にも入っていない領収書番号（報告書から抜け落ちる）: {unmapped}")
    if errors:
        raise SystemExit("❌ report-admin の設定に不整合があります\n  " + "\n  ".join(errors))

    inc = model.income(camp)
    lines = inc["lines"]

    def group_income(pred):
        g = [l for l in lines if pred(l)]
        amounts = sorted({l.total for l in g})
        return {"n": len(g), "total": sum(l.total for l in g), "unit": amounts}

    income_rows = [
        ("選手参加費（全日参加）", group_income(lambda l: l.is_full_time and l.person.role == "選手")),
        ("マネージャー参加費（全日参加）", group_income(lambda l: l.is_full_time and l.person.role != "選手")),
        ("途中参加者（参加日数に応じて個別算出）", group_income(lambda l: not l.is_full_time)),
    ]

    reserve_refund = sum(l.reserve for l in lines)
    reserve_n = sum(1 for l in lines if l.reserve)
    exp_groups = {name: sum(by_id[r].amount for r in ids) for name, ids in cfg["expense_lines"].items()}
    exp_counts = {name: len(ids) for name, ids in cfg["expense_lines"].items()}
    outside = {name: sum(by_id[r].amount for r in ids) for name, ids in (cfg.get("outside_camp") or {}).items()}

    # 領収書の現物があるかは、領収書写しの設定（写真の有無）から判断する
    rp = model.DATA_DIR / f"receipts-{camp_id}.yml"
    with_photo = None
    if rp.exists():
        items = yaml.safe_load(rp.read_text()).get("items", [])
        with_photo = {it.get("receipt") for it in items if it.get("src")}

    def count_note(ids):
        if with_photo is None:
            return f"{len(ids)}件"
        missing = sum(1 for r in ids if r not in with_photo)
        return f"{len(ids)}件" + (f"（うち領収書なし{missing}件）" if missing else "（領収書あり）")

    expense_rows = [
        ("宿泊・食事・BBQ・グラウンド使用料（{}）".format(camp.venue), camp.hotel_invoice_total,
         "確定（支払済）", "請求書に基づく"),
        ("バス代（{}）".format(camp.bus["vendor"]), camp.bus["quote"],
         "見積額", "有料道路代・駐車場代は後日実費請求"),
    ]
    for name, amt in exp_groups.items():
        note = count_note(cfg["expense_lines"][name])
        status = "精算中" if "雑費" in name else ("一部未払" if "コーチ" in name else "確定")
        expense_rows.append((name, amt, status, note))
    expense_rows.append(("予備費未使用分の返金", reserve_refund, "返金予定",
                         f"@{camp.collection['reserve']:,}円 × {reserve_n}名"))
    expense_total = sum(r[1] for r in expense_rows)

    # 引率の大人の宿泊・食事代（ホテル請求に含まれる。生徒からは徴収していない）
    rates = camp.hotel_rates
    xl, bbq = camp.special_days.get("extra_lunch"), camp.special_days.get("bbq")

    def adult_cost(a):
        p = camp.adult_presence(a)
        return (len(p.lodging_nights) * rates["stay3"]
                + (rates["lunch"] if xl in p.lunches else 0)
                + (rates["bbq"] if bbq in p.dinners else 0))

    advisors = [a for a in camp.adults if a.role == "顧問"]
    coaches = [a for a in camp.adults if a.role != "顧問"]
    advisor_cost = sum(adult_cost(a) for a in advisors)

    attending = camp.attending_roster()
    return dict(
        camp=camp, cfg=cfg,
        n_players=sum(1 for p in attending if p.role == "選手"),
        n_mgr=sum(1 for p in attending if p.role != "選手"),
        n_late=sum(1 for p in attending if not p.is_full_time),
        advisors=advisors, coaches=coaches, advisor_cost=advisor_cost,
        income_rows=income_rows, income_total=inc["total"],
        expense_rows=expense_rows, expense_total=expense_total,
        diff=inc["total"] - expense_total,
        outside=outside, outside_total=sum(outside.values()),
    )


# ── Word 出力 ──────────────────────────────────────


def _font(run, size=10.5, bold=False):
    run.font.name, run.font.size, run.bold = FONT, Pt(size), bold
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT)


def _yellow(run):
    rpr = run._element.get_or_add_rPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear"), shd.set(qn("w:color"), "auto"), shd.set(qn("w:fill"), "FFFF00")
    rpr.append(shd)


def _para(doc, text="", align=None, size=10.5, bold=False, before=0, after=2, yellow=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before, p.paragraph_format.space_after = Pt(before), Pt(after)
    if align:
        p.alignment = align
    if text:
        r = p.add_run(text)
        _font(r, size, bold)
        if yellow:
            _yellow(r)
    return p


def _table(doc, header, rows, widths, right_cols=(), yellow_rows=(), bold_rows=()):
    t = doc.add_table(rows=1 + len(rows), cols=len(header))
    t.style = "Table Grid"
    for i, row in enumerate([header] + rows):
        for j, v in enumerate(row):
            c = t.cell(i, j)
            c.width = widths[j]
            c.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = c.paragraphs[0]
            p.paragraph_format.space_before = p.paragraph_format.space_after = Pt(1)
            if j in right_cols and i > 0:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            r = p.add_run(str(v))
            _font(r, 10, bold=(i == 0 or (i - 1) in bold_rows))
            if i > 0 and (i - 1) in yellow_rows:
                _yellow(r)
    return t


def yen(n):
    return f"{n:,}円"


def write(camp_id, out_path: Path):
    f = build_figures(camp_id)
    camp, cfg = f["camp"], f["cfg"]
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT)

    R, C = WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.CENTER
    date_text = cfg.get("submit_date") or "　　年　　月　　日"
    _para(doc, date_text, align=R, yellow=not cfg.get("submit_date"))
    _para(doc, cfg["to"], after=6)
    _para(doc, cfg["from"], align=R, after=12)
    _para(doc, cfg["title"], align=C, size=14, bold=True, after=12)
    _para(doc, "標記の件について、下記のとおり報告いたします。なお、一部に精算中・見積段階の項目が"
               "あるため、本報告は暫定のものです。確定後に改めて報告いたします。", after=8)
    _para(doc, "記", align=C, bold=True, after=8)

    # 1. 概要
    _para(doc, "１．合宿の概要", bold=True, before=4)
    days = (camp.end - camp.start).days
    adv = "・".join(
        f"{a.name.split()[0]}" + ("（全日程）" if a.from_date == camp.start and a.to_date == camp.end
                                   else f"（{a.from_date.month}/{a.from_date.day}〜）")
        for a in f["advisors"])
    co = "、".join(f"{a.from_date.month}/{a.from_date.day}〜{a.to_date.month}/{a.to_date.day}" for a in f["coaches"])
    _table(doc, ["項目", "内容"], [
        ["期間", f"{jdate(camp.start)}〜{jdate(camp.end)}　{days}泊{days + 1}日"],
        ["場所", camp.venue],
        ["参加生徒", f"{f['n_players'] + f['n_mgr']}名（選手{f['n_players']}名・マネージャー{f['n_mgr']}名）"
                     f"　うち途中参加{f['n_late']}名"],
        ["引率", f"顧問{len(f['advisors'])}名（{adv}）"],
        ["外部コーチ", f"{len(f['coaches'])}名（{co}）"],
    ], [Cm(3.2), Cm(13.4)])

    # 2. 収入
    _para(doc, "２．収入（保護者からの徴収）", bold=True, before=10)
    rows = []
    for name, g in f["income_rows"]:
        unit = yen(g["unit"][0]) if len(g["unit"]) == 1 else "個別"
        rows.append([name, unit, f"{g['n']}名", yen(g["total"])])
    rows.append(["収入合計", "", "", yen(f["income_total"])])
    _table(doc, ["費目", "単価", "人数", "金額"], rows,
           [Cm(8.0), Cm(2.8), Cm(2.0), Cm(3.8)], right_cols=(1, 2, 3), bold_rows=(len(rows) - 1,))

    # 3. 支出
    _para(doc, "３．支出", bold=True, before=10)
    rows, yel = [], []
    for i, (name, amt, status, note) in enumerate(f["expense_rows"]):
        rows.append([name, yen(amt), status, note])
        if not status.startswith("確定"):
            yel.append(i)
    rows.append(["支出合計", yen(f["expense_total"]), "", ""])
    _table(doc, ["費目", "金額", "状態", "備考"], rows,
           [Cm(6.6), Cm(3.0), Cm(2.4), Cm(4.6)], right_cols=(1,), yellow_rows=yel,
           bold_rows=(len(rows) - 1,))

    # 4. 収支
    _para(doc, "４．収支（暫定）", bold=True, before=10)
    _table(doc, ["", "金額"], [
        ["収入合計", yen(f["income_total"])],
        ["支出合計", yen(f["expense_total"])],
        ["差引（合宿残金・暫定）", yen(f["diff"])],
    ], [Cm(8.0), Cm(4.0)], right_cols=(1,), yellow_rows=(2,), bold_rows=(2,))
    _para(doc, "※ 合宿残金は、昨年度同様、合宿後の部活動用品（補食・プロテイン等）に充当する予定です。",
          size=9.5, before=2)

    # 5. 合宿会計外
    if f["outside"]:
        _para(doc, "５．合宿会計に含めず父母会予算で精算するもの", bold=True, before=10)
        rows = [[k, yen(v)] for k, v in f["outside"].items()] + [["計", yen(f["outside_total"])]]
        _table(doc, ["内容", "金額"], rows, [Cm(8.0), Cm(4.0)], right_cols=(1,),
               bold_rows=(len(rows) - 1,))

    # 6. 未確定事項
    _para(doc, "６．未確定事項（確定後に改めて報告します）", bold=True, before=10)
    for i, item in enumerate(cfg.get("pending", []), 1):
        text = item
        if "引率顧問" in item:
            text += f"。ホテル請求額のうち該当分は{yen(f['advisor_cost'])}（算出値）"
        _para(doc, f"（{i}）{text}", size=10, after=1)

    # 7. 添付
    if cfg.get("attachments"):
        _para(doc, "７．添付資料", bold=True, before=10)
        for a in cfg["attachments"]:
            _para(doc, f"・{a}", size=10, after=1)

    _para(doc, "以上", align=R, before=10)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)
    return f
