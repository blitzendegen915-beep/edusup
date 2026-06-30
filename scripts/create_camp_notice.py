from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy, os, shutil

SRC = '/root/.claude/uploads/5767506c-4b71-528d-8561-fcd86f45b58e/7139d3fe-_________________.docx'
OUT = '/home/user/teacher-automation-lab/output/2026_夏合宿のご案内.docx'

shutil.copy2(SRC, OUT)
doc = Document(OUT)

YELLOW = 'FFFF00'

def highlight_run(run, color=YELLOW):
    rPr = run._element.get_or_add_rPr()
    for old in rPr.findall(qn('w:shd')):
        rPr.remove(old)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color)
    rPr.append(shd)

def set_all_runs_text(para, new_text, highlight=False):
    for r in para.runs[1:]:
        r._element.getparent().remove(r._element)
    if para.runs:
        para.runs[0].text = new_text
        if highlight:
            highlight_run(para.runs[0])

def replace_in_para(para, old, new, highlight=False):
    for run in para.runs:
        if old in run.text:
            run.text = run.text.replace(old, new)
            if highlight:
                highlight_run(run)

p = doc.paragraphs

# [0] 宛名＋日付行 → 2026年版に
for r in p[0].runs:
    r.text = ''
p[0].runs[0].text = 'ラグビー部保護者各位'
last_run = p[0].add_run('　' * 33 + '2026年　　月　　日')
last_run.font.size = Pt(10)
last_run.font.name = '游明朝'
last_run._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(last_run)

# [3] 顧問名
for r in p[3].runs:
    r.text = ''
p[3].runs[0].text = 'ラグビー部顧問　占部涼也　畠山和真'

# [10] 期間
for r in p[10].runs:
    r.text = ''
p[10].runs[0].text = '期間'
r_period = p[10].add_run('　８月１日（土）～８月７日（金）　６泊７日')
r_period.font.size = p[10].runs[0].font.size
r_period.font.name = '游明朝'
r_period._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')

# [11] 日程 初日
for r in p[11].runs:
    r.text = ''
p[11].runs[0].text = '日程　８月１日（土）午前　移動（高校7時半集合）　　　　／　午後　練習'

# [12]-[16] 対戦校スケジュール
schedule = [
    ('　　　８月２日（日）', '対戦校未定'),
    ('　　　８月３日（月）', '対戦校未定'),
    ('　　　８月４日（火）', '対戦校未定'),
    ('　　　８月５日（水）', '対戦校未定'),
    ('　　　８月６日（木）', '対戦校未定'),
]
for i, (date, content) in enumerate(schedule):
    pi = 12 + i
    for r in p[pi].runs:
        r.text = ''
    p[pi].runs[0].text = date + '　'
    r_content = p[pi].add_run(content)
    r_content.font.size = p[pi].runs[0].font.size
    r_content.font.name = '游明朝'
    r_content._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
    highlight_run(r_content)

# [16] 最終日 → 8/7帰京
for r in p[16].runs:
    r.text = ''
p[16].runs[0].text = '　　　８月７日（金）午前　練習　　　　　　　　　　　　／　午後　帰京'

# [22] 宿泊費
for r in p[22].runs:
    r.text = ''
p[22].runs[0].text = '・宿泊費　￥５５，０２０　（￥９，１７０（一泊3食税込）×６泊分）'

# [23] 増昼食
for r in p[23].runs:
    r.text = ''
p[23].runs[0].text = '・増昼食代（最終日の１日分）　￥１，１００　　　'

# [24] BBQ
for r in p[24].runs:
    r.text = ''
p[24].runs[0].text = '・ＢＢＱ代　　　　　　　　　　￥１，１００'

# [25] グラウンド使用料
for r in p[25].runs:
    r.text = ''
p[25].runs[0].text = '　　　・グラウンド使用料　￥２，１５２（グラウンド使用料合計￥９９，０００を46人で割る）'

# [26] 交通費
for r in p[26].runs:
    r.text = ''
p[26].runs[0].text = '・交通費　￥９，６７８（バス往復手配￥４４５，２００を46人で割る）'

# [27] 雑費
for r in p[27].runs:
    r.text = ''
p[27].runs[0].text = '　　　・雑費　　'
r27 = p[27].add_run('￥６，０００（雑費１人１日１，０００円×６日分）')
r27.font.size = Pt(10)
r27.font.name = '游明朝'
r27._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r27)

# [28] 雑費余った場合の注記 → そのまま

# [29] コーチ謝礼
for r in p[29].runs:
    r.text = ''
p[29].runs[0].text = '　　　・コーチ謝礼・宿泊・交通費　'
r29 = p[29].add_run('未定（選手のみ負担・確定後ご案内します）')
r29.font.size = Pt(10)
r29.font.name = '游明朝'
r29._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r29)

# [30]-[31] 予備費
for r in p[30].runs:
    r.text = ''
p[30].runs[0].text = '　　　・予備費　'
r30 = p[30].add_run('未定')
r30.font.size = Pt(10)
r30.font.name = '游明朝'
r30._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r30)

for r in p[31].runs:
    r.text = ''

# [32] 合計
for r in p[32].runs:
    r.text = ''
p[32].runs[0].text = '　　'
r32a = p[32].add_run('★合宿費合計　')
r32a.font.size = Pt(16)
r32a.font.name = '游明朝'
r32a._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
r32b = p[32].add_run('￥７５，０５０＋コーチ謝礼等＋予備費（確定後ご案内）')
r32b.font.size = Pt(16)
r32b.font.name = '游明朝'
r32b._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r32b)

# [37] 締切
for r in p[37].runs:
    r.text = ''
p[37].runs[0].text = '締切　'
r37 = p[37].add_run('　月　　日（　　）')
r37.font.size = Pt(10)
r37.font.name = '游明朝'
r37._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r37)

# [40] 引率・人数
for r in p[40].runs:
    r.text = ''
p[40].runs[0].text = '引率顧問２名　外部コーチ'
r40 = p[40].add_run('　名')
r40.font.size = Pt(13.5)
r40.font.name = '游明朝'
r40.bold = True
r40._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r40)
r40b = p[40].add_run('　参加生徒42名')
r40b.font.size = Pt(13.5)
r40b.font.name = '游明朝'
r40b.bold = True
r40b._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')

# [41] 合計人数
for r in p[41].runs:
    r.text = ''
p[41].runs[0].text = '計'
r41 = p[41].add_run('　名')
r41.font.size = Pt(13.5)
r41.font.name = '游明朝'
r41.bold = True
r41._element.rPr.rFonts.set(qn('w:eastAsia'), '游明朝')
highlight_run(r41)

# [43]-[44] 途中合流情報 → クリア（今年は未定）
for r in p[43].runs:
    r.text = ''
for r in p[44].runs:
    r.text = ''

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc.save(OUT)
print(f'完了: {OUT}')
