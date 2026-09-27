-- Lane cache: candidate creators the agent found for a platform + category +
-- size band. One search serves every creator in that lane for two weeks;
-- neighborhoods draw from the cache first and only call the model when it
-- runs dry. Cuts model spend per neighborhood by roughly 5x.
create table if not exists lane_candidates (
  id bigint generated always as identity primary key,
  platform text not null,
  category text not null,
  band text not null,                 -- 'xs' <25K, 's' <100K, 'm' <500K, 'l' <2M, 'xl'
  handle text not null,
  display_name text,
  avatar_url text,
  followers int,
  reason text,
  media jsonb,
  bio text,
  external_id text,
  created_at timestamptz not null default now(),
  unique (platform, category, band, handle)
);
create index if not exists lane_candidates_lane on lane_candidates (platform, category, band, created_at desc);
alter table lane_candidates enable row level security;
