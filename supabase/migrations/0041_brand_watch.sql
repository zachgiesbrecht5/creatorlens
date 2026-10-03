-- Brand watch: brands' own Instagram posts, launch signals, pitch windows.
alter table brands add column if not exists ig_handle text;
alter table brands add column if not exists brand_watched_at timestamptz;
create table if not exists launch_signals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null,                 -- launch | restock | campaign | giveaway | collab
  product text,
  summary text,
  posted_at timestamptz not null,
  url text not null unique,
  caption text,
  spoken text,
  on_video text,
  window_start date,                  -- pitch window (second wave)
  window_end date,
  repush_month date,                  -- seasonal re-push (~90 days)
  found_at timestamptz not null default now()
);
create index if not exists launch_signals_brand on launch_signals (brand_id, posted_at desc);
create index if not exists launch_signals_time on launch_signals (posted_at desc);
alter table launch_signals enable row level security;
drop policy if exists "launch read" on launch_signals;
create policy "launch read" on launch_signals for select using (auth.uid() is not null);
