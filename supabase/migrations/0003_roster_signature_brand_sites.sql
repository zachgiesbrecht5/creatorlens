-- 1) Full email signature block (the old `signature` column stays as the sign-off phrase)
alter table profiles add column if not exists email_signature text;

-- 2) Roster: the creators each user actually represents. Pitches are written FOR these.
create table if not exists roster_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  org_id uuid,
  name text not null,
  handle text,                 -- primary handle, e.g. @andyyyen
  platform text,               -- youtube | instagram | tiktok | multi
  followers int,
  niche text,                  -- "lifestyle / design", "coffee", ...
  pitch_angle text,            -- one or two lines the drafter leads with
  media_kit_url text,
  created_at timestamptz not null default now()
);
create index if not exists roster_creators_user_idx on roster_creators(user_id);
alter table roster_creators enable row level security;
create policy "own roster" on roster_creators for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Brand websites + junk flag. Worker resolves and verifies these.
alter table brands add column if not exists website text;
alter table brands add column if not exists site_status text not null default 'unknown'; -- unknown | ok | dead
alter table brands add column if not exists site_checked_at timestamptz;
alter table brands add column if not exists is_junk boolean not null default false;

-- Obvious junk names from URL fragments; hide them right away.
update brands set is_junk = true
where key ~ '^(https?|www|http)$' or key ~ 'https?$' or key ~ '^www' or name ~* '^(my friends|the team)$';

-- brand_wall now carries website / status / junk so the UI can link and filter.
drop view if exists brand_wall;
create or replace view brand_wall as
select
  p.creator_id,
  b.id as brand_id,
  b.name as brand,
  b.is_mass_sponsor,
  b.website,
  b.site_status,
  b.is_junk,
  count(*) as deals,
  array_agg(distinct p.platform::text) as platforms,
  max(p.confidence_score) as best_score,
  (array_agg(p.confidence_label order by p.confidence_score desc))[1] as best_label,
  min(p.published_at) as first_seen,
  max(p.published_at) as last_seen,
  (array_agg(p.evidence order by p.confidence_score desc))[1] as evidence,
  (array_agg(p.content_url order by p.confidence_score desc))[1] as content_url,
  (array_agg(p.content_title order by p.confidence_score desc))[1] as content_title,
  (count(*) filter (where p.confidence_label in ('High','Medium')) >= 2
    and max(p.published_at) - min(p.published_at) >= interval '30 days') as repeat_partner,
  (select count(distinct creator_id) from partnerships p2 where p2.brand_id = b.id) as creators_booked
from partnerships p join brands b on b.id = p.brand_id
where p.status <> 'rejected'
group by p.creator_id, b.id, b.name, b.is_mass_sponsor, b.website, b.site_status, b.is_junk;
