-- 決算探偵 全市場対応 Phase 15
-- 数千社規模の市場別検索・ランキング向けインデックスと書込権限制御。
-- 再実行可能。

create index if not exists company_analyses_ticker_idx
  on public.company_analyses (ticker);

create index if not exists company_analyses_market_score_idx
  on public.company_analyses (market_segment, score desc)
  where risk_level is distinct from 'EXCLUDED';

create index if not exists company_analyses_market_danger_idx
  on public.company_analyses (market_segment, danger_score desc)
  where risk_level is distinct from 'EXCLUDED';

create index if not exists company_analyses_market_updated_idx
  on public.company_analyses (market_segment, updated_at desc nulls last);

create index if not exists all_market_companies_listing_market_idx
  on public.all_market_companies (listing_status, market_segment, ticker);

create index if not exists all_market_companies_edinet_listing_idx
  on public.all_market_companies (edinet_code, listing_status)
  where edinet_code is not null;

create index if not exists all_market_companies_financial_update_idx
  on public.all_market_companies (market_segment, last_financial_update desc nulls last);

create index if not exists company_financial_periods_document_idx
  on public.company_financial_periods (document_id)
  where document_id is not null;

create index if not exists company_score_snapshots_current_market_idx
  on public.company_score_snapshots (market_segment, total_score desc)
  where is_current = true;

create index if not exists company_risk_snapshots_current_danger_idx
  on public.company_risk_snapshots (danger_score desc)
  where is_current = true;

create index if not exists data_import_runs_type_created_idx
  on public.data_import_runs (import_type, created_at desc);

create index if not exists data_quality_issues_status_severity_idx
  on public.data_quality_issues (status, severity, created_at desc);

alter table public.all_market_companies enable row level security;
alter table public.market_memberships enable row level security;
alter table public.company_financial_periods enable row level security;
alter table public.company_score_snapshots enable row level security;
alter table public.company_risk_snapshots enable row level security;
alter table public.data_import_runs enable row level security;
alter table public.data_quality_issues enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.all_market_companies,
     public.market_memberships,
     public.company_financial_periods,
     public.company_score_snapshots,
     public.company_risk_snapshots,
     public.data_import_runs,
     public.data_quality_issues
  from anon, authenticated;

comment on index public.company_analyses_market_score_idx
  is '全市場ランキングの市場別Score降順表示用';
comment on index public.company_analyses_market_danger_idx
  is '全市場ランキングの市場別Danger Score降順表示用';
