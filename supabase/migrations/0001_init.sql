-- CreatorLens schema. Run with `supabase db push` or paste into the SQL editor.
-- Shared pool: creators / partnerships / brands / contacts are visible to every
-- signed-in user (that is the point: everyone's scans feed one database).
-- Per-user: profiles, credits, connections, drafts, pitch prompts.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ── Users ─────────────────────────────────────────────────────
create type plan_t as enum ('trial', 'team', 'pro', 'admin');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  org_id uuid,
  plan plan_t not null default 'trial',
  scan_credits int not null default 5,
  draft_credits int not null default 3,
  pitch_prompt text,                      -- the user's "skill": how to write their pitches
  signature text,                          -- e.g. "rooting for you"
  referral_code text unique default encode(gen_random_bytes(4), 'hex'),
  referred_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references profiles(id),
  shared_prompt text,
  created_at timestamptz not null default now()
);
alter table profiles add constraint profiles_org_fk foreign key (org_id) references orgs(id);

create table credit_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('scan','draft')),
  delta int not null,
  reason text not null,          -- 'trial_grant', 'scan', 'draft', 'referral', 'purchase', 'admin'
  ref text,
  created_at timestamptz not null default now()
);

-- Google refresh token for Gmail drafts (encrypted at rest by Supabase; only service role reads it).
create table google_connections (
  user_id uuid primary key references profiles(id) on delete cascade,
  refresh_token text not null,
  scopes text[] not null,
  email text,
  updated_at timestamptz not null default now()
);

-- Instagram business accounts users connect. Each one adds Meta rate-limit capacity.
create table ig_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  ig_user_id text not null,
  ig_username text,
  access_token text not null,     -- long-lived user token or system-user token
  is_house boolean not null default false,
  healthy boolean not null default true,
  last_error text,
  cooldown_until timestamptz,
  calls_this_hour int not null default 0,
  hour_bucket timestamptz,
  created_at timestamptz not null default now(),
  unique (ig_user_id)
);

-- ── Shared pool ───────────────────────────────────────────────
create type platform_t as enum ('youtube', 'instagram', 'tiktok');

create table creators (
  id uuid primary key default gen_random_uuid(),
  platform platform_t not null,
  external_id text not null,
  handle text not null,
  display_name text,
  followers bigint default 0,
  avatar_url text,
  bio text,
  category text default 'Other',
  last_scanned_at timestamptz,
  scan_count int not null default 0,
  first_scanned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);
create index creators_handle_idx on creators using gin (handle gin_trgm_ops);
create index creators_name_idx on creators using gin (display_name gin_trgm_ops);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key text not null unique,        -- lowercased, alphanumeric
  domain text,
  category text,
  is_mass_sponsor boolean not null default false,
  deal_count int not null default 0,
  creator_count int not null default 0,
  last_seen date,
  created_at timestamptz not null default now()
);
create index brands_name_idx on brands using gin (name gin_trgm_ops);

create table partnerships (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  platform platform_t not null,
  content_id text not null,
  content_title text,
  content_url text,
  published_at timestamptz,
  views bigint default 0,
  thumbnail text,
  confidence_score int not null,
  confidence_label text not null check (confidence_label in ('High','Medium','Low')),
  signal_type text,
  evidence text,
  status text not null default 'auto' check (status in ('auto','confirmed','rejected')),
  scanned_at timestamptz not null default now(),
  unique (creator_id, brand_id, content_id)
);
create index partnerships_creator_idx on partnerships(creator_id);
create index partnerships_brand_idx on partnerships(brand_id);

-- Contacts: seeded from the Outreach Log, enriched on demand.
create table contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text,
  email text,
  title text,
  source text not null default 'tracker',   -- tracker | hunter | manual | apollo
  verified boolean not null default false,
  last_replied_at date,
  notes text,
  created_at timestamptz not null default now(),
  unique (brand_id, email)
);
create index contacts_brand_idx on contacts(brand_id);

-- Org-level outreach history (so nobody double-pitches a brand).
create table outreach_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  user_id uuid references profiles(id),
  brand_id uuid references brands(id),
  creator_handle text,
  contact_email text,
  subject text,
  status text default 'drafted',     -- drafted | sent | replied | declined | excluded
  gmail_draft_id text,
  thread_link text,
  sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index outreach_brand_idx on outreach_log(brand_id);

create table exclusions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id),
  brand_key text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (org_id, brand_key)
);

-- ── Scan queue ────────────────────────────────────────────────
create type job_status_t as enum ('queued','running','done','failed','rate_limited');

create table scan_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  platform platform_t not null,
  handle text not null,
  creator_id uuid references creators(id),
  status job_status_t not null default 'queued',
  priority int not null default 5,
  attempts int not null default 0,
  error text,
  items_checked int,
  rows_found int,
  quota_units int,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index scan_jobs_queue_idx on scan_jobs(status, priority, run_after);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid references creators(id),
  brand_id uuid references brands(id),
  contact_id uuid references contacts(id),
  subject text,
  body text,
  gmail_draft_id text,
  model text,
  created_at timestamptz not null default now()
);

create table learned_aliases (
  key text primary key,
  name text not null,
  deal_count int not null default 0,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

create table house_quota (
  day date primary key,
  yt_units int not null default 0
);

-- ── Helpers ───────────────────────────────────────────────────
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  insert into credit_ledger (user_id, kind, delta, reason) values (new.id, 'scan', 5, 'trial_grant'), (new.id, 'draft', 3, 'trial_grant');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Atomic credit spend. Returns true if spent, false if insufficient.
create or replace function spend_credit(p_user uuid, p_kind text, p_reason text, p_ref text default null)
returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  if p_kind = 'scan' then
    update profiles set scan_credits = scan_credits - 1 where id = p_user and (scan_credits > 0 or plan in ('team','pro','admin')) returning true into ok;
  else
    update profiles set draft_credits = draft_credits - 1 where id = p_user and (draft_credits > 0 or plan in ('team','pro','admin')) returning true into ok;
  end if;
  if ok then insert into credit_ledger (user_id, kind, delta, reason, ref) values (p_user, p_kind, -1, p_reason, p_ref); end if;
  return coalesce(ok, false);
end $$;

create or replace function grant_credits(p_user uuid, p_kind text, p_n int, p_reason text)
returns void language plpgsql security definer as $$
begin
  if p_kind = 'scan' then update profiles set scan_credits = scan_credits + p_n where id = p_user;
  else update profiles set draft_credits = draft_credits + p_n where id = p_user; end if;
  insert into credit_ledger (user_id, kind, delta, reason) values (p_user, p_kind, p_n, p_reason);
end $$;

-- Referral: both sides get 10 scans when the invitee signs up.
create or replace function apply_referral(p_new_user uuid, p_code text) returns boolean language plpgsql security definer as $$
declare ref_id uuid;
begin
  select id into ref_id from profiles where referral_code = p_code and id <> p_new_user;
  if ref_id is null then return false; end if;
  update profiles set referred_by = ref_id where id = p_new_user and referred_by is null;
  if not found then return false; end if;
  perform grant_credits(p_new_user, 'scan', 10, 'referral');
  perform grant_credits(ref_id, 'scan', 10, 'referral');
  return true;
end $$;

-- Brand wall: one row per brand for a creator (used by the profile page).
create or replace view brand_wall as
select
  p.creator_id,
  b.id as brand_id,
  b.name as brand,
  b.is_mass_sponsor,
  count(*) as deals,
  array_agg(distinct p.platform::text) as platforms,
  max(p.confidence_score) as best_score,
  (array_agg(p.confidence_label order by p.confidence_score desc))[1] as best_label,
  min(p.published_at) as first_seen,
  max(p.published_at) as last_seen,
  (array_agg(p.evidence order by p.confidence_score desc))[1] as evidence,
  (array_agg(p.content_url order by p.confidence_score desc))[1] as content_url,
  (array_agg(p.content_title order by p.confidence_score desc))[1] as content_title,
  (count(*) filter (where p.confidence_label in ('High','Medium')) >= 2
    and max(p.published_at) - min(p.published_at) >= interval '30 days') as repeat_partner,
  (select count(distinct creator_id) from partnerships p2 where p2.brand_id = b.id) as creators_booked
from partnerships p join brands b on b.id = p.brand_id
where p.status <> 'rejected'
group by p.creator_id, b.id, b.name, b.is_mass_sponsor;

-- ── RLS ───────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table orgs enable row level security;
alter table credit_ledger enable row level security;
alter table google_connections enable row level security;
alter table ig_connections enable row level security;
alter table creators enable row level security;
alter table brands enable row level security;
alter table partnerships enable row level security;
alter table contacts enable row level security;
alter table outreach_log enable row level security;
alter table exclusions enable row level security;
alter table scan_jobs enable row level security;
alter table drafts enable row level security;
alter table learned_aliases enable row level security;

create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "own profile update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "own ledger" on credit_ledger for select using (auth.uid() = user_id);
create policy "own org" on orgs for select using (id = (select org_id from profiles where id = auth.uid()));
create policy "own ig connections" on ig_connections for select using (auth.uid() = user_id);
create policy "own ig delete" on ig_connections for delete using (auth.uid() = user_id);
-- google_connections: no client policies at all; only the service role touches refresh tokens.

create policy "pool read creators" on creators for select using (auth.role() = 'authenticated');
create policy "pool read brands" on brands for select using (auth.role() = 'authenticated');
create policy "pool read partnerships" on partnerships for select using (auth.role() = 'authenticated');
create policy "pool read contacts" on contacts for select using (auth.role() = 'authenticated');
create policy "pool read aliases" on learned_aliases for select using (auth.role() = 'authenticated');
create policy "confirm partnerships" on partnerships for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "add contacts" on contacts for insert with check (auth.role() = 'authenticated');

create policy "org outreach" on outreach_log for select using (org_id = (select org_id from profiles where id = auth.uid()) or user_id = auth.uid());
create policy "org exclusions" on exclusions for select using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "pool read jobs" on scan_jobs for select using (auth.role() = 'authenticated');
create policy "own drafts" on drafts for select using (auth.uid() = user_id);

-- Realtime for scan progress
alter publication supabase_realtime add table scan_jobs;
