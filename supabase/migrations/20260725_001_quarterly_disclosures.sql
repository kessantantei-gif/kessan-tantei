-- 決算探偵 四半期・半期開示基盤
-- 運用開始日以降の決算短信とEDINET半期報告書を履歴保存する。
-- 再実行可能な冪等マイグレーション。

create extension if not exists pgcrypto;

create table if not exists public.company_disclosures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.all_market_companies(id) on delete cascade,
  ticker text not null,
  source text not null check (source in ('tdnet', 'edinet')),
  source_document_id text not null,
  document_type text not null check (
    document_type in (
      'q1_earnings',
      'q2_earnings',
      'q3_earnings',
      'annual_earnings',
      'semiannual_report',
      'forecast_revision',
      'dividend_revision',
      'correction',
      'other'
    )
  ),
  title text not null,
  disclosed_at timestamptz not null,
  fiscal_year integer,
  fiscal_period_end date,
  quarter integer check (quarter is null or quarter between 1 and 4),
  cumulative boolean not null default true,
  accounting_scope text not null default 'consolidated'
    check (accounting_scope in ('consolidated', 'non_consolidated', 'unknown')),
  accounting_standard text,
  currency text not null default 'JPY',
  source_url text,
  xbrl_url text,
  pdf_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  is_correction boolean not null default false,
  supersedes_disclosure_id uuid references public.company_disclosures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_document_id)
);

create index if not exists company_disclosures_company_date_idx
  on public.company_disclosures (company_id, disclosed_at desc);
create index if not exists company_disclosures_ticker_period_idx
  on public.company_disclosures (ticker, fiscal_period_end desc, quarter desc);
create index if not exists company_disclosures_type_idx
  on public.company_disclosures (document_type, disclosed_at desc);

create table if not exists public.company_quarterly_financials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.all_market_companies(id) on delete cascade,
  disclosure_id uuid not null references public.company_disclosures(id) on delete cascade,
  ticker text not null,
  fiscal_year integer not null,
  fiscal_period_end date not null,
  quarter integer not null check (quarter between 1 and 4),
  cumulative boolean not null default true,
  accounting_scope text not null default 'consolidated'
    check (accounting_scope in ('consolidated', 'non_consolidated', 'unknown')),
  accounting_standard text,
  currency text not null default 'JPY',
  revenue numeric,
  operating_income numeric,
  ordinary_income numeric,
  profit_attributable_to_owners numeric,
  operating_cf numeric,
  investing_cf numeric,
  financing_cf numeric,
  total_assets numeric,
  net_assets numeric,
  equity numeric,
  earnings_forecast_revenue numeric,
  earnings_forecast_operating_income numeric,
  earnings_forecast_ordinary_income numeric,
  earnings_forecast_profit numeric,
  data_quality text not null default 'unreviewed'
    check (data_quality in ('verified', 'reviewed', 'warning', 'error', 'unreviewed')),
  extraction_version text not null default 'quarterly-v1',
  raw_financials jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, fiscal_period_end, quarter, accounting_scope)
);

create index if not exists company_quarterly_financials_company_period_idx
  on public.company_quarterly_financials (company_id, fiscal_period_end desc, quarter desc);
create index if not exists company_quarterly_financials_ticker_period_idx
  on public.company_quarterly_financials (ticker, fiscal_period_end desc, quarter desc);

alter table public.company_disclosures enable row level security;
alter table public.company_quarterly_financials enable row level security;

drop policy if exists "Public read company disclosures" on public.company_disclosures;
create policy "Public read company disclosures"
  on public.company_disclosures for select
  using (true);

drop policy if exists "Public read quarterly financials" on public.company_quarterly_financials;
create policy "Public read quarterly financials"
  on public.company_quarterly_financials for select
  using (true);

comment on table public.company_disclosures is
  'TDnet決算短信・訂正短信・EDINET半期報告書の原本メタデータ';
comment on table public.company_quarterly_financials is
  '四半期ごとの公式累計値。欠損項目は0ではなくNULLで保持する';
