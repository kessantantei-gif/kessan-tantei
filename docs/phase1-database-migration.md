# Phase 1: 全市場対応DB移行

## 目的

既存の `company_analyses` を稼働させたまま、全市場対応の正規化テーブルへ段階移行する。

## 対象マイグレーション

`supabase/migrations/20260714_001_all_markets_foundation.sql`

## 作成されるテーブル

- `companies`
- `market_memberships`
- `company_financial_periods`
- `company_score_snapshots`
- `company_risk_snapshots`
- `data_import_runs`
- `data_quality_issues`

## 既存テーブルへの追加

`company_analyses` に以下を追加する。

- `market_segment`
- `market_segment_updated_at`

既存行はすべて `growth` として初期化する。プライム・スタンダードの市場マスタ取得後に正しい区分へ更新する。

## 互換性

既存の画面・APIは引き続き `company_analyses` を利用できる。

移行中の参照用に `company_analyses_all_markets` ビューを作成し、会社マスタの市場区分・業種・データ品質を既存データへ結合する。

## バックフィル

マイグレーション実行時に以下を自動実行する。

1. `company_analyses` から `companies` へ会社マスタを登録
2. 現在の市場区分を `market_memberships` へ登録
3. `history` JSONを `company_financial_periods` へロスレス展開
4. 現行スコアを `company_score_snapshots` へ保存
5. 現行Danger Score・Red Flagsを `company_risk_snapshots` へ保存

元のJSONは `source_payload` に保存するため、移行時に情報を失わない。

## 監査

マイグレーション後に以下を実行する。

```bash
npm run audit:phase1-all-markets
```

監査項目：

- `companies` 件数が `company_analyses` 件数以上
- ticker重複なし
- 市場区分が `growth / standard / prime / other` のいずれか
- 全会社に現在市場履歴が存在
- 孤立した市場履歴なし
- 全会社に現在スコアが存在
- 全会社に現在リスクが存在

## 完了条件

- マイグレーションがエラーなく完了
- `npm run audit:phase1-all-markets` がPASSED
- 既存グロースページの主要URLが正常
- 既存の会社数、スコア、掲示板、ユーザー、契約情報に欠落がない
- 新規テーブルはRLS有効、一般クライアントから直接変更不可

## ロールバック方針

Phase 1では既存カラム・既存テーブルを削除しないため、アプリは `company_analyses` を使い続けられる。

新規テーブルに問題があった場合はアプリ側の参照切替を行わず、修正版マイグレーションを追加する。既に適用したマイグレーションファイルは書き換えず、追補マイグレーションで対応する。
