-- Morning drop: three prints a day per active user, picked for their lane
-- (the categories of the creators on their roster). Free, unlocked for them.
create table if not exists drops (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  items jsonb not null default '[]'::jsonb,   -- [{creator_id, reason}]
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table drops enable row level security;
drop policy if exists "drops own" on drops;
create policy "drops own" on drops for select using (user_id = auth.uid());
alter table profiles add column if not exists last_seen_at timestamptz;
