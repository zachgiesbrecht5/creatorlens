-- Brand quality: classify from the brand's own site (not the creator's
-- caption), keep a confidence, allow manual locks that the classifier never
-- overwrites, and flag affiliate/house brands where one creator is nearly all
-- of the deals (Namimatcha x one creator = 107 "deals").

alter table brands add column if not exists site_title text;
alter table brands add column if not exists site_description text;
alter table brands add column if not exists category_confidence numeric;      -- 0..1 from the model
alter table brands add column if not exists category_locked boolean not null default false;  -- manual override wins forever
alter table brands add column if not exists name_locked boolean not null default false;
alter table brands add column if not exists website_locked boolean not null default false;
alter table brands add column if not exists dominant_creator_share numeric;   -- deals from the top creator / all deals
alter table brands add column if not exists is_affiliate boolean not null default false;

-- Re-run the classifier on everything that was categorised from captions.
-- Locked rows keep their category. Sites get re-fetched so title/description
-- are captured for the new prompt.
update brands set classified_at = null where not category_locked;
update brands set site_checked_at = null where site_status = 'ok' and site_title is null and not website_locked;

-- Manual corrections table: one row per domain (or brand key when no domain).
-- The worker applies these on every site check / classify pass.
create table if not exists brand_overrides (
  id uuid primary key default gen_random_uuid(),
  match_key text not null unique,      -- domain ("stanley1913.com") or brand key ("stanley")
  display_name text,
  category text,
  website text,
  is_junk boolean,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
alter table brand_overrides enable row level security;
drop policy if exists "overrides read" on brand_overrides;
create policy "overrides read" on brand_overrides for select using (auth.role() = 'authenticated');

-- Known fixes from the first review pass.
insert into brand_overrides (match_key, display_name, category, website, note) values
  ('stanley', 'Stanley 1913', 'Home', 'https://www.stanley1913.com', 'drinkware, not Stanley tools'),
  ('stanley1913.com', 'Stanley 1913', 'Home', 'https://www.stanley1913.com', 'drinkware'),
  ('stanleytools.com', 'Stanley Tools', 'DIY', 'https://www.stanleytools.com', null),
  ('airbnb.com', 'Airbnb', 'Travel', 'https://www.airbnb.com', 'caption was about food'),
  ('fstbls', 'Feastables', 'Food', 'https://feastables.com', 'MrBeast house brand'),
  ('feastables.com', 'Feastables', 'Food', 'https://feastables.com', 'MrBeast house brand'),
  ('gymshark.com', 'Gymshark', 'Fitness', 'https://www.gymshark.com', 'checkout subdomain was resolved'),
  ('shopify.com', 'Shopify', 'Business', 'https://www.shopify.com', null)
on conflict (match_key) do nothing;

-- brand_wall: expose the new flags.
drop view if exists brand_wall;
create or replace view brand_wall as
select
  p.creator_id,
  b.id as brand_id,
  b.name as brand,
  b.category,
  b.is_mass_sponsor,
  b.is_self_brand,
  b.is_affiliate,
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
group by p.creator_id, b.id, b.name, b.category, b.is_mass_sponsor, b.is_self_brand, b.is_affiliate, b.website, b.site_status, b.is_junk;
