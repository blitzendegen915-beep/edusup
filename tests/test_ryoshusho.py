"""scripts/ryoshusho のテスト。python3 tests/test_ryoshusho.py で実行する。

写真はテストの中で合成する（実物の領収書は使わない）。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.ryoshusho import core  # noqa: E402

passed = failed = 0


def check(name, cond):
    global passed, failed
    passed, failed = (passed + 1, failed) if cond else (passed, failed + 1)
    print(("OK   " if cond else "FAIL ") + name)


# 机(暗め)の上に感熱紙(くすんだ白)を置き、薄い文字を書き、右下ほど暗い照明むらを付けた写真
W, H = 1200, 900
desk = Image.new("L", (W, H), 110)
paper = Image.new("L", (500, 700), 222)
ImageDraw.Draw(paper).rectangle([60, 80, 440, 100], fill=115)   # 薄い文字の代わりの横線
desk.paste(paper, (350, 100))
arr = np.asarray(desk, dtype=np.float32)
yy, xx = np.mgrid[0:H, 0:W]
arr *= 1.0 - 0.4 * (xx / W) * (yy / H)
photo = Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))

out = np.asarray(core.scan_look(photo), dtype=np.float32)

paper_px = out[250:700, 450:750]                  # 紙の内側（文字の無い所）
check("紙の地は白くなる（平均240以上）", paper_px.mean() >= 240)
text_px = out[182:198, 450:750]                   # 薄い文字の位置
check("薄い文字は濃くなる（平均80以下）", text_px.mean() <= 80)
check("照明むらが消える（紙の左上と右下の差が10以内）",
      abs(out[220:260, 380:420].mean() - out[720:760, 800:840].mean()) <= 10)

# 実際に起きた不具合: 紙と机の境目の外側に黒い縁取りが出た
outer = np.concatenate([out[100:800, 300:340].ravel(), out[100:800, 860:900].ravel()])
check("紙の外側に黒い縁取りが出ない（境目の外40pxに黒い画素が5%未満）",
      (outer < 60).mean() < 0.05)

# 配置: 1ページに収まる列数を選ぶ
tiles = [("x", Image.new("L", (400, 900), 255)) for _ in range(7)]
placed = None
for n in range(2, 7):
    placed = core.pack(tiles, n)
    if placed:
        break
check("7枚が1ページに収まる列数が見つかる", placed is not None and len(placed) == 7)
check("どの領収書も用紙の右端・下端からはみ出さない", all(
    x + img.width <= core.PAGE_W - core.MARGIN
    and y + core.LABEL_H + img.height <= core.PAGE_H - core.FOOTER_H
    for _, img, x, y in placed))
check("用紙はA4縦の比率", abs(core.PAGE_H / core.PAGE_W - 297 / 210) < 0.01)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
