create table if not exists public.acquisition_events (
  id bigserial primary key,
  event_name text not null,
  path text,
  clerk_user_id text,
  anonymous_id text,
  session_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists acquisition_events_created_at_idx
  on public.acquisition_events (created_at desc);

create index if not exists acquisition_events_event_name_idx
  on public.acquisition_events (event_name);

create index if not exists acquisition_events_utm_source_idx
  on public.acquisition_events (utm_source);

alter table public.acquisition_events enable row level security;
