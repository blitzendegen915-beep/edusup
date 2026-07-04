# 自習監督依頼システム

教員が欠席・遅刻・早退時に、空きコマの教員へ自動で自習監督を依頼するWebアプリです。

## 従来（VBA）との違い

| 旧（VBA手動割り当て） | 新（このWebアプリ） |
|---|---|
| 管理者が手動で担当者を選ぶ | 空き教員へ自動一斉送信 |
| 「やっぱ無理です」→ 振り直し | 教員が自分で受諾するので辞退なし |
| Excel起動が必要 | スマホのブラウザで完結 |
| 記録管理が煩雑 | DB自動記録・統計画面あり |

## フロー

```
①  教員A が欠席フォームを送信
        ↓
②  GASが時間割を参照 → 対象コマが空きの教員を自動抽出
        ↓
③  空き教員 全員 へメール一斉送信（先着1名）
        ↓
④  最初に「受諾する」を押した教員が担当確定
        ↓
⑤  申請者・受諾者へ確定メール
    ※ 全員辞退 or 期限切れ → 管理者へ通知
```

## セットアップ手順

### 1. Supabase でDBを作る（無料）

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. SQL Editor で `supabase/schema.sql` を実行
3. 教員マスタ・時間割データを `teachers` / `timetable` テーブルに入力
   - SupabaseのTable Editor UIから直接入力できます

### 2. Resend でメール送信設定（無料・3000通/月）

1. [resend.com](https://resend.com) でアカウント作成
2. API Key を発行
3. 送信元ドメインを設定（学校のドメインを使うと受信率が高い）

### 3. Vercel にデプロイ（無料）

1. このリポジトリを Vercel に連携
2. Root Directory を `web/substitute-request` に設定
3. 環境変数を設定：

```
NEXT_PUBLIC_SUPABASE_URL     = https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
SUPABASE_SERVICE_ROLE_KEY    = eyJ...
RESEND_API_KEY               = re_...
RESEND_FROM                  = 自習監督システム <noreply@yourdomain.com>
NEXT_PUBLIC_APP_URL          = https://your-app.vercel.app
ADMIN_EMAIL                  = admin@school.example
CRON_SECRET                  = (ランダムな文字列)
```

4. デプロイ後、URLを全教員に共有

### 4. 期限切れ通知（自動）

Vercel の無料プランでも Cron Job が使えます。
`vercel.json` に設定済みで、1時間ごとに期限切れチェックが自動実行されます。

## データ入力

### 教員マスタ（`teachers` テーブル）

| id | name | email | subject |
|---|---|---|---|
| T001 | 山田 太郎 | yamada@school.example | 英語 |
| T002 | 鈴木 花子 | suzuki@school.example | 数学 |

### 時間割（`timetable` テーブル）

「その先生がその曜日・時限に授業がある」行を1行ずつ入力します。
登録されていない = 空きコマ = 依頼候補になります。

| day_of_week | period | teacher_id |
|---|---|---|
| 月 | 1 | T001 |
| 月 | 3 | T002 |
| 火 | 2 | T001 |

## 画面構成

- `/` — 依頼フォーム（教員・日付・時限・理由を入力）
- `/accept?token=xxx` — 受諾確認画面（メールのリンクから遷移）
- `/decline?token=xxx` — 辞退確認画面（メールのリンクから遷移）
- `/admin` — 管理画面（依頼一覧・教員別統計）

## 統計

管理画面 `/admin` に自動集計が表示されます。

| 教員名 | 依頼受信回数 | 代行実施回数 |
|---|---|---|
| 山田 太郎 | 12 | 5 |
| 鈴木 花子 | 8 | 8 |

- **依頼受信回数**: 空きコマで依頼メールが届いた回数
- **代行実施回数**: 実際に受諾・実施した回数
