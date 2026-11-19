-- Scout: the worker searches YouTube around the clock for channels worth representing.
-- A scout query is a search phrase tied to a lane. Each run finds recent videos for it, keeps
-- mid-size channels whose video is far above their own usual views, prints the best ones, and
-- files them here with the sponsors found. Admin-only (service role; no client policies).

create table if not exists scout_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  lane text,
  active boolean not null default true,
  last_run_at timestamptz,
  runs int not null default 0,
  found int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists scout_queries_query on scout_queries (lower(query));

create table if not exists scout_candidates (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null unique,
  handle text not null,
  title text not null,
  subs bigint not null default 0,
  video_count int,
  thumbnail text,
  lane text,
  query text,
  breakout_video_id text,
  breakout_title text,
  breakout_views bigint,
  breakout_published_at timestamptz,
  median_views bigint,
  mult numeric,                 -- breakout views / the channel's own median
  views_per_sub numeric,        -- breakout views / subscribers
  uploads_60d int,
  sponsors int,                 -- null until the print lands
  sponsor_names text[],
  printed_at timestamptz,
  status text not null default 'new' check (status in ('new','shortlisted','contacted','dismissed')),
  note text,
  found_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scout_candidates_status on scout_candidates (status, found_at desc);

create table if not exists scout_runs (
  id bigint generated always as identity primary key,
  query_id uuid references scout_queries(id) on delete set null,
  query text,
  units int not null default 0,
  seen int not null default 0,
  kept int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists scout_runs_time on scout_runs (created_at desc);

alter table scout_queries enable row level security;
alter table scout_candidates enable row level security;
alter table scout_runs enable row level security;

-- Starting searches, one or two per lane on the house roster. Edit them on /scout.
insert into scout_queries (query, lane) values
  ('POV driving tips', 'Cars'),
  ('daily driver car build', 'Cars'),
  ('pro basketball overseas vlog', 'Sports'),
  ('day in the life pro athlete', 'Sports'),
  ('trail running film', 'Sports'),
  ('budget PC build guide', 'Tech'),
  ('home server setup', 'Tech'),
  ('home espresso setup', 'Coffee'),
  ('apartment makeover on a budget', 'Home and design'),
  ('skincare routine honest review', 'Beauty'),
  ('new dad day in the life', 'Family'),
  ('lawyer explains', 'Legal'),
  ('NYC day in my life vlog', 'Lifestyle'),
  ('travel geography explained', 'Travel')
on conflict do nothing;
