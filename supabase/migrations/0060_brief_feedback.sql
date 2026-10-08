-- Thumbs on the lane brief. A thumbs-down hides that suggestion for this creator and the list refills with the
-- next candidate; a thumbs-up also files it under their experiments. Managers see the votes on the creator page.
create table if not exists brief_feedback (
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  kind text not null,                 -- opener | gap
  key text not null,                  -- opener key or topic key
  vote smallint not null,             -- 1 up, -1 down
  label text,
  created_at timestamptz not null default now(),
  primary key (roster_creator_id, kind, key)
);
alter table brief_feedback enable row level security;
