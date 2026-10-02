-- Performance history: one row per scan, so trends and "this week vs last" can be computed.
create table if not exists performance_snapshots (
  id bigint generated always as identity primary key,
  creator_id uuid not null references creators(id) on delete cascade,
  captured_at timestamptz not null default now(),
  items int not null default 0,
  median numeric not null default 0,
  metric_label text,
  top jsonb not null default '[]'::jsonb,
  hooks jsonb not null default '[]'::jsonb,
  formats jsonb not null default '[]'::jsonb
);
create index if not exists perf_snap_creator on performance_snapshots (creator_id, captured_at desc);
alter table performance_snapshots enable row level security;
