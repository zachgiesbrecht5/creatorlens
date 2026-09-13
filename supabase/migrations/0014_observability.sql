-- Observability: product events (the funnel), alerts (things that broke),
-- worker heartbeats (is it alive), nightly snapshots (did data disappear).

create table if not exists events (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  name text not null,                 -- signup | print | print_cached | reveal | reveal_locked | draft | research | checkout_started | upgraded | downgraded
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time on events (name, created_at desc);
create index if not exists events_user_time on events (user_id, created_at desc);
alter table events enable row level security;
drop policy if exists "events admin" on events;
create policy "events admin" on events for select using (is_admin_user());

create table if not exists alerts (
  id bigint generated always as identity primary key,
  source text not null,               -- worker | web
  level text not null default 'error',
  message text not null,
  detail jsonb,
  acked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table alerts enable row level security;
drop policy if exists "alerts admin" on alerts;
create policy "alerts admin" on alerts for select using (is_admin_user());

create table if not exists heartbeats (
  source text primary key,
  last_seen timestamptz not null default now(),
  detail jsonb
);
alter table heartbeats enable row level security;
drop policy if exists "heartbeats admin" on heartbeats;
create policy "heartbeats admin" on heartbeats for select using (is_admin_user());

-- nightly row counts so a bad migration or a runaway delete is visible next morning
create table if not exists snapshots (
  day date primary key,
  counts jsonb not null,
  created_at timestamptz not null default now()
);
alter table snapshots enable row level security;
drop policy if exists "snapshots admin" on snapshots;
create policy "snapshots admin" on snapshots for select using (is_admin_user());

-- storage bucket for nightly JSON exports of the core tables
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;

-- signup event from the profile trigger
create or replace function log_signup() returns trigger language plpgsql security definer as $$
begin
  insert into events (user_id, name, props) values (new.id, 'signup', jsonb_build_object('plan', new.plan, 'org', new.org_id is not null));
  return new;
end $$;
drop trigger if exists profiles_log_signup on profiles;
create trigger profiles_log_signup after insert on profiles for each row execute function log_signup();
