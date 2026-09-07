-- Brand categories, creator verticals, self-brand detection.
--
-- brands.category      : what the brand sells (one of the engine CATEGORIES)
-- brands.verticals     : which creator verticals it books, {"Tech": 3, "Lifestyle": 1}
-- brands.is_self_brand : the brand belongs to the creator who "promoted" it
--                        (own merch, own company, own agency). Hidden from the
--                        leaderboard and the brand wall by default.
-- creators.category    : the creator's vertical, classified from bio + content

alter table brands add column if not exists verticals jsonb not null default '{}'::jsonb;
alter table brands add column if not exists is_self_brand boolean not null default false;
alter table brands add column if not exists classified_at timestamptz;
alter table creators add column if not exists classified_at timestamptz;

create index if not exists brands_category_idx on brands (category);
create index if not exists creators_category_idx on creators (category);

drop view if exists brand_wall;
create or replace view brand_wall as
select
  p.creator_id,
  b.id as brand_id,
  b.name as brand,
  b.category,
  b.is_mass_sponsor,
  b.is_self_brand,
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
group by p.creator_id, b.id, b.name, b.category, b.is_mass_sponsor, b.is_self_brand, b.website, b.site_status, b.is_junk;

