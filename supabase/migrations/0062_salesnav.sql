-- Sales Navigator rows sent by the Sponsorprint Sales Nav Chrome extension.
-- Admin-only (Zach + Victoria): reads are gated by is_admin_user(); all writes go through
-- the service role (ingest route + worker enrichment), so there are no write policies.

create table if not exists salesnav_accounts (
  id uuid primary key default gen_random_uuid(),
  li_company_id text not null unique,
  name text not null,
  key text not null,
  industry text,
  employees text,
  employees_n int,
  revenue text,
  location text,
  about text,
  signals text[] not null default '{}',
  hiring boolean not null default false,
  logo_url text,
  domain text,
  brand_id uuid references brands(id) on delete set null,
  score int not null default 1,
  score_why text[] not null default '{}',
  status text not null default 'new',            -- new | target | pitched | skip
  enrich_status text not null default 'pending', -- pending | done | no_domain | failed
  emails jsonb not null default '[]',            -- [{email,name,title,bucket,confidence}]
  search_label text,
  scraped_by uuid references profiles(id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  enriched_at timestamptz
);
create index if not exists salesnav_accounts_key_idx on salesnav_accounts(key);
create index if not exists salesnav_accounts_enrich_idx on salesnav_accounts(enrich_status) where enrich_status = 'pending';

create table if not exists salesnav_people (
  id uuid primary key default gen_random_uuid(),
  li_lead_id text not null unique,
  full_name text not null,
  first_name text,
  last_name text,
  name_partial boolean not null default false,
  title text,
  relevance int not null default 0,              -- 0 skip .. 3 creator-facing
  company text,
  company_key text,
  li_company_id text,
  location text,
  degree text,
  tenure text,
  about text,
  photo_url text,
  domain text,
  brand_id uuid references brands(id) on delete set null,
  email text,
  email_score int,
  email_verified boolean not null default false,
  enrich_status text not null default 'pending', -- pending | queued | done | not_found | no_domain | partial_name | skipped | failed
  contact_id uuid references contacts(id) on delete set null,
  status text not null default 'new',            -- new | target | pitched | skip
  search_label text,
  scraped_by uuid references profiles(id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  enriched_at timestamptz
);
create index if not exists salesnav_people_company_idx on salesnav_people(li_company_id);
create index if not exists salesnav_people_key_idx on salesnav_people(company_key);
create index if not exists salesnav_people_enrich_idx on salesnav_people(enrich_status) where enrich_status in ('pending', 'queued');

create table if not exists salesnav_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  kind text not null,                            -- people | accounts
  label text,
  pages int not null default 0,
  rows int not null default 0,
  new_rows int not null default 0,
  stop_reason text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hunter spend for this feature, per day, so enrichment can stay inside a budget.
create table if not exists salesnav_spend (
  day date primary key,
  hunter_calls int not null default 0
);

alter table salesnav_accounts enable row level security;
alter table salesnav_people enable row level security;
alter table salesnav_runs enable row level security;
alter table salesnav_spend enable row level security;
drop policy if exists "salesnav accounts admin read" on salesnav_accounts;
create policy "salesnav accounts admin read" on salesnav_accounts for select using (is_admin_user());
drop policy if exists "salesnav people admin read" on salesnav_people;
create policy "salesnav people admin read" on salesnav_people for select using (is_admin_user());
drop policy if exists "salesnav runs admin read" on salesnav_runs;
create policy "salesnav runs admin read" on salesnav_runs for select using (is_admin_user());
drop policy if exists "salesnav spend admin read" on salesnav_spend;
create policy "salesnav spend admin read" on salesnav_spend for select using (is_admin_user());

create or replace function salesnav_spend_add(p_n int) returns int language sql security definer set search_path = public as $$
  insert into salesnav_spend (day, hunter_calls) values (current_date, p_n)
  on conflict (day) do update set hunter_calls = salesnav_spend.hunter_calls + excluded.hunter_calls
  returning hunter_calls;
$$;
revoke all on function salesnav_spend_add(int) from public, anon, authenticated;
