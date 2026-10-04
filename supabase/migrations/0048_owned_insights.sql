-- Owned insights: for roster creators whose Instagram sits in the manager's business
-- portfolio, read saves, shares, reach and views per post through the manager's connection.
alter table ig_connections add column if not exists owned boolean not null default false;   -- in our business portfolio (insights readable)
create table if not exists owned_post_insights (
  id bigint generated always as identity primary key,
  ig_user_id text not null,
  creator_id uuid references creators(id) on delete cascade,
  media_id text not null unique,
  permalink text,
  posted_at timestamptz,
  media_type text,
  caption text,
  likes int, comments int, saves int, shares int, reach int, views int,
  updated_at timestamptz not null default now()
);
create index if not exists owned_post_creator on owned_post_insights (creator_id, posted_at desc);
alter table owned_post_insights enable row level security;
alter table ig_connections add column if not exists insights_synced_at timestamptz;
