# 003-shop-personas-payments-admin

## 目的

教材ストア（002）を改良する。

1. 客のペルソナ（大人の英語学習者・高校生・教員）を商品情報とサイトUIに反映する
2. クレジットカードに加えて電子決済（PayPayなど）で支払えるようにする
3. 商品のアップロード・編集がしやすい管理画面を用意する

## 要件

### ペルソナ対応

- 商品に `audience`（対象）フィールドを追加する
- トップページで「対象で選ぶ」×「種類で選ぶ」の2軸で絞り込めるようにする
- 商品カード・商品ページに対象を表示する
- 3ペルソナそれぞれに対応するサンプル商品を置く

### 決済

- 決済はStripe支払いリンクを継続利用（カード・PayPay・コンビニ決済はStripe側の有効化のみで対応可能）
- サイトに対応決済手段を表示する（`site.json` の `paymentMethods`）
- PayPay・コンビニ決済の有効化手順をdocsに書く

### 管理画面

- `web/shop/admin/index.html` をブラウザだけで動く商品管理画面にする
- GitHub Fine-grained PAT（Contents: Read and write）で GitHub Contents API に直接コミットする
- 機能: 商品の追加・編集・削除・並べ替え、無料配布ファイルのアップロード、保存して公開
- トークンはブラウザのlocalStorageにのみ保存する
- 管理画面は noindex + robots.txt の Disallow で検索エンジンから除外する

## 完了条件

- `node web/shop/build.js` で admin ページ込みのサイトが生成される
- トップページで対象別の絞り込みが動く
- docs/material_shop.md にペルソナ・決済有効化・管理画面の使い方が書かれている
