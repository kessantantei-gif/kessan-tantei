begin;

-- company_analyses was created before the all-market master and still points to
-- public.companies. That prevents Standard/Prime tickers from being stored.
alter table public.company_analyses
  drop constraint if exists company_analyses_ticker_fkey;

-- Remove any other legacy FK from company_analyses.ticker to public.companies.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class child_table on child_table.oid = con.conrelid
    join pg_namespace child_schema on child_schema.oid = child_table.relnamespace
    join pg_class parent_table on parent_table.oid = con.confrelid
    join pg_namespace parent_schema on parent_schema.oid = parent_table.relnamespace
    where con.contype = 'f'
      and child_schema.nspname = 'public'
      and child_table.relname = 'company_analyses'
      and parent_schema.nspname = 'public'
      and parent_table.relname = 'companies'
  loop
    execute format(
      'alter table public.company_analyses drop constraint %I',
      constraint_name
    );
  end loop;
end $$;

-- The all-market company ticker is the canonical parent key.
alter table public.company_analyses
  add constraint company_analyses_ticker_all_market_fkey
  foreign key (ticker)
  references public.all_market_companies(ticker)
  on update cascade
  on delete restrict
  not valid;

alter table public.company_analyses
  validate constraint company_analyses_ticker_all_market_fkey;

create index if not exists company_analyses_ticker_created_at_idx
  on public.company_analyses (ticker, created_at desc);

commit;
