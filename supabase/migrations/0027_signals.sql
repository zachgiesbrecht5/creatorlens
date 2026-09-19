-- Sponsorship signals: public announcements that a brand signed a team,
-- league, event or venue. Each one is a dated reason to pitch local creators.
create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  brand text not null,
  brand_domain text,
  property text not null,               -- "Denver Broncos", "NFL", "Coachella"
  property_type text,                   -- team | league | event | festival | venue | athlete | other
  market text,                          -- "Denver, CO" or "National (US)"
  region text,                          -- state/province or country for matching
  category text,                        -- brand category guess: Finance, Food, Auto ...
  announced_at date,
  url text not null unique,
  source text,                          -- prnewswire | businesswire | sbj | sportico | adweek | team | brand | other
  summary text,
  activation_note text,                 -- what the creator program usually looks like for this kind of deal
  found_at timestamptz not null default now()
);
create index if not exists signals_time on signals (announced_at desc);
create index if not exists signals_region on signals (region);
alter table signals enable row level security;
drop policy if exists "signals read" on signals;
create policy "signals read" on signals for select using (auth.uid() is not null);

-- where each roster creator is based, for regional matching
alter table roster_creators add column if not exists location text;
alter table roster_creators add column if not exists region text;

create table if not exists signal_matches (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  signal_id uuid not null references signals(id) on delete cascade,
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  reason text not null,
  score int not null default 0,
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (signal_id, roster_creator_id)
);
create index if not exists signal_matches_user on signal_matches (user_id, seen, created_at desc);
alter table signal_matches enable row level security;
drop policy if exists "signal_matches own" on signal_matches;
create policy "signal_matches own" on signal_matches for select using (user_id = auth.uid());
