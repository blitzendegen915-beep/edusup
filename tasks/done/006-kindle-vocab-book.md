# 006-kindle-vocab-book

## 目的

集中が続きにくい生徒（ショート動画世代）向けの英単語帳を、Kindle（KDP）で出版できる形で作る。
単語リストを差し替えるだけで、シリーズ化・改訂ができるようにする。

## 要件

### 本の構成

- 1ページ1単語のカード（番号・進捗バー・レア度・見出し語・発音・品詞・意味・覚え方・例文・＋α）
- 1ステージ（10語前後）ごとに「ボス戦」
  - 英→日 と 日→英 を交互に出題
  - 選択肢をタップすると「正解！+10XP」「ざんねん（正解と覚え方を表示）」のページにジャンプ（Kindleの内部リンク）
  - ページをめくるだけでも次の問題へ進める
- ステージごとの答え合わせ・ランク判定（S/A/B/C）
- 全ステージから出題するラスボス戦、ALL CLEAR ページ、さくいん（単語カードへのリンク）、奥付
- もくじ（nav.xhtml と toc.ncx の両方）

### 入力

- `kindle/vocab-book/words.csv`: stage, word, pos, meaning, reading, rarity, hook, example, example_ja, plus
  - Googleスプレッドシート・Excel（CSV UTF-8）で編集できること
  - `[ ]` で囲んだ部分を太字（発音の強勢・例文の見出し語）
- `kindle/vocab-book/book.json`: タイトル・著者・ステージ名・クイズ設定・KDP入力用情報
- `kindle/vocab-book/cover.jpg`: 表紙（KDP推奨 1600×2560px）

### テストとしての品質

- 意味が同じ単語があればエラー（正解の一意性）
- 紛らわしい単語の組（`quiz.avoidTogether`）は同じ問題の選択肢に並べない
- 正解の位置を均等に割り振り、同じ番号が3問以上続かないようにする（選択肢の偏り）
- 選択肢の重複・正解位置のずれを最終確認する（設問番号のずれ）
- シード付き乱数で、作り直しても同じ問題になる

### 出力

- `dist/<fileName>.epub`（EPUB 3。EPUBCheck でエラー・警告ゼロ）
- `dist/cover.jpg`、`dist/preview.html`（ブラウザ確認用）、`dist/kdp-listing.txt`（KDP入力メモ）

### その他

- Node.js 標準機能のみ（ZIP書き出しも自前実装）
- Kindleの黒背景モード・E Ink に対応するため、文字色・背景色を指定しない
- サンプルとして高校基礎100語（10ステージ）と表紙を同梱する
- 公開リポジトリのため、販売用データはリポジトリ外のフォルダで作れるようにする（引数でフォルダ指定）
- GitHub Actions で EPUB を生成し EPUBCheck で検証する（EPUBは成果物として保存しない）

## 完了条件

- `node kindle/vocab-book/build.js` で EPUB・表紙・プレビュー・KDPメモが生成される
- EPUBCheck 5.1.0 でエラー・警告ゼロ
- docs/kindle_vocab_book.md に作り方・KDP出版手順・注意点（AI生成コンテンツの申告、公開リポジトリの扱い）が書かれている
- README に簡単な説明が追記される
