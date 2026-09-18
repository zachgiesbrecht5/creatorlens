-- "Neighborhood": for each roster creator, an agent finds 3 adjacent creators
-- (same niche, similar size) and prints them for free. The roster row learns
-- its avatar/bio from the platform lookup so the onboarding can show faces.

alter table roster_creators add column if not exists avatar_url text;
alter table roster_creators add column if not exists bio text;
alter table roster_creators add column if not exists neighborhood_at timestamptz;
alter table profiles add column if not exists onboarded_at timestamptz;

create table if not exists neighborhoods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  roster_creator_id uuid not null references roster_creators(id) on delete cascade,
  status text not null default 'queued',        -- queued | running | done | failed
  candidates jsonb not null default '[]'::jsonb, -- [{platform, handle, display_name, avatar_url, followers, reason, job_id, cached}]
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists neighborhoods_user on neighborhoods (user_id, created_at desc);
alter table neighborhoods enable row level security;
drop policy if exists "neighborhoods own" on neighborhoods;
create policy "neighborhoods own" on neighborhoods for select using (user_id = auth.uid() or is_admin_user());

-- free prints queued by the neighborhood agent carry a source so they never cost credits
alter table scan_jobs add column if not exists source text;
