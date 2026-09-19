-- Brand print: search the disclosures for a brand (#XPartner, "sponsored by X")
-- to find the creators they book, and queue their prints.
create table if not exists brand_scans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  status text not null default 'queued',        -- queued | running | done | failed
  found jsonb not null default '[]'::jsonb,     -- [{platform, handle, external_id, title, video_title, video_id, queued}]
  ig_pulse jsonb,                               -- {tag, posts, sample}
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists brand_scans_brand on brand_scans (brand_id, created_at desc);
alter table brand_scans enable row level security;
drop policy if exists "brand_scans read" on brand_scans;
create policy "brand_scans read" on brand_scans for select using (auth.uid() is not null);
alter table brands add column if not exists last_brand_scan_at timestamptz;
alter table brands add column if not exists ig_pulse jsonb;
