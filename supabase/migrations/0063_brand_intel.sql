-- Brand intelligence: spend pace, seasonality, rebookers, and who is behind a brand's creator work.
--
-- A "booking" is a run of paid posts (High/Medium confidence) by one creator for one brand; a new booking starts
-- when 21+ days have passed since that creator's previous post for the brand. Counting bookings instead of posts
-- keeps a 4-post campaign from looking like four deals, and makes "rebooked" mean a second, separate booking.

create materialized view if not exists brand_bookings_mv as
with p as (
  select p.brand_id, p.creator_id, p.published_at, p.content_url, p.platform
  from partnerships p
  where p.status <> 'rejected' and p.confidence_label in ('High', 'Medium')
    and p.published_at is not null and p.published_at <= now() + interval '1 day'
), ep as (
  select p.*, lag(p.published_at) over (partition by p.brand_id, p.creator_id order by p.published_at) as prev_at
  from p
)
select brand_id, creator_id, published_at as booked_at, content_url, platform,
       row_number() over (partition by brand_id, creator_id order by published_at) as booking_no
from ep
where prev_at is null or published_at - prev_at > interval '21 days';

create unique index if not exists brand_bookings_mv_pk on brand_bookings_mv (brand_id, creator_id, booked_at);
create index if not exists brand_bookings_mv_creator on brand_bookings_mv (creator_id);
create index if not exists brand_bookings_mv_recent on brand_bookings_mv (booked_at desc) where booking_no >= 2;

create materialized view brand_stats_mv as
with b as (
  select bk.*, c.followers from brand_bookings_mv bk join creators c on c.id = bk.creator_id
), pc as (
  select brand_id, creator_id, count(*) as n from b group by 1, 2
), rebook as (
  select brand_id, count(*) filter (where n >= 2)::int as rebook_creators from pc group by 1
), mc as (
  select brand_id, extract(month from booked_at)::int as m, count(*)::int as cnt from b group by 1, 2
), moy as (
  select brand_id, array_agg(coalesce(mc.cnt, 0) order by g.m) as by_month
  from (select distinct brand_id from b) bb cross join generate_series(1, 12) g(m)
  left join mc using (brand_id, m)
  group by brand_id
)
select b.brand_id,
  count(*)::int as bookings,
  count(*) filter (where booked_at > now() - interval '90 days')::int as bookings_90d,
  count(*) filter (where booked_at <= now() - interval '90 days' and booked_at > now() - interval '180 days')::int as bookings_prev_90d,
  count(*) filter (where booked_at > now() - interval '365 days')::int as bookings_12m,
  count(*) filter (where booked_at <= now() - interval '365 days' and booked_at > now() - interval '730 days')::int as bookings_prev_12m,
  count(*) filter (where booked_at > now() - interval '365 days' and booked_at <= now() - interval '275 days')::int as bookings_next90_last_year,
  count(distinct creator_id)::int as creators,
  count(distinct creator_id) filter (where booked_at > now() - interval '90 days')::int as creators_90d,
  coalesce(max(r.rebook_creators), 0)::int as rebook_creators,
  percentile_disc(0.5) within group (order by followers) as median_followers,
  min(booked_at) as first_at,
  max(booked_at) as last_at,
  max(moy.by_month) as by_month
from b
left join rebook r using (brand_id)
left join moy using (brand_id)
group by b.brand_id;

create unique index if not exists brand_stats_mv_pk on brand_stats_mv (brand_id);

-- Parent companies: who owns the brand, so a pitch can go to the group's creator team or agency of record.
create table if not exists brand_parents (
  match_key text primary key,      -- brands.key (lowercase, alphanumeric)
  parent text not null,
  note text
);
alter table brand_parents enable row level security;

insert into brand_parents (match_key, parent) values
  -- Procter & Gamble
  ('swiffer','Procter & Gamble'),('febreze','Procter & Gamble'),('crest','Procter & Gamble'),('oralb','Procter & Gamble'),
  ('pampers','Procter & Gamble'),('gillette','Procter & Gamble'),('oldspice','Procter & Gamble'),('tide','Procter & Gamble'),
  ('dawn','Procter & Gamble'),('olay','Procter & Gamble'),('pantene','Procter & Gamble'),('headshoulders','Procter & Gamble'),
  ('braun','Procter & Gamble'),('bounty','Procter & Gamble'),('charmin','Procter & Gamble'),('cascade','Procter & Gamble'),
  ('mielle','Procter & Gamble'),
  -- L'Oréal
  ('lorealparis','L''Oréal'),('loreal','L''Oréal'),('maybelline','L''Oréal'),('garnier','L''Oréal'),('kerastase','L''Oréal'),
  ('cerave','L''Oréal'),('larocheposay','L''Oréal'),('pureology','L''Oréal'),('biolage','L''Oréal'),('itcosmetics','L''Oréal'),
  ('itcosmeticsca','L''Oréal'),('armanibeauty','L''Oréal'),('lancome','L''Oréal'),('ysl','L''Oréal'),('yslbeauty','L''Oréal'),
  ('nyxcosmetics','L''Oréal'),('nyx','L''Oréal'),('urbandecay','L''Oréal'),('kiehls','L''Oréal'),('redken','L''Oréal'),
  ('essie','L''Oréal'),('vichy','L''Oréal'),('skinceuticals','L''Oréal'),
  -- Unilever
  ('dove','Unilever'),('vaseline','Unilever'),('axe','Unilever'),('degree','Unilever'),('liquidiv','Unilever'),
  ('dermalogica','Unilever'),('olly','Unilever'),('nexxus','Unilever'),('tresemme','Unilever'),('hellmanns','Unilever'),
  ('bensjerry','Unilever'),('magnum','Unilever'),('knorr','Unilever'),('suave','Unilever'),
  -- PepsiCo
  ('funyuns','PepsiCo'),('popcorners','PepsiCo'),('quaker','PepsiCo'),('mountaindew','PepsiCo'),('doritos','PepsiCo'),
  ('cheetos','PepsiCo'),('gatorade','PepsiCo'),('lays','PepsiCo'),('pepsi','PepsiCo'),('bubly','PepsiCo'),
  ('siete','PepsiCo'),
  -- Coca-Cola
  ('cocacola','The Coca-Cola Company'),('sprite','The Coca-Cola Company'),('smartwater','The Coca-Cola Company'),
  ('bodyarmor','The Coca-Cola Company'),('fairlife','The Coca-Cola Company'),('topochico','The Coca-Cola Company'),
  -- Estée Lauder
  ('clinique','The Estée Lauder Companies'),('esteelauder','The Estée Lauder Companies'),('maccosmetics','The Estée Lauder Companies'),
  ('toofaced','The Estée Lauder Companies'),('bobbibrown','The Estée Lauder Companies'),
  ('theordinary','The Estée Lauder Companies'),('aveda','The Estée Lauder Companies'),('lamer','The Estée Lauder Companies'),
  -- Kenvue
  ('listerine','Kenvue'),('neutrogena','Kenvue'),('aveeno','Kenvue'),('tylenol','Kenvue'),('rogaine','Kenvue'),('lactaid','Kenvue'),
  ('bandaid','Kenvue'),('zyrtec','Kenvue'),('cleanandclear','Kenvue'),
  -- Amorepacific
  ('laneige','Amorepacific'),('sulwhasoo','Amorepacific'),('innisfree','Amorepacific'),('hanyul','Amorepacific'),('cosrx','Amorepacific'),
  -- Mars
  ('mms','Mars'),('snickers','Mars'),('skittles','Mars'),('twix','Mars'),('pedigree','Mars'),('greenies','Mars'),('iams','Mars'),
  ('kindsnacks','Mars'),
  -- Nestlé
  ('fancyfeast','Nestlé Purina'),('purina','Nestlé Purina'),('friskies','Nestlé Purina'),('nespresso','Nestlé'),('starbucksathome','Nestlé'),
  ('coffeemate','Nestlé'),('vitalproteins','Nestlé'),('kitkat','Nestlé'),
  -- Clorox, Colgate, Kimberly-Clark, Church & Dwight, Shiseido, LVMH
  ('clorox','The Clorox Company'),('burtsbees','The Clorox Company'),('brita','The Clorox Company'),('hiddenvalley','The Clorox Company'),
  ('colgate','Colgate-Palmolive'),('hillspet','Colgate-Palmolive'),('palmolive','Colgate-Palmolive'),
  ('huggies','Kimberly-Clark'),('kleenex','Kimberly-Clark'),('cottonelle','Kimberly-Clark'),
  ('herocosmetics','Church & Dwight'),('waterpik','Church & Dwight'),
  ('drunkelephant','Shiseido'),('shiseido','Shiseido'),('nars','Shiseido'),
  ('sephora','LVMH'),('fentybeauty','LVMH (Kendo)'),
  -- Gap Inc., American Eagle, Nordstrom, VF, Wolverine
  ('oldnavy','Gap Inc.'),('bananarepublic','Gap Inc.'),('athleta','Gap Inc.'),('gap','Gap Inc.'),
  ('aerie','American Eagle Outfitters'),('americaneagle','American Eagle Outfitters'),('offlineaerie','American Eagle Outfitters'),
  ('nordstromrack','Nordstrom'),
  ('thenorthface','VF Corporation'),('vans','VF Corporation'),('timberland','VF Corporation'),
  ('ugg','Deckers Brands'),('hoka','Deckers Brands'),
  -- Tech groups
  ('github','Microsoft'),('copilot','Microsoft'),('xbox','Microsoft'),('linkedin','Microsoft'),
  ('waymo','Alphabet'),('youtube','Alphabet'),('fitbit','Alphabet'),
  ('audible','Amazon'),('amazonalexa','Amazon'),('wholefoods','Amazon'),('kindle','Amazon'),('twitch','Amazon'),
  ('turbotax','Intuit'),('creditkarma','Intuit'),('quickbooks','Intuit'),('mailchimp','Intuit'),
  ('eufy','Anker Innovations'),('eufyofficial','Anker Innovations'),('soundcore','Anker Innovations'),
  ('asusrog','ASUS'),('rog','ASUS'),('alienware','Dell Technologies'),('hyperx','HP Inc.'),('elgato','Corsair Gaming'),
  ('raybanmeta','EssilorLuxottica + Meta'),('oakley','EssilorLuxottica'),('rayban','EssilorLuxottica'),
  ('instagram','Meta'),('whatsapp','Meta'),('oculus','Meta'),
  ('snapdragon','Qualcomm'),('jbl','Samsung (Harman)'),('harmankardon','Samsung (Harman)'),
  ('oppo','BBK Electronics'),('oneplus','BBK Electronics'),
  -- Finance, food, other
  ('cashapp','Block'),('afterpay','Block'),
  ('hellofresh','HelloFresh SE'),('greenchef','HelloFresh SE'),
  ('disney','The Walt Disney Company'),('hulu','The Walt Disney Company'),('espn','The Walt Disney Company')
on conflict (match_key) do nothing;

-- Rebookers for a brand: creators with 2+ separate bookings, with their cadence and when the next one is due.
create or replace function brand_rebookers(p_brand uuid)
returns table (creator_id uuid, bookings int, first_at timestamptz, last_at timestamptz, avg_gap_days int, next_due timestamptz)
language sql stable security definer set search_path = public as $$
  select creator_id, count(*)::int, min(booked_at), max(booked_at),
    case when count(*) >= 2 then (extract(epoch from (max(booked_at) - min(booked_at))) / 86400 / (count(*) - 1))::int end,
    case when count(*) >= 2 then max(booked_at) + (max(booked_at) - min(booked_at)) / (count(*) - 1) end
  from brand_bookings_mv where brand_id = p_brand
  group by creator_id having count(*) >= 2
  order by max(booked_at) desc
$$;

-- Rebooking now: a creator's second-or-later booking with a brand, within the last p_days.
create or replace function rebooking_now(p_days int default 60, p_limit int default 50, p_category text default null)
returns table (creator_id uuid, brand_id uuid, booked_at timestamptz, booking_no int, content_url text, platform text)
language sql stable security definer set search_path = public as $$
  select bk.creator_id, bk.brand_id, bk.booked_at, bk.booking_no::int, bk.content_url, bk.platform::text
  from brand_bookings_mv bk join brands b on b.id = bk.brand_id
  where bk.booking_no >= 2 and bk.booked_at > now() - make_interval(days => p_days)
    and not b.is_junk and not b.is_self_brand and not coalesce(b.is_affiliate, false) and b.name not like '%(?)'
    and (p_category is null or b.category = p_category)
  order by bk.booked_at desc
  limit p_limit
$$;

-- Who is behind a brand's creator work, from what the posts themselves say:
--  * retail programs: the brand's sponsored posts also carry a retailer's creator-program tag (#TargetPartner, #WalmartPartner...)
--  * co-booked: other brands tagged as partners in the same Instagram post (retailer + brand, or parent + brand). YouTube is
--    left out because a video with three sponsor reads is three separate deals, not one joint campaign.
create or replace function brand_behind(p_brand uuid)
returns table (kind text, name text, other_brand_id uuid, posts int, sample_url text)
language sql stable security definer set search_path = public as $$
  with me as (select key from brands where id = p_brand),
  mine as (
    select p.creator_id, p.content_id, p.content_url, p.platform, lower(coalesce(p.content_title, '') || ' ' || coalesce(p.evidence, '')) as txt
    from partnerships p where p.brand_id = p_brand and p.status <> 'rejected' and p.confidence_label in ('High', 'Medium')
  ), programs(tag, retailer) as (values
    ('#targetpartner', 'Target creator program (Club Target)'), ('#clubtarget', 'Target creator program (Club Target)'),
    ('#walmartpartner', 'Walmart Creator program'), ('#walmartcreator', 'Walmart Creator program'),
    ('#amazoninfluencer', 'Amazon Influencer Program'), ('#founditonamazon', 'Amazon Influencer Program'),
    ('#ltkpartner', 'LTK (rewardStyle)'), ('#ltk', 'LTK (rewardStyle)'), ('#shopltk', 'LTK (rewardStyle)'),
    ('#ultabeautypartner', 'Ulta Beauty creator program'), ('#ultapartner', 'Ulta Beauty creator program'),
    ('#sephorasquad', 'Sephora Squad'), ('#sephorapartner', 'Sephora creator program'),
    ('#costcopartner', 'Costco'), ('#krogerpartner', 'Kroger'), ('#bestbuypartner', 'Best Buy'),
    ('#cvspartner', 'CVS'), ('#walgreenspartner', 'Walgreens'), ('#tiktokshop', 'TikTok Shop')
  ), retail as (
    select 'retail program'::text as kind, pr.retailer as name, null::uuid as other_brand_id, count(distinct m.content_id)::int as posts, min(m.content_url) as sample_url
    from mine m join programs pr on m.txt like '%' || pr.tag || '%'
    where position((select key from me) in replace(pr.tag, '#', '')) = 0   -- a retailer's own tag isn't someone behind it
    group by pr.retailer
  ), co as (
    select 'co-booked'::text, b.name, b.id, count(distinct m.content_id)::int, min(m.content_url)
    from mine m join partnerships o on o.creator_id = m.creator_id and o.content_id = m.content_id and o.brand_id <> p_brand and o.status <> 'rejected'
    join brands b on b.id = o.brand_id
    where m.platform = 'instagram' and not b.is_junk and not b.is_self_brand and b.name not like '%(?)'
    group by b.id, b.name having count(distinct m.content_id) >= 2
  )
  select * from retail
  union all
  select * from (select * from co order by 4 desc limit 8) c
  order by 1 desc, 4 desc
$$;

-- Refresh everything the brand pages read, in dependency order.
-- refresh_brand_wall stays wall-only: the worker calls it after every scan through the API, which has an 8s
-- statement timeout, and refreshing three views in one call blew through it under load (fixed 2026-11-03).
-- The booking views refresh on their own, one call each, on a slower cadence.
create or replace function public.refresh_brand_wall()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently brand_wall_mv;
end $$;
create or replace function public.refresh_brand_bookings()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently brand_bookings_mv;
end $$;
create or replace function public.refresh_brand_stats()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently brand_stats_mv;
end $$;
revoke execute on function public.refresh_brand_bookings() from public, anon, authenticated;
revoke execute on function public.refresh_brand_stats() from public, anon, authenticated;
grant execute on function public.refresh_brand_bookings(), public.refresh_brand_stats() to service_role;

revoke all on function brand_rebookers(uuid) from public, anon, authenticated;
revoke all on function rebooking_now(int, int, text) from public, anon, authenticated;
revoke all on function brand_behind(uuid) from public, anon, authenticated;
revoke all on brand_bookings_mv, brand_stats_mv from anon, authenticated;
grant execute on function brand_rebookers(uuid) to service_role;
grant execute on function rebooking_now(int, int, text) to service_role;
grant execute on function brand_behind(uuid) to service_role;

-- Brand names mangled by caption parsing ("Eufy -----------", "\ Anthropic"): strip the punctuation, keep the brand.
update brands set name = btrim(regexp_replace(regexp_replace(name, '\s+-{3,}.*$', ''), '^[\\/|\s]+', ''))
where not coalesce(name_locked, false) and (name ~ '\s-{3,}' or name ~ '^[\\/|]');

-- One row per brand for the leaderboard: the brand's own columns plus booking pace from brand_stats_mv.
-- Guessed names ("Come (?)") are kept out: they're caption fragments until someone confirms them on a print.
create or replace view brand_leaderboard_v as
select b.id, b.name, b.key, b.category, b.verticals, b.website, b.domain, b.site_status, b.classified_at,
       b.is_mass_sponsor, b.is_affiliate, b.platform_counts, b.deal_count, b.creator_count, b.last_seen,
       coalesce(s.bookings, 0) as bookings, coalesce(s.bookings_90d, 0) as bookings_90d, coalesce(s.bookings_prev_90d, 0) as bookings_prev_90d,
       coalesce(s.bookings_12m, 0) as bookings_12m, coalesce(s.creators, 0) as paid_creators, coalesce(s.creators_90d, 0) as creators_90d,
       coalesce(s.rebook_creators, 0) as rebook_creators,
       case when coalesce(s.creators, 0) >= 3 then round(s.rebook_creators::numeric / s.creators, 3) end as rebook_rate,
       s.median_followers, s.last_at as last_booked_at, s.by_month,
       coalesce(s.bookings_90d, 0) - coalesce(s.bookings_prev_90d, 0) as pace_delta,
       -- creator verticals it has booked at least twice (2+ distinct creators), for the "Books" filter
       array(select k from jsonb_each_text(coalesce(b.verticals, '{}'::jsonb)) as v(k, n) where k <> 'Other' and n ~ '^\d+$' and n::int >= 2) as books
from brands b
left join brand_stats_mv s on s.brand_id = b.id
where not b.is_junk and not b.is_self_brand and b.site_status is distinct from 'dead' and b.name not like '%(?)';

revoke all on brand_leaderboard_v from anon, authenticated;
grant select on brand_leaderboard_v to service_role;

-- Category chip counts without pulling every row through the API (which caps at 1000).
create or replace function brand_category_counts(p_ids uuid[] default null)
returns table (category text, n int)
language sql stable security definer set search_path = public as $$
  select category, count(*)::int from brand_leaderboard_v
  where category is not null and (p_ids is null or id = any(p_ids))
  group by category order by 2 desc
$$;
revoke all on function brand_category_counts(uuid[]) from public, anon, authenticated;
grant execute on function brand_category_counts(uuid[]) to service_role;
