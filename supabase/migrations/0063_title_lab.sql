-- Title Lab: a YouTube channel's titles ranked against its own median, a pattern
-- lift table, and a model read of why the winners win. One row per creator; the
-- worker fills it when status = 'queued'. Costs ~5-8 YouTube units and ~1-2c of
-- Haiku per run; results are cached 7 days (the UI offers a re-run after that).
create table if not exists title_labs (
  creator_id uuid primary key references creators(id) on delete cascade,
  status text not null default 'queued',          -- queued | running | done | failed
  requested_by uuid references profiles(id) on delete set null,
  error text,
  -- every video in the window: {id,title,url,published_at,views,kind,sponsored,mult,words,tags[]}
  items jsonb not null default '[]'::jsonb,
  items_n int not null default 0,
  median_video bigint,                              -- long-form median views (climbing videos excluded)
  median_short bigint,                              -- Shorts median views
  -- deterministic pattern lift: [{key,label,with_n,without_n,with_mult,without_mult,lift,examples[]}]
  patterns jsonb not null default '[]'::jsonb,
  -- Haiku read: {summary, winning[{name,why,examples[]}], weak[{name,why,examples[]}], rules[], avoid[], feedback}
  reading jsonb,
  model text,
  model_cost numeric(8,4) default 0,
  quota_units int default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists title_labs_status_idx on title_labs(status, created_at);

-- Draft titles people tested against a lab (so a creator can see what was suggested and what they shipped).
create table if not exists title_lab_rewrites (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  draft text not null,
  options jsonb not null default '[]'::jsonb,       -- [{title, pattern, why}]
  model text,
  model_cost numeric(8,4) default 0,
  created_at timestamptz not null default now()
);
create index if not exists title_lab_rewrites_creator_idx on title_lab_rewrites(creator_id, created_at desc);

alter table title_labs enable row level security;
alter table title_lab_rewrites enable row level security;
-- Reads go through the web app's service role after its own access check (same rule as the print:
-- admins, the house, anyone who unlocked the creator, and the creator themself). No direct client reads.
