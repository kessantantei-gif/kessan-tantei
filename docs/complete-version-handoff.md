# 決算探偵 全市場完全版 最終引継ぎ

最終更新: 2026-07-14

この文書は、実装済みの全市場版を本番データ・自動更新・監査まで含めて完成させるための、運営者側の作業だけを順番にまとめたものです。

## 先に理解すること

- コード実装はPhase 16まで準備済みです。
- Phase 1の本番DB移行は完了済みです。
- 残りは、本番Supabaseへの追加SQL適用、全市場データ同期、EDINET初回バックフィル、Secrets設定、監査、手動受入です。
- エラーが出た場合は、同じ処理を何度も繰り返さず、最初のエラー全文を保存してください。
- 金融・REITは専用KPIモデルが未完成のため、現時点ではデータ品質を`warning`として扱い、共通スコアは参考値です。

# 運営者が実行するタスク

## Task 1　本番Supabaseへ性能・セキュリティSQLを適用

実行するファイル:

`supabase/migrations/20260714_003_all_markets_performance_security.sql`

操作:

1. GitHubで上記ファイルを開く
2. Rawを押す
3. 全文コピー
4. SupabaseのSQL EditorでNew query
5. 全文貼り付け
6. Run

成功表示:

`Success. No rows returned`

この処理は、市場別ランキング用インデックス、RLS、一般ユーザーの書込禁止を適用します。

## Task 2　GitHub Actions Secretsを確認

GitHubリポジトリの次の場所を開きます。

`Settings → Secrets and variables → Actions`

以下がすべて登録済みであることを確認します。

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EDINET_API_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_LAUNCH_COUPON_ID`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

`NEXT_PUBLIC_APP_URL`は次です。

`https://kessan-tantei.jp`

値そのものをチャットやIssueへ貼らないでください。

## Task 3　Phase 2 全市場会社マスタを同期

Macのターミナルで、末尾が`kessan-tantei %`になっている状態で実行します。

```bash
git pull origin main && npm ci && npm run sync:jpx-markets && npm run audit:phase2-market-master
```

成功条件:

- `JPX全市場マスタ同期完了`
- Prime、Standard、Growthがすべて0件ではない
- `Phase 2監査: PASSED`

エラー時:

- 再実行しない
- 最初の`Error:`から最後まで保存する

## Task 4　初回EDINET全市場バックフィル

### 推奨方法: GitHub Actions

1. GitHubの`Actions`を開く
2. `All Markets EDINET Backfill`を選ぶ
3. `Run workflow`
4. `days`へ`400`
5. `continue_on_error`を有効
6. 実行

この処理は長時間かかります。途中の個別会社失敗は`data_import_runs`へ記録されます。

### Macで実行する場合

```bash
git pull origin main && npm run backfill:edinet-all-markets
```

初回バックフィルは、各市場の有価証券報告書を解析し、最新財務、3期履歴、市場別スコア、Danger Scoreを保存します。

## Task 5　全市場データ監査

バックフィル終了後にMacで実行します。

```bash
npm run audit:all-markets-data
```

成功表示:

`Phase 3-6 全市場データ監査: PASSED`

主な合格条件:

- Prime、Standard、Growthの解析率が各90%以上
- EDINET紐付け率が各95%以上
- 解析済み企業に財務期間・現在スコア・現在リスクが存在
- 市場とスコアモデルの不一致が0件

解析率不足の場合は、管理画面`/admin/all-markets`で失敗履歴を確認し、対象日または対象企業を再解析します。

## Task 6　統合修復・ビルド・全監査

```bash
git pull origin main && npm run complete:all-markets:repair
```

このコマンドは次を順番に実行します。

- JPX全市場同期
- Phase 1監査
- Phase 2監査
- Phase 3〜6全市場データ監査
- 財務データ修復
- Lint
- Production Build
- 財務整合性監査
- 履歴期間監査
- Phase 4 / 7 / 8 / 9 / 10監査
- Stripe監査
- SEO監査
- Release監査
- Final監査
- Phase 16本番受入監査

最終成功表示:

`全市場完全版 統合実行: PASSED`

最初にFAILEDになった処理以降は実行されません。最初のエラーだけを修正して再実行します。

## Task 7　Vercel本番デプロイを確認

Vercelで最新mainのDeploymentが`Ready`であることを確認します。

本番で次を開きます。

- `https://kessan-tantei.jp/markets`
- `https://kessan-tantei.jp/growth`
- `https://kessan-tantei.jp/standard`
- `https://kessan-tantei.jp/standard/ranking`
- `https://kessan-tantei.jp/prime`
- `https://kessan-tantei.jp/prime/ranking`
- `https://kessan-tantei.jp/admin/all-markets`

確認事項:

- 3市場の上場数・解析数が表示される
- Standard / Primeで検索できる
- 市場別ランキングから会社ページへ移動できる
- 会社ページ上部に市場・業種・Score Model・Data Qualityが表示される
- ページ遷移後、上部から表示される

## Task 8　会員区分別の手動受入

### 未ログイン

- 市場トップを閲覧できる
- ランキング上位を閲覧できる
- Pro限定行は会社名を隠す
- Pricingへ遷移する

### 無料ログイン

- 掲示板へ投稿できる
- いいね・通報が動く
- 無料範囲のAI分析が動く
- Pro限定データはロックされる

### Pro

- 1契約でPrime / Standard / Growthの全ランキングを閲覧できる
- 詳細分析、比較、ウォッチ、アラートが既存仕様どおり動く

### 管理者

- `/admin/all-markets`を閲覧できる
- ユーザー、投稿、通報、会社マスタ、分析、売上、集客画面へ移動できる
- 一般ユーザーは管理画面へ入れない

## Task 9　Stripe実取引テスト

Stripeのテスト環境または安全な実取引手順で確認します。

- 新規購入
- Pro権限反映
- 3市場共通でPro表示
- Webhook成功
- 解約
- 解約後の権限状態
- 二重購読が発生しない

Stripe DashboardのWebhookで、失敗イベントが0件であることも確認します。

## Task 10　Search Console

- `https://kessan-tantei.jp/sitemap.xml`を再送信
- `/markets`
- `/standard`
- `/standard/ranking`
- `/prime`
- `/prime/ranking`

をURL検査します。

確認事項:

- クロール可能
- canonicalが自分自身
- noindexではない
- 重複ページ警告がない

## Task 11　EDINET原本突合

最低限、次の構成で代表会社を抽出します。

- Growth一般事業会社 10社
- Standard一般事業会社 10社
- Prime一般事業会社 10社
- 銀行・証券・保険 10社
- その他金融 5社
- 外国会社 5社

確認項目:

- 会社とdocIDが一致
- 決算期が一致
- 連結・単体の選択が正しい
- 売上高
- 営業利益
- 営業CF
- 現預金
- 流動負債
- 総資産
- 純資産
- 3期履歴
- スコア根拠
- Red Flags根拠

重大差異が1件でもあれば、その業種を公開済み完成扱いにせず、`data_quality=warning/error`で管理します。

# 完全版の最終判定

次をすべて満たした時点で、本番完全版です。

- Task 1〜11完了
- `npm run complete:all-markets:repair`がPASSED
- VercelがReady
- GitHub ActionsのRelease AuditとAll Markets Nightlyが成功
- 3市場の解析率90%以上
- Stripe実取引テスト成功
- 会員区分別の主要フロー成功
- Search Console確認済み
- 原本突合で重大差異0件

# 実装済みだが今後精緻化する領域

以下はサイトを動かす基盤は実装済みですが、専門モデルとしては追加開発余地があります。

- 銀行・証券・保険・その他金融の専用スコア
- REIT・インフラファンドの専用スコア
- ROE、ROIC、FCF、配当、自社株買いの全社取得
- Prime向けガバナンス・株主還元Red Flags
- Standard向け関連当事者・オーナー依存Red Flags

これらの区分は、専用モデル完成までは`Data Quality: warning`を表示し、共通スコアを参考値として扱います。
