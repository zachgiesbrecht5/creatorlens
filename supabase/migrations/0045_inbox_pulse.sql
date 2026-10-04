-- Phase 2: inbox watch with an approval queue. Phase 3: weekly pulse drafts.
alter table profiles add column if not exists inbox_watch boolean not null default false;
alter table profiles add column if not exists inbox_watched_at timestamptz;
alter table profiles add column if not exists inbox_note text;
create table if not exists inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,     -- whose inbox
  thread_id text not null,
  message_id text,
  kind text not null,                -- project | project_update | payout | event
  roster_creator_id uuid references roster_creators(id) on delete set null,
  creator_guess text,
  brand text,
  payload jsonb not null default '{}'::jsonb,   -- extracted fields (deliverables, fee, due_at, go_live_at, status, title, starts_at, location, rsvp_url, summary)
  subject text,
  from_email text,
  snippet text,
  gmail_url text,
  received_at timestamptz,
  status text not null default 'pending',       -- pending | approved | dismissed
  applied_project_id uuid references projects(id) on delete set null,
  applied_event_id uuid references creator_events(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, thread_id, kind)
);
create index if not exists inbox_items_pending on inbox_items (user_id, status, received_at desc);
alter table inbox_items enable row level security;
-- weekly pulses reuse creator_updates (the review/send flow already exists); month = week start
alter table creator_updates add column if not exists kind text not null default 'monthly';
