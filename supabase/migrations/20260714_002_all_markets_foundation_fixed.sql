-- 決算探偵 全市場対応 Phase 1 修正版
-- 既存 public.companies は既存処理で利用されているため変更しない。
-- 全市場共通マスタは public.all_market_companies として新設する。
-- 再実行可能な冪等マイグレーション。

create extension if not exists pgcrypto;

alter table public.company_analyses
  add column if not exists market_segment text;

alter table public.company_analyses
  add column if not exists market_segment_updated_at timestamptz;

update public.company_analyses
set
  market_segment = coalesce(nullif(lower(trim(market_segment)), ''), 'growth'),
  market_segment_updated_at = coalesce(market_segment_updated_at, now())
where market_segment is null
   or trim(market_segment) = ''
   or market_segment_updated_at is null;

alter table public.company_analyses
  drop constraint if exists company_analyses_market_segment_check;

alter table public.company_analyses
  add constraint company_analyses_market_segment_check
  check (market_segment in ('growth', 'standard', 'prime', 'other')) not valid;

alter table public.company_analyses
  validate constraint company_analyses_market_segment_check;

create table if not exists public.all_market_companies (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  company_name text not null,
  edinet_code text,
  corporate_number text,
  market_segment text not null default 'growth'
    check (market_segment in ('growth', 'standard', 'prime', 'other')),
  market_segment_updated_at timestamptz,
  industry_code text,
  industry_name text,
  security_type text not null default 'common_stock',
  listing_status text not null default 'listed'
    check (listing_status in ('listed', 'suspended', 'delisted', 'unknown')),
  listing_date date,
  delisting_date date,
  is_financial boolean not null default false,
  is_reit boolean not null default false,
  is_foreign boolean not null default false,
  scoring_model text not null default 'growth_v1',
  data_quality text not null default 'unreviewed'
    check (data_quality in ('verified', 'reviewed', 'warning', 'error', 'unreviewed')),
  last_financial_update timestamptz,
  last_market_master_update timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists all_market_companies_market_idx
  on public.all_market_companies (market_segment, listing_status);
create index if not exists all_market_companies_edinet_idx
  on public.all_market_companies (edinet_code)
  where edinet_code is not null;
create index if not exists all_market_companies_industry_idx
  on public.all_market_companies (industry_code, industry_name);

create table if not exists public.market_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.all_market_companies(id) on delete cascade,
  market_segment text not null
    check (market_segment in ('growth', 'standard', 'prime', 'other')),
  effective_from date not null,
  effective_to date,
  is_current boolean not null default true,
  source text not null default 'legacy_backfill',
  source_reference text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists market_memberships_one_current_idx
  on public.market_memberships (company_id)
  where is_current;
create index if not exists market_memberships_market_idx
  on public.market_memberships (market_segment, is_current);

create table if not exists public.company_financial_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.all_market_companies(id) on delete cascade,
  fiscal_year integer,
  period_start date,
  period_end date,
  filing_date date,
  document_id text,
  accounting_scope text not null default 'consolidated'
    check (accounting_scope in ('consolidated', 'non_consolidated', 'unknown')),
  period_type text not null default 'annual'
    check (period_type in ('annual', 'semiannual', 'quarterly', 'other')),
  currency text not null default 'JPY',
  financials jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  source_position integer,
  data_quality text not null default 'unreviewed'
    check (data_quality in ('verified', 'reviewed', 'warning', 'error', 'unreviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_financial_periods_source_idx
  on public.company_financial_periods (
    company_id,
    coalesce(document_id, ''),
    coalesce(source_position, -1)
  );
create index if not exists company_financial_periods_company_period_idx
  on public.company_financial_periods (company_id, period_end desc, fiscal_year desc);

create table if not exists public.company_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.all_market_companies(id) on delete cascade,
  market_segment text not null
    check (market_segment in ('growth', 'standard', 'prime', 'other')),
  scoring_model text not null,
  model_version text not null,
  total_score numeric,
  danger_score numeric,
  score_breakdown jsonb not null default '{}'::jsonb,
  calculation_basis jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists company_score_snapshots_one_current_idx
  on public.company_score_snapshots (company_id, scoring_model)
  where is_current;
create index if not exists company_score_snapshots_market_score_idx
  on public.company_score_snapshots (market_segment, total_score desc)
  where is_current;

create table if not exists public.company_risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.all_market_companies(id) on delete cascade,
  risk_model text not null default 'danger_v1',
  model_version text not null default '1',
  risk_level text,
  danger_score numeric,
  flags jsonb not null default '[]'::jsonb,
  calculation_basis jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists company_risk_snapshots_one_current_idx
  on public.company_risk_snapshots (company_id, risk_model)
  where is_current;
create index if not exists company_risk_snapshots_level_idx
  on public.company_risk_snapshots (risk_level, danger_score desc)
  where is_current;

create table if not exists public.data_import_runs (
  id uuid primary key default gen_random_uuid(),
  import_type text not null,
  market_segment text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'partial', 'failed', 'retrying')),
  source text not null,
  started_at timestamptz,
  finished_at timestamptz,
  total_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.all_market_companies(id) on delete cascade,
  import_run_id uuid references public.data_import_runs(id) on delete set null,
  severity text not null
    check (severity in ('critical', 'error', 'warning', 'info')),
  category text not null,
  field_name text,
  fiscal_year integer,
  message text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'ignored')),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.all_market_companies (
  ticker,
  company_name,
  edinet_code,
  market_segment,
  market_segment_updated_at,
  scoring_model,
  last_financial_update,
  source_payload
)
select
  legacy.ticker,
  legacy.company_name,
  nullif(coalesce(to_jsonb(legacy)->>'edinet_code', to_jsonb(legacy)->>'doc_id'), ''),
  coalesce(nullif(lower(trim(legacy.market_segment)), ''), 'growth'),
  coalesce(legacy.market_segment_updated_at, now()),
  case coalesce(nullif(lower(trim(legacy.market_segment)), ''), 'growth')
    when 'prime' then 'prime_v1'
    when 'standard' then 'standard_v1'
    else 'growth_v1'
  end,
  now(),
  to_jsonb(legacy)
from public.company_analyses legacy
where legacy.ticker is not null
  and legacy.company_name is not null
on conflict (ticker) do update set
  company_name = excluded.company_name,
  edinet_code = coalesce(excluded.edinet_code, public.all_market_companies.edinet_code),
  market_segment = excluded.market_segment,
  market_segment_updated_at = excluded.market_segment_updated_at,
  scoring_model = excluded.scoring_model,
  last_financial_update = excluded.last_financial_update,
  source_payload = excluded.source_payload,
  updated_at = now();

insert into public.market_memberships (
  company_id,
  market_segment,
  effective_from,
  is_current,
  source
)
select
  company.id,
  company.market_segment,
  current_date,
  true,
  'legacy_backfill'
from public.all_market_companies company
where not exists (
  select 1
  from public.market_memberships membership
  where membership.company_id = company.id
    and membership.is_current
);

insert into public.company_financial_periods (
  company_id,
  fiscal_year,
  period_end,
  document_id,
  accounting_scope,
  period_type,
  financials,
  source_payload,
  source_position,
  data_quality
)
select
  company.id,
  case
    when coalesce(item.value->>'year', '') ~ '^[0-9]{4}$'
      then (item.value->>'year')::integer
    else null
  end,
  case
    when coalesce(item.value->>'periodEnd', item.value->>'period_end', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then coalesce(item.value->>'periodEnd', item.value->>'period_end')::date
    else null
  end,
  nullif(coalesce(item.value->>'docId', item.value->>'doc_id', to_jsonb(legacy)->>'doc_id'), ''),
  case
    when lower(coalesce(item.value->>'scope', '')) in ('non_consolidated', 'non-consolidated', 'standalone')
      then 'non_consolidated'
    when lower(coalesce(item.value->>'scope', '')) in ('consolidated', '連結')
      then 'consolidated'
    else 'unknown'
  end,
  'annual',
  item.value,
  item.value,
  item.ordinality::integer,
  'unreviewed'
from public.company_analyses legacy
join public.all_market_companies company on company.ticker = legacy.ticker
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(to_jsonb(legacy)->'history') = 'array'
      then to_jsonb(legacy)->'history'
    else '[]'::jsonb
  end
) with ordinality as item(value, ordinality)
on conflict do nothing;

insert into public.company_score_snapshots (
  company_id,
  market_segment,
  scoring_model,
  model_version,
  total_score,
  danger_score,
  score_breakdown,
  calculation_basis,
  is_current
)
select
  company.id,
  company.market_segment,
  company.scoring_model,
  'legacy-1',
  case
    when coalesce(to_jsonb(legacy)->>'score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (to_jsonb(legacy)->>'score')::numeric
    else null
  end,
  case
    when coalesce(to_jsonb(legacy)->>'danger_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (to_jsonb(legacy)->>'danger_score')::numeric
    else null
  end,
  coalesce(to_jsonb(legacy)->'score_breakdown', '{}'::jsonb),
  jsonb_build_object('source', 'company_analyses', 'ticker', legacy.ticker),
  true
from public.company_analyses legacy
join public.all_market_companies company on company.ticker = legacy.ticker
where not exists (
  select 1
  from public.company_score_snapshots snapshot
  where snapshot.company_id = company.id
    and snapshot.scoring_model = company.scoring_model
    and snapshot.is_current
);

insert into public.company_risk_snapshots (
  company_id,
  risk_model,
  model_version,
  risk_level,
  danger_score,
  flags,
  calculation_basis,
  is_current
)
select
  company.id,
  'danger_v1',
  'legacy-1',
  nullif(to_jsonb(legacy)->>'risk_level', ''),
  case
    when coalesce(to_jsonb(legacy)->>'danger_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (to_jsonb(legacy)->>'danger_score')::numeric
    else null
  end,
  case
    when jsonb_typeof(to_jsonb(legacy)->'risk'->'flags') = 'array'
      then to_jsonb(legacy)->'risk'->'flags'
    else '[]'::jsonb
  end,
  jsonb_build_object('source', 'company_analyses', 'ticker', legacy.ticker),
  true
from public.company_analyses legacy
join public.all_market_companies company on company.ticker = legacy.ticker
where not exists (
  select 1
  from public.company_risk_snapshots snapshot
  where snapshot.company_id = company.id
    and snapshot.risk_model = 'danger_v1'
    and snapshot.is_current
);

create or replace view public.company_analyses_all_markets as
select
  legacy.*,
  company.id as all_market_company_id,
  company.market_segment as resolved_market_segment,
  company.industry_code,
  company.industry_name,
  company.security_type,
  company.listing_status,
  company.scoring_model,
  company.data_quality,
  company.last_financial_update
from public.company_analyses legacy
left join public.all_market_companies company on company.ticker = legacy.ticker;

alter table public.all_market_companies enable row level security;
alter table public.market_memberships enable row level security;
alter table public.company_financial_periods enable row level security;
alter table public.company_score_snapshots enable row level security;
alter table public.company_risk_snapshots enable row level security;
alter table public.data_import_runs enable row level security;
alter table public.data_quality_issues enable row level security;

comment on table public.all_market_companies is '全市場共通会社マスタ。既存companiesとは分離する。';
comment on table public.market_memberships is '市場区分履歴。';
comment on table public.company_financial_periods is '会社・会計期間単位の財務履歴。';
comment on table public.company_score_snapshots is '市場別スコア計算履歴。';
comment on table public.company_risk_snapshots is 'Danger ScoreとRed Flagsの計算履歴。';
comment on table public.data_import_runs is '東証・EDINET等のインポート実行履歴。';
comment on table public.data_quality_issues is 'データ品質問題の管理テーブル。';
