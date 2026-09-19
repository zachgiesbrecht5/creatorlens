-- Swipe feedback: which suggested neighbors matched the manager's creator and
-- which didn't. Feeds the next round's prompt and the index picks.
create table if not exists lane_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  roster_creator_id uuid references roster_creators(id) on delete cascade,
  seed_creator_id uuid references creators(id) on delete cascade,
  platform text not null,
  handle text not null,
  verdict text not null,          -- like | pass
  created_at timestamptz not null default now()
);
create index if not exists lane_feedback_user on lane_feedback (user_id, roster_creator_id, created_at desc);
alter table lane_feedback enable row level security;
drop policy if exists "lane_feedback own" on lane_feedback;
create policy "lane_feedback own" on lane_feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());
