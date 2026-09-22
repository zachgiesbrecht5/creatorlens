-- Listening layer: what people do (pageviews), what they say (feedback), and what they
-- think the index got wrong (corrections). Service-role only; no client policies.

create table if not exists pageviews (
  id bigserial primary key,
  anon_id text not null,
  user_id uuid references profiles(id) on delete set null,
  path text not null,
  referrer text,
  created_at timestamptz not null default now()
);
create index if not exists pageviews_created_idx on pageviews (created_at desc);
create index if not exists pageviews_anon_idx on pageviews (anon_id, created_at desc);
alter table pageviews enable row level security;

create table if not exists feedback (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete set null,
  email text,
  path text,
  mood text check (mood in ('love','ok','stuck')),
  kind text not null default 'feedback' check (kind in ('feedback','question')),
  body text,
  status text not null default 'new' check (status in ('new','done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_idx on feedback (created_at desc);
alter table feedback enable row level security;

-- Outsiders flagging a deal no longer edits the shared index directly; it lands here for review.
create table if not exists corrections (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete set null,
  creator_id uuid references creators(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  scope text not null default 'pair' check (scope in ('pair','brand')),
  note text,
  status text not null default 'open' check (status in ('open','applied','dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, creator_id, brand_id, scope)
);
create index if not exists corrections_open_idx on corrections (status, created_at desc);
alter table corrections enable row level security;

-- Per-user hides so the flagger stops seeing the row right away while it's reviewed.
create table if not exists partnership_hides (
  user_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid not null references creators(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, creator_id, brand_id)
);
alter table partnership_hides enable row level security;

-- Keep pageviews lean: drop anything older than 180 days (called by the nightly worker snapshot).
create or replace function prune_pageviews() returns int language sql security definer set search_path = public as $$
  with d as (delete from pageviews where created_at < now() - interval '180 days' returning 1) select count(*)::int from d;
$$;
select 'ok' as done;
