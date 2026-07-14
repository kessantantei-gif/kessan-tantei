# Phase 2: 東証全市場マスタ

## 目的

JPX公式の上場銘柄一覧と金融庁EDINETコードリストを取得し、プライム・スタンダード・グロースの普通株マスタを `all_market_companies` に同期する。

## 公式データソース

- JPX 東証上場銘柄一覧
  - `https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls`
- EDINETコードリスト
  - `https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip`

URLが変更された場合は、環境変数で上書きできる。

- `JPX_LIST_URL`
- `EDINET_CODELIST_URL`

## 対象

- プライム市場の株式
- スタンダード市場の株式
- グロース市場の株式

以下はPhase 2の普通株マスタから除外する。

- ETF
- REIT
- インフラファンド
- TOKYO PRO Market
- その他の商品区分

外国株式は普通株として取り込み、`is_foreign = true`で識別する。

## 同期コマンド

```bash
npm run sync:jpx-markets
```

同期処理は以下を行う。

1. JPXファイルをダウンロード
2. 市場区分・証券コード・会社名・33業種を正規化
3. EDINETコードリストをダウンロード
4. 証券コードでEDINETコード・法人番号を照合
5. `all_market_companies`へupsert
6. 新規上場を検出
7. 市場変更を検出して`market_memberships`へ履歴保存
8. JPX一覧から消えた既存銘柄を上場廃止候補として`unknown`へ変更
9. `data_import_runs`へ実行結果を保存

上場廃止候補は自動で`delisted`へ確定せず、Phase 11の管理画面または追加の公式情報で確認してから確定する。

## 監査コマンド

```bash
npm run audit:phase2-market-master
```

## 監査項目

- 普通株合計が3,000社以上
- Primeが1,000社以上
- Standardが1,000社以上
- Growthが300社以上
- ticker重複なし
- tickerが4桁
- 市場区分がprime / standard / growth
- 会社名欠損なし
- 普通株以外なし
- 全上場会社に市場マスタ更新日時あり
- 全上場会社に現在市場履歴あり
- 会社マスタと市場履歴が一致
- 最新JPX同期がsuccess
- EDINET未紐付けが全体の10%以下かつ100社以下
- 業種欠損が10社以下

## Phase 2完了条件

- `npm run sync:jpx-markets`が成功
- `npm run audit:phase2-market-master`がPASSED
- Prime・Standard・Growthの件数が合理的
- EDINET未紐付け企業を一覧化できる
- 新規上場・市場変更・上場廃止候補が実行履歴に保存される
- 既存グロース587社の会社ページ・スコア・掲示板に影響がない
