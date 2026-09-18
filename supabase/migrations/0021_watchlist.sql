-- Watchlist: creators a user wants re-printed every week, with a log of what
-- changed (new brands) so the app can say "3 new deals on your watchlist".
create table if not exists watchlist (
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null,
  handle text not null,
  known_brands jsonb not null default '[]'::jsonb,   -- brand names seen at last check
  added_at timestamptz not null default now(),
  last_checked_at timestamptz,
  primary key (user_id, platform, handle)
);
alter table watchlist enable row level security;
drop policy if exists "watchlist own" on watchlist;
create policy "watchlist own" on watchlist for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists watch_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null,
  handle text not null,
  new_brands jsonb not null,     -- [{brand, brand_id, deals}]
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists watch_events_user on watch_events (user_id, seen, created_at desc);
alter table watch_events enable row level security;
drop policy if exists "watch_events own" on watch_events;
create policy "watch_events own" on watch_events for select using (user_id = auth.uid());
