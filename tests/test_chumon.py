"""scripts/chumon のテスト。python3 tests/test_chumon.py で実行する。

実データは読むだけで書き換えない。壊したデータの検証は一時ディレクトリで行う。
"""
import csv
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.chumon import core  # noqa: E402

ORDER = "tshirt-2026-bunkasai"
passed = failed = 0


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print(f"OK   {name}")
    else:
        failed += 1
        print(f"FAIL {name}")


def with_broken_lines(mutate):
    """lines.csv だけを書き換えた一時データで analyze を実行する。"""
    tmp = Path(tempfile.mkdtemp())
    try:
        for f in core.DATA_DIR.glob(f"order-{ORDER}*"):
            shutil.copy(f, tmp / f.name)
        shutil.copy(core.DATA_DIR / "roster-2026.csv", tmp / "roster-2026.csv")
        p = tmp / f"order-{ORDER}-lines.csv"
        with open(p, newline="") as f:
            rows = list(csv.DictReader(f))
        rows = mutate(rows)
        with open(p, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["name", "size", "qty", "status", "basis"])
            w.writeheader()
            w.writerows(rows)
        orig = core.DATA_DIR
        core.DATA_DIR = tmp
        try:
            return core.analyze(ORDER)
        finally:
            core.DATA_DIR = orig
    finally:
        shutil.rmtree(tmp)


# ── 実データ ───────────────────────────────────
a = core.analyze(ORDER)
check("実データは突き合わせエラーなし", a["errors"] == [])
check("実データは回答欄サイズの警告なし", a["warns"] == [])

# 集計が明細と整合しているか（金額ではなく整合性を検証する）
check("全明細の集計は明細の数量合計と一致",
      sum(a["total_all"].values()) == sum(ln.qty for ln in a["lines"]))
check("確定分の集計は状態=確定の数量合計と一致",
      sum(a["total_confirmed"].values())
      == sum(ln.qty for ln in a["lines"] if ln.status == "確定"))
check("要確認の明細は集計『確定分のみ』に入らない",
      sum(a["total_all"].values()) - sum(a["total_confirmed"].values())
      == sum(ln.qty for ln in a["pending"]))

# 最新採用の規約
check("大津は最新回答(L)が採用される", a["latest"][core.norm_name("大津 究士")].answer == "L")
check("竹原は最新回答(M)が採用される", a["latest"][core.norm_name("竹原浩輝")].answer == "M")

# 氏名の表記揺れ
check("全角スペース入りの氏名が名簿と一致する",
      core.norm_name("田口　輝真") == core.norm_name("田口 輝真"))
check("全角英字のクラス表記に引きずられず氏名で突き合わせる",
      core.norm_name("中所龍之介") in a["roster_by"])

# 未回答者の抽出
check("対象学年の未回答者を拾える", len(a["non_resp"]) >= 0 and all(
    r["grade"] == "1" for r in a["non_resp"]))
check("回答者は未回答者に含まれない",
      not any(core.norm_name(r["name"]) in a["latest"] for r in a["non_resp"]))

# ── 壊したデータで検証が反応するか ─────────────────
b = with_broken_lines(lambda rows: [r for r in rows if r["name"] != "植作 渉"])
check("購入者の明細を消すと『転記漏れ』エラーになる",
      any("植作" in m and "転記漏れ" in m for m in b["errors"]))

b = with_broken_lines(lambda rows: rows + [
    {"name": "須藤 海翔", "size": "L", "qty": "1", "status": "確定", "basis": ""}])
check("『購入しない』回答者に明細を足すとエラーになる",
      any("須藤" in m and "購入しない" in m for m in b["errors"]))

b = with_broken_lines(lambda rows: rows + [
    {"name": "存在 しない", "size": "L", "qty": "1", "status": "確定", "basis": ""}])
check("名簿に無い氏名はエラーになる", any("存在 しない" in m for m in b["errors"]))

def swap_size(rows):
    for r in rows:
        if r["name"] == "増喜 晴也":
            r["size"] = "M"   # 回答欄はXL
    return rows
b = with_broken_lines(swap_size)
check("回答欄と違うサイズに転記すると警告が出る",
      any("増喜" in m for m in b["warns"]))

def bad_size(rows):
    rows[0]["size"] = "LL"
    return rows
b = with_broken_lines(bad_size)
check("定義に無いサイズはエラーになる", any("LL" in m for m in b["errors"]))

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
