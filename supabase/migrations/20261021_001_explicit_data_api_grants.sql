-- Supabase Data API grant behavior changes on 2026-10-30.
-- Existing projects keep their current grants, but tables created after the
-- change (including fresh projects / preview branches / db reset) require
-- explicit grants. Keep server access reliable without widening client access.

begin;

-- Server-side application access. Kessan Tantei uses the service-role client
-- for application/database operations, so every existing table and sequence
-- must remain reachable through the Data API.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Migrations run as postgres. These defaults are a defense-in-depth fallback
-- for future public-schema objects; CI also requires an explicit per-table
-- service_role grant in every new table-creating migration from 2026-10-30.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;

alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;

-- Only tables that already have an intentional public SELECT RLS policy are
-- exposed to browser-facing roles. Do not blanket-grant writes to anon/auth.
grant usage on schema public to anon, authenticated;

grant select
  on table
    public.company_master,
    public.company_disclosures,
    public.company_quarterly_financials
  to anon, authenticated;

commit;
