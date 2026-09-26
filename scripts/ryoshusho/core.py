"""
領収書の写真 → A4の「領収書写し」。

  data/rugby/receipts-<合宿ID>.yml   どの写真のどこを切り出すか（切り抜き座標・回転）
  data/rugby/receipts/<合宿ID>/      写真の置き場。gitには入れない（.gitignore）
  data/rugby/expenses-<合宿ID>.csv   ラベルに使う台帳（番号・日付・支払先・金額）

写真そのものは加工で内容を変えない。やるのは切り出し・回転・明るさの補正と配置だけ。
"""
import argparse
import csv
import sys
from datetime import date
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "rugby"
OUT_DIR = ROOT / "output" / "ryoshusho"
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"

DPI = 200
PAGE_W, PAGE_H = int(8.27 * DPI), int(11.69 * DPI)   # A4 縦
MARGIN, GAP = 70, 28
HEADER_H, FOOTER_H, LABEL_H = 150, 70, 40


def font(size):
    return ImageFont.truetype(FONT, size)


def scan_look(img: Image.Image) -> Image.Image:
    """スキャナで取り込んだような見た目にする。

    背景（紙や机の明るさ）を推定して割り算で平らにし、影と照明むらを消す。
    背景の推定には「広げてから縮める」処理（クロージング）を使う。
    文字のような細い暗い線は消えるが、紙と机の境目の位置は保たれるので、
    紙の縁に黒い縁取りが出ない。最後に紙を白に、文字を濃くする。
    """
    g = img.convert("L")
    k = max(1, min(g.width, g.height) // 400)          # 縮小率（大きい写真ほど粗く推定）
    small = g.resize((max(1, g.width // (4 * k)), max(1, g.height // (4 * k))), Image.BILINEAR)
    bg = small.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    bg = bg.filter(ImageFilter.GaussianBlur(1)).resize(g.size, Image.BILINEAR)
    a = np.asarray(g, dtype=np.float32)
    b = np.maximum(np.asarray(bg, dtype=np.float32), 1.0)
    ratio = a / b                                       # 1.0 = 背景と同じ明るさ
    # 背景と同じなら白、背景の 45% 以下の暗さなら黒。その間はなめらかに
    lo, hi = 0.45, 0.92
    t = np.clip((ratio - lo) / (hi - lo), 0.0, 1.0)
    return Image.fromarray((t ** 1.3 * 255).astype(np.uint8))


def load_manifest(camp_id):
    m = yaml.safe_load((DATA_DIR / f"receipts-{camp_id}.yml").read_text())
    with open(DATA_DIR / m.get("expenses", f"expenses-{camp_id}.csv"), newline="") as f:
        expenses = {r["receipt"]: r for r in csv.DictReader(f)}
    return m, expenses


def label_for(item, expenses):
    if item.get("label"):
        return item["label"]
    e = expenses.get(item.get("receipt", ""))
    if not e:
        return item.get("receipt", "")
    _, m, dd = e["date"].split("-")
    return f"{item['receipt']}　{int(m)}/{int(dd)}　¥{int(e['amount']):,}"


def cut(item, photo_dir):
    src = photo_dir / item["src"]
    if not src.exists():
        raise SystemExit(f"❌ 写真が見つかりません: {src}")
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    if item.get("rotate"):
        img = img.rotate(-item["rotate"], expand=True)   # 時計回りを正とする
    if item.get("box"):
        img = img.crop(tuple(item["box"]))
    return scan_look(img)


def new_page(title, subtitle):
    page = Image.new("L", (PAGE_W, PAGE_H), 255)
    d = ImageDraw.Draw(page)
    d.text((MARGIN, MARGIN - 10), title, font=font(40), fill=0)
    d.text((MARGIN, MARGIN + 48), subtitle, font=font(24), fill=90)
    d.line([(MARGIN, HEADER_H + 20), (PAGE_W - MARGIN, HEADER_H + 20)], fill=150, width=2)
    return page


def pack(tiles, ncols):
    """背の低い列から順に詰める。はみ出す場合は None を返す。"""
    area_h = PAGE_H - HEADER_H - 40 - FOOTER_H
    col_w = (PAGE_W - 2 * MARGIN - GAP * (ncols - 1)) // ncols
    heights = [0] * ncols
    placed = []
    for label, img in tiles:
        s = col_w / img.width
        w, h = col_w, int(img.height * s)
        need = LABEL_H + h + GAP
        tol = area_h * 0.12
        low = min(heights)
        c = next(i for i, hh in enumerate(heights) if hh <= low + tol)
        if heights[c] + need > area_h:
            return None
        x = MARGIN + c * (col_w + GAP)
        y = HEADER_H + 40 + heights[c]
        placed.append((label, img.resize((w, h), Image.LANCZOS), x, y))
        heights[c] += need
    return placed


def build(camp_id, max_cols=6):
    m, expenses = load_manifest(camp_id)
    photo_dir = DATA_DIR / m.get("photo_dir", f"receipts/{camp_id}")
    small, full = [], []
    for it in m["items"]:
        if not it.get("src"):
            continue
        (full if it.get("full_page") else small).append((label_for(it, expenses), cut(it, photo_dir)))

    pages = []
    today = date.today().strftime("%Y年%m月%d日")
    if small:
        for n in range(2, max_cols + 1):
            placed = pack(small, n)
            if placed:
                break
        else:
            raise SystemExit("❌ 1ページに収まりません。receipts yml の max_cols を増やすか、切り抜きを詰めてください。")
        page = new_page(m["title"], f"領収書 {len(small)}枚　作成 {today}")
        d = ImageDraw.Draw(page)
        for label, img, x, y in placed:
            d.text((x, y + 6), label, font=font(22), fill=40)
            page.paste(img, (x, y + LABEL_H))
            d.rectangle([x - 1, y + LABEL_H - 1, x + img.width, y + LABEL_H + img.height], outline=170)
        pages.append(page)

    for label, img in full:
        page = new_page(m["title"], f"{label}　作成 {today}")
        area_w = PAGE_W - 2 * MARGIN
        area_h = PAGE_H - HEADER_H - 40 - FOOTER_H
        s = min(area_w / img.width, area_h / img.height)
        img = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS)
        x = (PAGE_W - img.width) // 2
        page.paste(img, (x, HEADER_H + 40))
        pages.append(page)

    # 台帳にあるのに写真が無いものを書き出す（提出先が「これの領収書は？」とならないように）
    shown = {it.get("receipt") for it in m["items"] if it.get("src")}
    listed = {it.get("receipt") for it in m["items"]}
    missing = [f"{k} {expenses[k]['description']} ¥{int(expenses[k]['amount']):,}"
               for k in sorted(listed - shown) if k in expenses]
    for i, p in enumerate(pages, 1):
        d = ImageDraw.Draw(p)
        foot = f"{i} / {len(pages)}"
        d.text((PAGE_W - MARGIN - 80, PAGE_H - FOOTER_H + 10), foot, font=font(22), fill=110)
        if i == 1 and missing:
            d.text((MARGIN, PAGE_H - FOOTER_H + 10), "領収書の添付なし: " + " ／ ".join(missing),
                   font=font(20), fill=110)
    return pages, m


def main(argv=None):
    p = argparse.ArgumentParser(prog="python3 -m scripts.ryoshusho",
                                description="領収書の写真をA4の写しに加工する")
    p.add_argument("camp_id")
    args = p.parse_args(argv)
    pages, m = build(args.camp_id)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf = OUT_DIR / f"{args.camp_id}_領収書写し.pdf"
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=DPI)
    pngs = []
    for i, pg in enumerate(pages, 1):
        q = OUT_DIR / f"{args.camp_id}_領収書写し_{i}.png"
        pg.save(q, dpi=(DPI, DPI))
        pngs.append(q)
    print(f"✅ {pdf}（{len(pages)}ページ）")
    for q in pngs:
        print(f"   {q}")
    return 0
