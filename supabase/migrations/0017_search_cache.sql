-- Cache for live platform lookups made from the search box, so a name that
-- was searched once never costs quota again for 7 days.
create table if not exists search_cache (
  key text primary key,                 -- "<platform>:<kind>:<query>"
  results jsonb not null,
  created_at timestamptz not null default now()
);
alter table search_cache enable row level security;
-- per-user live-search throttle (YouTube name search costs 100 units)
create table if not exists search_spend (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  yt_searches int not null default 0,
  primary key (user_id, day)
);
alter table search_spend enable row level security;
