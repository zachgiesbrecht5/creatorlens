-- Hiring signals: brands hiring influencer / creator / partnerships marketers.
create table if not exists hiring_signals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  company text not null,
  domain text,
  title text not null,
  seniority text,                 -- manager | director | head | vp | coordinator | other
  location text,
  url text not null unique,
  posted_at date,
  found_at timestamptz not null default now(),
  closed_at timestamptz,          -- set when the posting disappears (hire likely made)
  summary text                    -- one line: what the role tells you
);
create index if not exists hiring_signals_brand on hiring_signals (brand_id, found_at desc);
alter table hiring_signals enable row level security;
drop policy if exists "hiring read" on hiring_signals;
create policy "hiring read" on hiring_signals for select using (auth.uid() is not null);

-- Outreach pipeline: a tappable stage on every logged pitch, so monthly creator
-- updates and the pipeline view can be accurate.
alter table outreach_log add column if not exists stage text not null default 'pitched';   -- pitched | replied | negotiating | closed | dead
alter table outreach_log add column if not exists deal_value numeric;
alter table outreach_log add column if not exists note text;
alter table outreach_log add column if not exists updated_at timestamptz not null default now();

-- Monthly creator updates
alter table roster_creators add column if not exists creator_email text;
alter table roster_creators add column if not exists monthly_update boolean not null default false;
alter table roster_creators add column if not exists update_show_money boolean not null default true;
alter table roster_creators add column if not exists update_show_early boolean not null default false;
create table if not exists creator_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  month date not null,            -- first of the month covered
  subject text,
  body text,
  status text not null default 'draft',   -- draft | approved | sent | skipped
  gmail_draft_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (roster_creator_id, month)
);
alter table creator_updates enable row level security;
drop policy if exists "updates own" on creator_updates;
create policy "updates own" on creator_updates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
