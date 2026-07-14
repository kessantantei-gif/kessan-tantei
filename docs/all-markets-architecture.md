# 決算探偵 全市場対応アーキテクチャ

最終更新: 2026-07-14

## 1. 目的

決算探偵を、グロース・スタンダード・プライムの3市場を1つの基盤で提供・運営できるサービスへ拡張する。

画面、認証、Pro契約、掲示板、ウォッチリスト、管理画面は共通化し、会社データ、採点モデル、ランキング、説明文だけを市場・業種に応じて切り替える。

## 2. 完成時のURL

- `/markets`: 市場選択トップ
- `/growth`: グロース市場トップ
- `/standard`: スタンダード市場トップ
- `/prime`: プライム市場トップ
- `/company/[ticker]`: 全市場共通の会社詳細
- `/ranking`: 全市場横断ランキング入口
- `/ranking/[slug]?market=growth|standard|prime`: 市場別ランキング

会社ページURLは市場変更後も維持するため、市場名を含めない。

## 3. 正式な市場識別子

内部値は次の3つに固定する。

- `growth`
- `standard`
- `prime`

表示名はそれぞれ「グロース」「スタンダード」「プライム」とする。

## 4. 対象証券

初期対象は東証の普通株式とする。

次の証券は分類を保持するが、一般事業会社と同一の採点モデルでは処理しない。

- 銀行、証券、保険、その他金融
- REIT、インフラファンド
- 外国会社、JDR
- ETF、ETN
- 優先株その他の特殊証券

対応モデルが完成していない証券は `listing_status = active` のままでも、ランキング上は `scoring_status = unsupported` として除外する。

## 5. 基本データモデル

会社基本情報、財務履歴、スコア、リスク、市場所属を分離する。

### companies

会社の不変または低頻度変更情報を保持する。

- ticker
- edinet_code
- corporate_number
- company_name
- company_name_en
- industry_code
- industry_name
- security_type
- is_financial
- is_reit
- is_foreign
- listing_status
- listing_date
- delisting_date

### market_memberships

市場変更履歴を保持する。

- company_id
- market_segment
- valid_from
- valid_to
- source
- source_updated_at

同一会社について `valid_to is null` の行は1件だけとする。

### company_financial_history

会計期間単位の財務数値を保持する。

- company_id
- fiscal_year
- period_start
- period_end
- consolidated
- accounting_standard
- currency
- unit_scale
- revenue
- gross_profit
- operating_income
- ordinary_income
- net_income
- operating_cf
- investing_cf
- financing_cf
- cash_and_equivalents
- total_assets
- net_assets
- equity
- interest_bearing_debt
- current_assets
- current_liabilities
- shares_outstanding
- source_doc_id
- source_filed_at
- extraction_version

### company_scores

市場・業種別スコアを履歴管理する。

- company_id
- market_segment
- scoring_model
- scoring_version
- total_score
- danger_score
- score_breakdown
- score_explanation
- calculated_at

### company_risks

Red Flagsを明細単位で保持する。

- company_id
- risk_code
- severity
- title
- description
- evidence
- source_doc_id
- detected_at
- resolved_at

### data_import_runs / data_quality_issues

取得ジョブと異常値を追跡する。

## 6. 既存互換性

既存の `company_analyses` は移行期間中に削除しない。

移行順序:

1. 新テーブルを追加
2. `company_analyses` から新テーブルへバックフィル
3. 新取得処理を新テーブルへ二重書き込み
4. 読み取り処理を段階的に新テーブルへ移行
5. 監査合格後に `company_analyses` を互換ビューまたはキャッシュ用途へ変更

既存の次の機能を移行中も維持する。

- `/company/[ticker]`
- 掲示板と通報
- ウォッチリスト
- Pro契約
- 管理画面
- 既存ランキング

## 7. 採点モデル

### growth-v1

- 成長性 40
- 収益品質 30
- 安全性 30

### standard-v1

- 成長性 25
- 収益性 25
- キャッシュ 20
- 安全性 20
- 株主還元 10

### prime-v1

- 収益力 25
- 資本効率 20
- 成長性 15
- キャッシュ 15
- 安全性 15
- 株主還元 10

欠損値を0点として扱わない。採点可能項目の充足率を別途表示し、最低充足率未満はランキング対象外とする。

## 8. 業種別例外

- 銀行、証券、保険は一般事業会社モデルを使用しない
- REITは一般企業の営業CF・自己資本比率モデルを使用しない
- 外国会社・JDRは通貨・単位・会計基準を明示する
- 金融・REIT専用モデル完成前は `unsupported` とする

## 9. Pro契約

1契約で3市場を利用可能とする。市場ごとのStripe商品・重複購読は作らない。

## 10. 管理画面

管理画面で以下を市場別に確認できるようにする。

- 対象企業数
- 市場区分未確定
- EDINET未紐付け
- 財務取得失敗
- スコア未計算
- データ品質異常
- 新規上場、市場変更、上場廃止
- 掲示板投稿、通報、ユーザー

## 11. 非機能要件

- 数千社を前提にページネーションとDBインデックスを使用
- ジョブは差分取得・再試行・冪等性を持つ
- 管理APIはサーバー側で管理者認証を必須とする
- 重要な数値変更と管理操作は監査ログを残す
- CRITICALとERRORが0になるまで本番公開対象を広げない

## 12. 完全版の受入条件

- 3市場の普通株を網羅
- 市場区分、EDINETコード、会社名が正確
- 原則3期以上の財務履歴
- 市場・業種別スコア
- 金融・REITの誤採点防止
- 市場別トップ、ランキング、検索、会社ページが稼働
- 共通Pro、掲示板、ウォッチ、管理画面が稼働
- 自動更新、異常値監査、原本突合が完了
- CI、Vercel、本番ユーザーフローが全て成功
