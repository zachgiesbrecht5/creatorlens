-- Content lanes: the categories a creator and their manager agreed to judge posts by (e.g. Jimmy's
-- "First Time Dad tutorials", "Partner support", "Lists", "Finance"). Stored per roster row as
-- [{key, label, pattern, job}] where pattern is a case-insensitive regex over what was said/written and
-- job is what the lane is for (growth | reach | connection | commercial). Null = the default set.
alter table roster_creators add column if not exists content_lanes jsonb;

-- Owned insights gain the two numbers the appendix is built on.
alter table owned_post_insights add column if not exists follows int;
alter table owned_post_insights add column if not exists total_interactions int;

-- Manager corrections to the auto-placement, by post url.
create table if not exists post_lane_overrides (
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  url text not null,
  lane text not null,
  created_at timestamptz not null default now(),
  primary key (roster_creator_id, url)
);
alter table post_lane_overrides enable row level security;
