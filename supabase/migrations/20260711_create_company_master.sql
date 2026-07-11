create table if not exists public.company_master (
  ticker text primary key,
  company_name text not null,
  theme text not null,
  sub_theme text not null,
  business_model text,
  market_cap_class text,
  rival_tickers text[] not null default '{}',
  keywords text[] not null default '{}',
  reviewed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists company_master_theme_idx
  on public.company_master (theme);

create index if not exists company_master_sub_theme_idx
  on public.company_master (sub_theme);

alter table public.company_master enable row level security;

create policy "company_master_public_read"
  on public.company_master
  for select
  using (true);

insert into public.company_master (
  ticker,
  company_name,
  theme,
  sub_theme,
  business_model,
  rival_tickers,
  keywords,
  reviewed
)
values
  (
    '186A',
    'アストロスケールホールディングス',
    '宇宙・衛星',
    'スペースデブリ除去・軌道上サービス',
    '宇宙インフラ・政府民間案件',
    array['9348', '5595', '290A'],
    array['宇宙', '衛星', 'デブリ', '軌道上サービス', 'スペースデブリ'],
    true
  ),
  (
    '9348',
    'ispace',
    '宇宙・衛星',
    '月面輸送・月面開発',
    '宇宙輸送・月面データ',
    array['186A', '5595', '290A'],
    array['宇宙', '月面', '月着陸', '月面輸送', 'ランダー'],
    true
  ),
  (
    '5595',
    'QPS研究所',
    '宇宙・衛星',
    '小型SAR衛星・地球観測',
    '衛星データ・官公庁法人向け',
    array['290A', '186A', '9348'],
    array['宇宙', '衛星', 'SAR', '地球観測', '小型衛星'],
    true
  ),
  (
    '290A',
    'Synspective',
    '宇宙・衛星',
    '小型SAR衛星・地球観測',
    '衛星データ・解析サービス',
    array['5595', '186A', '9348'],
    array['宇宙', '衛星', 'SAR', '地球観測', '解析'],
    true
  )
on conflict (ticker) do update set
  company_name = excluded.company_name,
  theme = excluded.theme,
  sub_theme = excluded.sub_theme,
  business_model = excluded.business_model,
  rival_tickers = excluded.rival_tickers,
  keywords = excluded.keywords,
  reviewed = excluded.reviewed,
  updated_at = now();
