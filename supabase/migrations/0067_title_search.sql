-- Title Search: type a topic, get the titles that broke out on YouTube for it. The worker
-- expands the prompt into a few searches, scores every video against its OWN channel's usual
-- views, builds the pattern lift table across channels and writes a read. ~450 YouTube units
-- and ~1c of Haiku per search; identical searches are shared for 7 days.
create table if not exists title_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  prompt text not null,
  prompt_key text not null,                         -- lowercased, collapsed whitespace: the cache key with format + window
  format text not null default 'any',               -- any | video | short
  window_days int not null default 90,
  status text not null default 'queued',            -- queued | running | done | failed
  error text,
  queries text[] not null default '{}',             -- the YouTube searches actually run
  items jsonb not null default '[]'::jsonb,         -- ranked TopicItem[]
  items_n int not null default 0,
  channels_n int not null default 0,
  patterns jsonb not null default '[]'::jsonb,
  reading jsonb,                                    -- {summary, winning[], weak[], rules[], templates[], angles[]}
  model text,
  model_cost numeric(8,4) default 0,
  quota_units int default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists title_searches_status_idx on title_searches(status, created_at);
create index if not exists title_searches_cache_idx on title_searches(prompt_key, format, window_days, finished_at desc);
create index if not exists title_searches_user_idx on title_searches(user_id, created_at desc);
alter table title_searches enable row level security;
revoke all on title_searches from anon, authenticated;
-- No client policies: reads and writes go through the web app's service role after its own access check.
