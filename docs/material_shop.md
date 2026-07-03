# 教材ストア（販売サイト）の使い方

自作教材（PDF・Excelなど）を販売するための自前ストアサイトです。
GitHub Pages で無料公開でき、Google検索にも載せられるようにSEO対応済みです。

- コード: `web/shop/`
- 公開URL（Pages有効化後）: `https://blitzendegen915-beep.github.io/teacher-automation-lab/`

## 仕組み

```
products.json（商品データ）＋ site.json（サイト設定）
        │
        ▼  node web/shop/build.js
web/shop/dist/（トップページ・商品ページ・sitemap.xml・robots.txt）
        │
        ▼  GitHub Actions（main に push すると自動実行）
GitHub Pages で公開
```

- サーバーもデータベースも不要。維持費は0円です。
- 決済は Stripe の「支払いリンク（Payment Links）」を使うので、決済処理を自分で作る必要はありません。

## 初回セットアップ（1回だけ）

1. このブランチを main にマージする（またはファイルを main に置く）。
2. GitHubのリポジトリページで **Settings → Pages** を開く。
3. **Source** を **GitHub Actions** に変更する。
4. **Actions** タブで「Deploy shop to GitHub Pages」が成功するのを待つ。
5. `https://blitzendegen915-beep.github.io/teacher-automation-lab/` を開いて表示を確認する。

### site.json を自分用に書き換える

`web/shop/site.json` の以下を必ず書き換えてください（今はダミーです）。

- `authorName` / `contactEmail`: あなたの名前（屋号）と連絡先
- `tokushoho`: 特定商取引法に基づく表記の内容
  - 有料販売する場合は法律上必要な表記です。個人の場合、住所・電話番号は「請求があった場合に遅滞なく開示します」という書き方が広く使われています。

## 商品を追加する

`web/shop/products.json` に1ブロック追記するだけです。

```json
{
  "id": "my-new-worksheet",
  "title": "商品名（検索されたいキーワードを入れる）",
  "category": "ワークシート",
  "price": 300,
  "fileType": "PDF",
  "summary": "検索結果にそのまま表示される紹介文。80〜120文字程度がおすすめ。",
  "details": ["内容の箇条書き1", "内容の箇条書き2"],
  "tags": ["高校英語", "文法"],
  "paymentLink": "",
  "downloadFile": "",
  "updated": "2026-07-03"
}
```

- `id` は半角英小文字・数字・ハイフンのみ。商品ページのURLになります。
- `price` を `0` にして `downloadFile` にファイル名を書くと無料配布になります（ファイルは `web/shop/files/` に置く）。
- main に push すれば自動で再デプロイされます。

## 有料販売（Stripe決済）をつなぐ

1. [Stripe](https://stripe.com/jp) でアカウントを作る（個人でも可・初期費用なし・手数料は売上の3.6%）。
2. ダッシュボードで **商品カタログ → 商品を追加**（価格を設定）。
3. **支払いリンク（Payment Links）を作成** し、「支払い後 → ファイルをダウンロードさせる」設定として、確認ページまたは確認メールにダウンロードURLを入れる。
   - シンプルにやるなら、Stripeの「支払い後にカスタムメッセージを表示」にダウンロードリンクを書くのが最初は楽です。
4. できたリンク（`https://buy.stripe.com/...`）を `products.json` の `paymentLink` に貼る。
5. push すると商品ページの「販売準備中」が「購入する」ボタンに変わります。

※ 販売ファイル自体はこのリポジトリに置かないでください（公開リポジトリだと誰でも見えます）。Stripe経由で渡すか、Googleドライブの限定リンク等を使ってください。

## Google検索に載せる

サイト側の対策（タイトル・説明文・構造化データ・sitemap.xml・robots.txt）は生成時に自動で入ります。あとは Google に場所を教えるだけです。

1. [Google Search Console](https://search.google.com/search-console) を開き、「URLプレフィックス」でサイトURLを登録する。
2. 所有権の確認は「HTMLタグ」方式が楽です。表示されたメタタグを `web/shop/build.js` の `<head>` 部分（`pageShell` 関数内）に追記して push。
3. 確認が済んだら、**サイトマップ** メニューで `sitemap.xml` を送信する。
4. 数日〜数週間でインデックスされます。**URL検査** で個別ページの登録リクエストも出せます。

検索されるためのコツ:

- 商品タイトルに「高校英語 仮定法 ワークシート」のように、先生が実際に検索する語を入れる
- `summary` は検索結果の説明文になるので、内容と対象者が分かる文にする
- 無料教材を1つ置いておくと、そこから他の商品ページへ回遊されやすくなります

## ローカルで確認する

```
node web/shop/build.js
```

を実行すると `web/shop/dist/` にサイトが生成されます。`dist/index.html` をブラウザで開けばそのまま確認できます。

## テスト方法

1. `node web/shop/build.js` がエラーなく完了する
2. `dist/index.html` で商品カードとカテゴリ絞り込みが動く
3. 各商品ページで価格・購入ボタン・パンくずが正しい
4. `dist/sitemap.xml` に全ページのURLが入っている

## 注意点

- 教材に教科書本文・入試問題をそのまま載せると著作権に触れる場合があります。販売物は自作の問題・解説にしてください。
- 有料販売を始める前に `tokushoho`（特定商取引法に基づく表記）を必ず実情に合わせて書き換えてください。
- `web/shop/dist/` は自動生成物なのでコミット不要です（`.gitignore` 済み）。
