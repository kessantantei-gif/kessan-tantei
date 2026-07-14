-- 決算探偵 全市場対応 Phase 1
-- 既存の company_analyses を停止・削除せず、正規化テーブルへ段階移行する。
-- 再実行可能な冪等マイグレーション。

create extension if not exists pgcrypto;

alter table if exists public.company_analyses
  add column if not exists market_segment text;

alter table if exists public.company_analyses
  add column if not exists market_segment_updated_at timestamptz;

update public.company_analyses
set
  market_segment = coalesce(nullif(lower(trim(market_segment)), ''), 'growth'),
  market_segment_updated_at = coalesce(market_segment_updated_at, now())
where market_segment is null
   or trim(market_segment) = ''
   or market_segment_updated_at is null;

alter table if exists public.company_analyses
  drop constraint if exists company_analyses_market_segment_check;

alter table if exists public.company_analyses
  add constraint company_analyses_market_segment_check
  check (market_segment in ('growth', 'standard', 'prime', 'other')) not valid;

alter table if exists public.company_analyses
  validate constraint company_analyses_market_segment_check;

create table if not exists public.companies (
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

create index if not exists companies_market_segment_idx
  on public.companies (market_segment, listing_status);
create index if not exists companies_edinet_code_idx
  on public.companies (edinet_code)
  where edinet_code is not null;
create index if not exists companies_industry_idx
  on public.companies (industry_code, industry_name);

create table if not exists public.market_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
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
  company_id uuid not null references public.companies(id) on delete cascade,
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
  on public.company_financial_periods (company_id, coalesce(document_id, ''), coalesce(source_position, -1));
create index if not exists company_financial_periods_company_period_idx
  on public.company_financial_periods (company_id, period_end desc, fiscal_year desc);

create table if not exists public.company_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
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
  company_id uuid not null references public.companies(id) on delete cascade,
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

create index if not exists data_import_runs_status_idx
  on public.data_import_runs (status, created_at desc);

create table if not exists public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
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

create index if not exists data_quality_issues_open_idx
  on public.data_quality_issues (severity, status, created_at desc);
create index if not exists data_quality_issues_company_idx
  on public.data_quality_issues (company_id, status);

-- 既存 company_analyses から会社マスタをバックフィルする。
insert into public.companies (
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
  c.ticker,
  c.company_name,
  nullif(coalesce(to_jsonb(c)->>'edinet_code', to_jsonb(c)->>'doc_id'), ''),
  coalesce(nullif(to_jsonb(c)->>'market_segment', ''), 'growth'),
  coalesce((to_jsonb(c)->>'market_segment_updated_at')::timestamptz, now()),
  case coalesce(nullif(to_jsonb(c)->>'market_segment', ''), 'growth')
    when 'prime' then 'prime_v1'
    when 'standard' then 'standard_v1'
    else 'growth_v1'
  end,
  coalesce(
    (to_jsonb(c)->>'updated_at')::timestamptz,
    (to_jsonb(c)->>'created_at')::timestamptz,
    now()
  ),
  to_jsonb(c)
from public.company_analyses c
where c.ticker is not null
  and c.company_name is not null
on conflict (ticker) do update set
  company_name = excluded.company_name,
  edinet_code = coalesce(excluded.edinet_code, public.companies.edinet_code),
  market_segment = excluded.market_segment,
  market_segment_updated_at = excluded.market_segment_updated_at,
  scoring_model = excluded.scoring_model,
  last_financial_update = excluded.last_financial_update,
  source_payload = excluded.source_payload,
  updated_at = now();

-- 現在市場区分を履歴テーブルへ登録する。
insert into public.market_memberships (
  company_id,
  market_segment,
  effective_from,
  is_current,
  source
)
select
  c.id,
  c.market_segment,
  coalesce(c.listing_date, current_date),
  true,
  'legacy_backfill'
from public.companies c
where not exists (
  select 1
  from public.market_memberships m
  where m.company_id = c.id
    and m.is_current
);

-- history JSONを年度別テーブルへ展開する。元JSONも保持するためロスレスで移行できる。
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
join public.companies company on company.ticker = legacy.ticker
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(to_jsonb(legacy)->'history') = 'array'
      then to_jsonb(legacy)->'history'
    else '[]'::jsonb
  end
) with ordinality as item(value, ordinality)
on conflict do nothing;

-- 現行スコアをスナップショットとして保存する。
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
  case when coalesce(to_jsonb(legacy)->>'score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (to_jsonb(legacy)->>'score')::numeric else null end,
  case when coalesce(to_jsonb(legacy)->>'danger_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (to_jsonb(legacy)->>'danger_score')::numeric else null end,
  coalesce(to_jsonb(legacy)->'score_breakdown', '{}'::jsonb),
  jsonb_build_object('source', 'company_analyses', 'ticker', legacy.ticker),
  true
from public.company_analyses legacy
join public.companies company on company.ticker = legacy.ticker
where not exists (
  select 1
  from public.company_score_snapshots score
  where score.company_id = company.id
    and score.scoring_model = company.scoring_model
    and score.is_current
);

-- 現行リスクをスナップショットとして保存する。
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
  case when coalesce(to_jsonb(legacy)->>'danger_score', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (to_jsonb(legacy)->>'danger_score')::numeric else null end,
  case
    when jsonb_typeof(to_jsonb(legacy)->'risk'->'flags') = 'array'
      then to_jsonb(legacy)->'risk'->'flags'
    else '[]'::jsonb
  end,
  jsonb_build_object('source', 'company_analyses', 'ticker', legacy.ticker),
  true
from public.company_analyses legacy
join public.companies company on company.ticker = legacy.ticker
where not exists (
  select 1
  from public.company_risk_snapshots risk
  where risk.company_id = company.id
    and risk.risk_model = 'danger_v1'
    and risk.is_current
);

-- 既存アプリが移行中も利用できる読み取り互換ビュー。
create or replace view public.company_analyses_all_markets as
select
  legacy.*,
  company.id as company_id,
  company.market_segment as resolved_market_segment,
  company.industry_code,
  company.industry_name,
  company.security_type,
  company.listing_status,
  company.scoring_model,
  company.data_quality,
  company.last_financial_update
from public.company_analyses legacy
left join public.companies company on company.ticker = legacy.ticker;

alter table public.companies enable row level security;
alter table public.market_memberships enable row level security;
alter table public.company_financial_periods enable row level security;
alter table public.company_score_snapshots enable row level security;
alter table public.company_risk_snapshots enable row level security;
alter table public.data_import_runs enable row level security;
alter table public.data_quality_issues enable row level security;

comment on table public.companies is '全市場共通の会社マスタ。company_analysesから段階移行する。';
comment on table public.market_memberships is '市場区分の履歴。1社につき現在区分は1件。';
comment on table public.company_financial_periods is '会社・会計期間単位の財務履歴。元JSONを保持する。';
comment on table public.company_score_snapshots is '市場別スコアモデルの計算履歴。';
comment on table public.company_risk_snapshots is 'Danger ScoreとRed Flagsの計算履歴。';
comment on table public.data_import_runs is '東証・EDINET等のインポート実行履歴。';
comment on table public.data_quality_issues is '自動監査・目視レビューで発見した品質問題。';
