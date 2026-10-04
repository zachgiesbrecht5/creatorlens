-- Creator portal (phase 1): creator accounts linked to roster rows, projects/payouts,
-- events, experiments, requests. Portal is OFF per creator until the manager turns it on.
alter table profiles add column if not exists role text not null default 'manager';     -- manager | creator
alter table roster_creators add column if not exists creator_user_id uuid references profiles(id) on delete set null;
alter table roster_creators add column if not exists portal_enabled boolean not null default false;
alter table watchlist add column if not exists added_by text not null default 'manager';   -- manager | creator

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,          -- manager who owns the roster row
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  brand text not null,
  title text,
  deliverables text,
  status text not null default 'confirmed',   -- confirmed | in_production | delivered | invoiced | paid | cancelled
  due_at date,
  go_live_at date,
  fee numeric,
  currency text not null default 'USD',
  invoice_sent_at date,
  paid_at date,
  notes text,
  source text not null default 'manual',      -- manual | inbox
  source_ref text,
  visible boolean not null default true,      -- shown to the creator
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_roster on projects (roster_creator_id, status, due_at);
alter table projects enable row level security;

create table if not exists creator_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  roster_creator_id uuid references roster_creators(id) on delete cascade,   -- null = all creators
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  brand text,
  details text,
  rsvp_url text,
  source text not null default 'manual',
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
alter table creator_events enable row level security;

create table if not exists experiments (
  id uuid primary key default gen_random_uuid(),
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  idea text not null,
  why text,
  hook text,
  status text not null default 'idea',       -- idea | testing | done | dropped
  result text,
  post_url text,
  metric numeric,
  suggested_by text not null default 'manager',   -- manager | creator
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table experiments enable row level security;

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  text text not null,
  status text not null default 'open',       -- open | in_progress | done
  reply text,
  created_by text not null default 'creator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table requests enable row level security;

-- link the ten creator emails (profiles are created on their first sign-in; the link is by email)
update roster_creators set creator_email = v.email from (values
  ('okay.ainsley','ainsley@rootforgroup.com'), ('cafeandy_','cafeandy@rootforgroup.com'), ('andyyyen','andy@rootforgroup.com'),
  ('briangoeslive','brian@rootforgroup.com'), ('the.lead.lady','theleadlady@rootforgroup.com'), ('lizziebowker','elizabeth@rootforgroup.com'),
  ('jimmyeverydayy','jimmy@rootforgroup.com'), ('mariianarangel','mariana@rootforgroup.com'), ('bytianamichele','tiana@rootforgroup.com'), ('yoojinslife','yoojin@rootforgroup.com')
) as v(handle, email) where lower(replace(roster_creators.handle, '@', '')) = v.handle and roster_creators.creator_email is null;
