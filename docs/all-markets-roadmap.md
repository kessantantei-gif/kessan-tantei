# 決算探偵 全市場対応ロードマップ

最終更新: 2026-07-14

## 進行ルール

- 既存グロース版を止めずに段階移行する
- コード実装と本番データ投入を分けて管理する
- 各Phaseは監査がPASSEDになるまで本番完了扱いにしない
- 金融・REITなど共通モデルで誤評価しやすい区分は品質警告を残す
- 完全版の最終判定は`npm run complete:all-markets`と手動受入の両方で行う

## Phase 0 設計固定

状態: 完了

成果物:

- 全市場対応アーキテクチャ
- URL、市場識別子、対象証券、互換性方針
- 市場別スコア方針
- 完全版の受入条件

## Phase 1 DB移行基盤

状態: 完了・本番適用済み

成果物:

- `all_market_companies`全市場会社マスタ
- 市場区分履歴、財務履歴、スコア履歴、リスク履歴
- インポート実行履歴、データ品質問題
- `company_analyses`から587社をバックフィル
- 財務履歴1,723件をロスレス移行
- RLS、制約、インデックス
- 移行監査スクリプト

本番監査結果:

- 既存企業: 587
- 移行企業: 587
- Growth: 587
- 財務履歴: 1,723
- 不正市場区分: 0
- 市場履歴欠損: 0
- スコア欠損: 0
- リスク欠損: 0

## Phase 2 東証全市場マスタ

状態: コード実装完了・本番再実行待ち

実装済み:

- JPX公式上場銘柄一覧の取得
- Prime / Standard / Growth普通株の抽出
- 証券コード、会社名、33業種の正規化
- EDINETコードリストのメタ情報行を飛ばすヘッダー自動検出
- 英数字4桁・EDINET末尾0形式の証券コード正規化
- EDINETコード・法人番号照合
- `all_market_companies`へのupsert
- 新規上場・市場変更・上場廃止候補の検出
- `market_memberships`への市場変更履歴保存
- `data_import_runs`への同期結果保存
- Phase 2監査スクリプト

完了条件:

- `npm run sync:jpx-markets`が成功
- `npm run audit:phase2-market-master`がPASSED
- Prime / Standard / Growthが0件でない
- EDINET未紐付け企業が特定可能

## Phase 3 EDINET全社取得

状態: パイプライン実装完了・本番バックフィル待ち

実装済み:

- `all_market_companies`を対象にしたEDINET日次差分取得
- 有価証券報告書・訂正有価証券報告書の対象抽出
- 既存最新docIDとの重複防止
- 全市場共通の分析処理起動
- `company_financial_periods`への3期履歴保存
- `data_import_runs`への成功・部分失敗・失敗記録
- 日付範囲バックフィル実行
- GitHub Actions手動バックフィル

実行:

- 日次: `npm run sync:edinet-daily`
- 初回: `npm run backfill:edinet-all-markets`

完了条件:

- 各市場の解析率90%以上
- 解析済み企業に財務期間・現在スコア・現在リスクが存在
- `npm run audit:all-markets-data`がPASSED

## Phase 4 業種別パーサー

状態: 共通事業会社モデル接続済み・専用モデルは品質警告運用

実装済み:

- 一般事業会社のXBRL共通タグ取得
- 業種分類を分析処理へ接続
- 金融・REITを`data_quality=warning`として識別
- 業種別監査の既存Phase 4スクリプト

残る精緻化:

- 銀行、証券、保険、その他金融の専用KPI
- REIT、インフラファンドの専用KPI
- 外国会社・JDRの例外タグ

公開ルール:

- 専用モデル未対応区分は共通スコアを参考値として扱い、品質表示を必須にする

## Phase 5 市場別スコア

状態: v1実装完了・分布監査待ち

実装済み:

- `growth_v1`: 成長40 / 収益品質30 / 安全性30
- `standard_v1`: 成長25 / 収益品質35 / 安全性40
- `prime_v1`: 成長20 / 収益品質40 / 安全性40
- 欠損ペナルティ
- モデル名、バージョン、計算根拠保存
- `company_score_snapshots`の現行・履歴管理

完了条件:

- 市場別スコア分布を確認
- 市場と`scoring_model`の不一致0件
- 異常な0点・100点集中がない

## Phase 6 Danger Score全市場対応

状態: 共通モデル接続済み・市場別ウェイト精緻化待ち

実装済み:

- 継続企業、MSワラント、転換社債、増資、営業CF連続赤字、流動性、監査人変更
- `company_risk_snapshots`への現在値・根拠保存
- 旧スナップショットの終了管理

残る精緻化:

- Prime向け減配・巨額減損・資本効率低下
- Standard向け関連当事者・オーナー依存・流動性

## Phase 7 市場別UI

状態: 実装完了・データ投入待ち

成果物:

- `/markets`
- `/growth`
- `/standard`
- `/prime`
- Standard / Primeの実データ接続ダッシュボード
- 市場別検索、上場数、解析数、解析進捗
- 市場切替リンク

## Phase 8 ランキング完全対応

状態: 市場別基本ランキング実装完了

成果物:

- `/standard/ranking`
- `/prime/ranking`
- 総合スコア、売上高、営業利益、営業CF、Danger Score
- 無料上位表示とProロック
- 市場ごとのデータ分離

残る精緻化:

- ROE、ROIC、配当、自社株買いなど追加財務項目の取得後にランキング追加

## Phase 9 会社ページ完全対応

状態: 全市場共通表示を実装済み

成果物:

- 市場バッジ
- 業種
- スコアモデル
- データ品質
- 市場別ランキングへの導線
- 市場情報を含むSEO description

残る精緻化:

- 市場内順位・業種内順位
- ROE、ROIC、FCF、配当、自社株買い
- 市場変更履歴の画面表示

## Phase 10 Pro統合

状態: 既存共通契約基盤を全市場UIで利用

実装済み:

- 1契約で3市場のランキングロック解除
- 既存Stripe / Clerk権限を共通利用
- Phase 10・Stripe監査

完了条件:

- テスト購入、Pro表示、解約後表示を手動確認

## Phase 11 管理画面全市場対応

状態: 実装完了

成果物:

- `/admin/all-markets`
- 市場別上場数、解析率、EDINET紐付け、品質警告
- 最近のインポート
- 未解決の品質問題
- 既存のユーザー、投稿、通報、売上、集客、分析操作画面との統合

## Phase 12 自動更新・ジョブ

状態: 実装完了・GitHub Secrets設定待ち

成果物:

- `.github/workflows/all-markets-nightly.yml`
- `.github/workflows/all-markets-backfill.yml`
- 日次JPX同期
- 日次EDINET同期
- 初回バックフィル
- 失敗履歴と部分失敗
- 統合実行コマンド

## Phase 13 データ監査

状態: 自動監査実装完了・原本目視突合待ち

成果物:

- `audit:phase1-all-markets`
- `audit:phase2-market-master`
- `audit:all-markets-data`
- 財務整合性、履歴期間、Phase 4、Release、Final監査
- 市場別解析率、EDINET率、財務期間、スコア、リスク、モデル不一致検査

手動残作業:

- 代表企業のEDINET原本突合
- 金融・REITの専用モデル確認

## Phase 14 SEO

状態: 実装完了・Search Console確認待ち

成果物:

- 市場別metadata / canonical
- `/markets`、3市場トップ、Standard / Primeランキングのsitemap登録
- 1,000件制限を回避する会社ページsitemapページング
- 市場情報を含む会社ページdescription

## Phase 15 性能・セキュリティ

状態: SQL実装完了・本番適用待ち

成果物:

- `20260714_003_all_markets_performance_security.sql`
- 市場別Score / Danger / 更新日インデックス
- EDINET・財務期間・現行スナップショット用インデックス
- RLS再確認
- anon / authenticatedからの書込権限剥奪

## Phase 16 最終受入テスト

状態: 自動監査実装完了・本番実行と手動確認待ち

成果物:

- `npm run complete:all-markets`
- `npm run audit:phase16-all-markets`
- Release Auditへ全市場監査を追加
- 全市場Nightly workflow
- 公開URL HTTPスモークテスト

完全版の最終完了条件:

1. Phase 2同期が成功
2. 全市場EDINETバックフィル後、各市場解析率90%以上
3. `npm run complete:all-markets`がPASSED
4. Vercel本番デプロイが成功
5. Stripeの実テストが成功
6. 未ログイン・無料・Pro・管理者の手動受入が成功
7. Search Consoleで市場ページとsitemapを確認
8. 代表企業の原本突合で重大差異0件

具体的な実行順は`docs/complete-version-handoff.md`を参照する。
