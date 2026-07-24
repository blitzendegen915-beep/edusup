"""
2026年夏合宿・菅平ホテル向け日別人数計算（共通ロジック）。
docx版・xlsx版の両方でこのモジュールの計算結果のみを使う（重複実装で数値がズレるのを防ぐ）。

出典: 部からの参加者一覧Excel（シート1「参加日 8/1〜8/7」の〇印、および
「会計計算」シートの「大人参加日程（宿・現地人数確認用）」表）と、ユーザーからの
追加確認（途中合流者は合流日の夕食からカウント）。

生徒（部員42名＝選手39名＋マネージャー3名）のうち2名が途中合流:
  椎名薫（2年F組・マネージャー）: 8/4夕食〜カウント
  吉田青空（1年E組・選手）: 8/5夕食〜カウント

大人は当初「顧問2名が全日程帯同」としていたが誤り。実際は下記の通り:
  顧問1（畠山先生）: 全日程（8/1〜8/7）帯同
  顧問2（占部先生）: 8/5夕食〜カウント（吉田・椎名と同様、午後合流）
  外部コーチ1人目: 8/1・8/2（フル参加）
  外部コーチ2人目: 8/3〜8/5（フル参加）
  8/6・8/7はコーチの帯同なし
"""

DAYS = ['8/1（土）', '8/2（日）', '8/3（月）', '8/4（火）', '8/5（水）', '8/6（木）', '8/7（金）']

# 生徒: 朝食・昼食時点／夕食・宿泊時点（8/7は夕食・宿泊なし＝出発日）
BASE_AM_PM = [40, 40, 40, 40, 41, 42, 42]
BASE_DINNER = [40, 40, 40, 41, 42, 42, None]

# 大人（顧問1・顧問2・コーチ）を朝食/昼食/夕食/宿泊ごとに個別集計。
# 全体の初日(8/1)は誰も朝食なし、最終日(8/7)は誰も夕食・宿泊なし、という
# 生徒側と同じ規約を大人にも適用する。
ADVISOR1_BF = [None, 1, 1, 1, 1, 1, 1]
ADVISOR1_LUNCH = [1, 1, 1, 1, 1, 1, 1]
ADVISOR1_DINNER = [1, 1, 1, 1, 1, 1, None]
ADVISOR1_STAY = [1, 1, 1, 1, 1, 1, None]

ADVISOR2_BF = [None, 0, 0, 0, 0, 1, 1]
ADVISOR2_LUNCH = [0, 0, 0, 0, 0, 1, 1]
ADVISOR2_DINNER = [0, 0, 0, 0, 1, 1, None]
ADVISOR2_STAY = [0, 0, 0, 0, 1, 1, None]

COACH_BF = [None, 1, 1, 1, 1, 0, 0]
COACH_LUNCH = [1, 1, 1, 1, 1, 0, 0]
COACH_DINNER = [1, 1, 1, 1, 1, 0, None]
COACH_STAY = [1, 1, 1, 1, 1, 0, None]


def compute():
    rows = []
    total_b = total_l = total_d = total_s = 0
    for i, day in enumerate(DAYS):
        adult_bf = (ADVISOR1_BF[i] or 0) + (ADVISOR2_BF[i] or 0) + (COACH_BF[i] or 0)
        adult_lunch = ADVISOR1_LUNCH[i] + ADVISOR2_LUNCH[i] + COACH_LUNCH[i]

        b = '－' if i == 0 else BASE_AM_PM[i] + adult_bf
        l = BASE_AM_PM[i] + adult_lunch

        if BASE_DINNER[i] is None:
            d = '－'
            s = '－'
        else:
            adult_dinner = ADVISOR1_DINNER[i] + ADVISOR2_DINNER[i] + COACH_DINNER[i]
            adult_stay = ADVISOR1_STAY[i] + ADVISOR2_STAY[i] + COACH_STAY[i]
            d = BASE_DINNER[i] + adult_dinner
            s = BASE_DINNER[i] + adult_stay

        rows.append((day, b, l, d, s))
        if isinstance(b, int):
            total_b += b
        total_l += l
        if isinstance(d, int):
            total_d += d
            total_s += s

    totals = dict(breakfast=total_b, lunch=total_l, dinner=total_d, stay=total_s)

    # Excel「大人参加日程」シートの現地人数計（42,42,42,43,45,44,44）との整合確認
    assert [r[3] if r[3] != '－' else 44 for r in rows] == [42, 42, 42, 43, 45, 44, 44]
    assert rows[0] == ('8/1（土）', '－', 42, 42, 42)
    assert rows[4] == ('8/5（水）', 43, 43, 45, 45)
    assert rows[6] == ('8/7（金）', 44, 44, '－', '－')

    return rows, totals


if __name__ == '__main__':
    rows, totals = compute()
    for r in rows:
        print(r)
    print(totals)
