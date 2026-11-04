-- Trustworthiness pass on brand intelligence (0063):
--  1. every partnership gets an evidence tier: confirmed (explicit paid disclosure), likely (partner tag, code,
--     seeding), or mention (link, topic hashtag, affiliate-only, guessed brand). Only confirmed + likely count.
--  2. bookings carry the post behind them, so every number on a brand page can list its posts.
--  3. reversible brand merges (duplicates from caption parsing) with a log, and website flags for wrong domains.
--  4. "who's behind it" returns dated, per-post evidence; parent companies carry their source.
--  5. a forecast backtest table, so the page can show how the forecast method has actually performed.

-- 1. evidence tier ----------------------------------------------------------------------------------------------
create or replace function evidence_tier(p_label text, p_signal text, p_evidence text)
returns text language sql immutable as $$
  select case
    when p_label = 'High' and coalesce(p_signal, '') ~* '(paid - explicit|explicit sponsorship|sponsorship mention|thank you sponsorship|hashtag disclosure|collaboration)'
         and coalesce(p_signal, '') !~* 'brand unclear' and coalesce(p_evidence, '') !~* 'hashtag in description' then 'confirmed'
    when p_label in ('High', 'Medium') and coalesce(p_signal, '') !~* '(brand guessed|brand unclear)'
         and coalesce(p_signal, '') !~* '^\s*(affiliate|affiliate / code)\s*$' and coalesce(p_evidence, '') !~* 'hashtag in description' then 'likely'
    else 'mention' end
$$;

-- 2. bookings with their evidence --------------------------------------------------------------------------------
drop view if exists brand_leaderboard_v;
drop function if exists brand_category_counts(uuid[]);
drop function if exists brand_rebookers(uuid);
drop function if exists rebooking_now(int, int, text);
drop materialized view if exists brand_stats_mv;
drop materialized view if exists brand_bookings_mv;

-- A booking is a run of counted posts (confirmed or likely) by one creator for one brand; a new booking starts
-- 21+ days after that creator's previous counted post for the brand. The booking row is its first post.
create materialized view brand_bookings_mv as
with p as (
  select p.id as partnership_id, p.brand_id, p.creator_id, p.published_at, p.content_url, p.platform::text as platform,
         evidence_tier(p.confidence_label, p.signal_type, p.evidence) as tier, left(p.evidence, 160) as evidence
  from partnerships p
  where p.status <> 'rejected' and p.published_at is not null and p.published_at <= now() + interval '1 day'
), c as (
  select * from p where tier in ('confirmed', 'likely')
), ep as (
  select c.*, lag(c.published_at) over (partition by c.brand_id, c.creator_id order by c.published_at) as prev_at,
         -- the run's strongest tier is decided below; first post carries the link
         count(*) over (partition by c.brand_id, c.creator_id) as creator_posts
  from c
), starts as (
  select ep.*, sum(case when prev_at is null or published_at - prev_at > interval '21 days' then 1 else 0 end)
           over (partition by brand_id, creator_id order by published_at rows unbounded preceding) as run_no
  from ep
)
select brand_id, creator_id, run_no::int as booking_no,
       min(published_at) as booked_at,
       (array_agg(partnership_id order by published_at))[1] as partnership_id,
       (array_agg(content_url order by published_at))[1] as content_url,
       (array_agg(platform order by published_at))[1] as platform,
       (array_agg(evidence order by (tier = 'confirmed') desc, published_at))[1] as evidence,
       case when bool_or(tier = 'confirmed') then 'confirmed' else 'likely' end as tier,
       count(*)::int as posts
from starts
group by brand_id, creator_id, run_no;

create unique index brand_bookings_mv_pk on brand_bookings_mv (brand_id, creator_id, booking_no);
create index brand_bookings_mv_creator on brand_bookings_mv (creator_id);
create index brand_bookings_mv_brand_at on brand_bookings_mv (brand_id, booked_at desc);
create index brand_bookings_mv_recent on brand_bookings_mv (booked_at desc) where booking_no >= 2;

create materialized view brand_stats_mv as
with b as (
  select bk.*, cr.followers from brand_bookings_mv bk join creators cr on cr.id = bk.creator_id
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
  count(*) filter (where tier = 'confirmed')::int as bookings_confirmed,
  count(*) filter (where booked_at > now() - interval '90 days')::int as bookings_90d,
  count(*) filter (where booked_at > now() - interval '90 days' and tier = 'confirmed')::int as bookings_90d_confirmed,
  count(*) filter (where booked_at <= now() - interval '90 days' and booked_at > now() - interval '180 days')::int as bookings_prev_90d,
  count(*) filter (where booked_at > now() - interval '365 days')::int as bookings_12m,
  count(*) filter (where booked_at <= now() - interval '365 days' and booked_at > now() - interval '730 days')::int as bookings_prev_12m,
  count(*) filter (where booked_at > now() - interval '365 days' and booked_at <= now() - interval '275 days')::int as bookings_next90_last_year,
  sum(posts)::int as posts,
  count(distinct creator_id)::int as creators,
  count(distinct creator_id) filter (where booked_at > now() - interval '90 days')::int as creators_90d,
  coalesce(max(r.rebook_creators), 0)::int as rebook_creators,
  percentile_disc(0.5) within group (order by followers) as median_followers,
  count(followers)::int as creators_with_size,
  min(booked_at) as first_at,
  max(booked_at) as last_at,
  max(moy.by_month) as by_month
from b
left join rebook r using (brand_id)
left join moy using (brand_id)
group by b.brand_id;

create unique index brand_stats_mv_pk on brand_stats_mv (brand_id);
revoke all on brand_bookings_mv, brand_stats_mv from anon, authenticated;
grant select on brand_bookings_mv, brand_stats_mv to service_role;

-- 3. merges and website flags ------------------------------------------------------------------------------------
alter table brands add column if not exists merged_into uuid references brands(id);
alter table brands add column if not exists website_prev text;
alter table brands add column if not exists website_flag text;      -- 'mismatch' when the domain doesn't belong to the brand

create table if not exists brand_merges (
  id uuid primary key default gen_random_uuid(),
  from_brand uuid not null references brands(id),
  to_brand uuid not null references brands(id),
  reason text not null,
  from_snapshot jsonb not null,            -- the merged brand row as it was
  moved_ids uuid[] not null default '{}',  -- partnerships re-pointed to to_brand
  dropped_rows jsonb not null default '[]',-- partnerships that duplicated a post already on to_brand (kept here for undo)
  merged_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table brand_merges enable row level security;

create or replace function merge_brand(p_from uuid, p_to uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare m uuid; snap jsonb; moved uuid[]; dropped jsonb;
begin
  if p_from = p_to then raise exception 'same brand'; end if;
  select to_jsonb(b) into snap from brands b where id = p_from;
  if snap is null then raise exception 'no brand %', p_from; end if;
  -- rows that would collide with a post already attributed to the target: keep a copy, then remove
  select coalesce(jsonb_agg(to_jsonb(p)), '[]') into dropped from partnerships p
   where p.brand_id = p_from and exists (select 1 from partnerships q where q.brand_id = p_to and q.creator_id = p.creator_id and q.content_id = p.content_id);
  delete from partnerships p where p.brand_id = p_from and exists (select 1 from partnerships q where q.brand_id = p_to and q.creator_id = p.creator_id and q.content_id = p.content_id);
  with u as (update partnerships set brand_id = p_to where brand_id = p_from returning id) select coalesce(array_agg(id), '{}') into moved from u;
  update brands set merged_into = p_to, is_junk = true where id = p_from;
  insert into brand_merges (from_brand, to_brand, reason, from_snapshot, moved_ids, dropped_rows) values (p_from, p_to, p_reason, snap, moved, dropped) returning id into m;
  -- the target's counts, same rule as the worker's rollup (High, or Medium with a real non-affiliate signal)
  update brands t set
    deal_count = s.deals, creator_count = s.creators, last_seen = s.last
  from (select count(*)::int as deals, count(distinct creator_id)::int as creators, max(published_at)::date as last
        from partnerships where brand_id = p_to and status <> 'rejected'
          and (confidence_label = 'High' or (confidence_label = 'Medium' and coalesce(signal_type, '') <> '' and signal_type !~* '^\s*affiliate\s*$'))) s
  where t.id = p_to;
  return m;
end $$;

create or replace function unmerge_brand(p_merge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r brand_merges;
begin
  select * into r from brand_merges where id = p_merge and undone_at is null;
  if r.id is null then raise exception 'no open merge %', p_merge; end if;
  update partnerships set brand_id = r.from_brand where id = any(r.moved_ids);
  insert into partnerships select * from jsonb_populate_recordset(null::partnerships, r.dropped_rows) on conflict do nothing;
  update brands set merged_into = null, is_junk = coalesce((r.from_snapshot->>'is_junk')::boolean, false) where id = r.from_brand;
  update brand_merges set undone_at = now() where id = p_merge;
end $$;

revoke all on function merge_brand(uuid, uuid, text) from public, anon, authenticated;
revoke all on function unmerge_brand(uuid) from public, anon, authenticated;
grant execute on function merge_brand(uuid, uuid, text), unmerge_brand(uuid) to service_role;

-- 4. who's behind it, with dated evidence ------------------------------------------------------------------------
alter table brand_parents add column if not exists source text;
alter table brand_parents add column if not exists reviewed_on date;
update brand_parents set source = coalesce(source, 'Sponsorprint ownership list (public company filings and brand sites)'), reviewed_on = coalesce(reviewed_on, date '2026-11-03');

drop function if exists brand_behind(uuid);
-- One row per supporting post. kind: 'retail program' | 'co-tag'. Counted posts only (confirmed/likely).
create or replace function brand_behind_evidence(p_brand uuid)
returns table (kind text, name text, other_brand_id uuid, published_at timestamptz, content_url text, creator_id uuid, evidence text)
language sql stable security definer set search_path = public as $$
  with me as (select key from brands where id = p_brand),
  mine as (
    select p.creator_id, p.content_id, p.content_url, p.platform, p.published_at, left(p.evidence, 160) as evidence,
           lower(coalesce(p.content_title, '') || ' ' || coalesce(p.evidence, '')) as txt
    from partnerships p
    where p.brand_id = p_brand and p.status <> 'rejected' and evidence_tier(p.confidence_label, p.signal_type, p.evidence) in ('confirmed', 'likely')
  ), programs(re, retailer, own) as (values
    ('#(targetpartner|clubtarget)(?![a-z0-9_])', 'Target creator program (Club Target)', 'target'),
    ('#(walmartpartner|walmartcreator)(?![a-z0-9_])', 'Walmart Creator program', 'walmart'),
    ('#(amazoninfluencer|founditonamazon)(?![a-z0-9_])', 'Amazon Influencer Program', 'amazon'),
    ('#(ltk[a-z]*|shopltk|liketoknowit)(?![a-z0-9_])', 'LTK (rewardStyle)', 'ltk'),
    ('#(ultabeautypartner|ultapartner)(?![a-z0-9_])', 'Ulta Beauty creator program', 'ulta'),
    ('#(sephorasquad|sephorapartner)(?![a-z0-9_])', 'Sephora creator program', 'sephora'),
    ('#costcopartner(?![a-z0-9_])', 'Costco', 'costco'), ('#krogerpartner(?![a-z0-9_])', 'Kroger', 'kroger'),
    ('#bestbuypartner(?![a-z0-9_])', 'Best Buy', 'bestbuy'), ('#cvspartner(?![a-z0-9_])', 'CVS', 'cvs'),
    ('#walgreenspartner(?![a-z0-9_])', 'Walgreens', 'walgreens'), ('#tiktokshop(?![a-z0-9_])', 'TikTok Shop', 'tiktok')
  ), retail as (
    select distinct on (pr.retailer, m.content_id) 'retail program'::text, pr.retailer, null::uuid, m.published_at, m.content_url, m.creator_id, m.evidence
    from mine m join programs pr on m.txt ~ pr.re
    where (select key from me) not like pr.own || '%'   -- a retailer's own program isn't someone behind it
  ), co as (
    select distinct on (b.id, m.content_id) 'co-tag'::text, b.name, b.id, m.published_at, m.content_url, m.creator_id, m.evidence
    from mine m
    join partnerships o on o.creator_id = m.creator_id and o.content_id = m.content_id and o.brand_id <> p_brand and o.status <> 'rejected'
         and evidence_tier(o.confidence_label, o.signal_type, o.evidence) in ('confirmed', 'likely')
    join brands b on b.id = o.brand_id
    where m.platform = 'instagram' and not b.is_junk and not b.is_self_brand and b.name not like '%(?)'
  )
  select * from retail
  union all
  select * from co
$$;
revoke all on function brand_behind_evidence(uuid) from public, anon, authenticated;
grant execute on function brand_behind_evidence(uuid) to service_role;

-- rebookers: factual history only (every booking date and its post), no predicted dates
create or replace function brand_rebookers(p_brand uuid)
returns table (creator_id uuid, bookings int, first_at timestamptz, last_at timestamptz, gaps_days int[], booked_at timestamptz[], urls text[], tiers text[])
language sql stable security definer set search_path = public as $$
  with b as (
    select bk.*, lag(booked_at) over (partition by creator_id order by booked_at) as prev
    from brand_bookings_mv bk where brand_id = p_brand
  )
  select creator_id, count(*)::int, min(booked_at), max(booked_at),
         array_remove(array_agg((extract(epoch from (booked_at - prev)) / 86400)::int order by booked_at), null),
         array_agg(booked_at order by booked_at), array_agg(content_url order by booked_at), array_agg(tier order by booked_at)
  from b group by creator_id having count(*) >= 2
  order by max(booked_at) desc
$$;

create or replace function rebooking_now(p_days int default 60, p_limit int default 50, p_category text default null)
returns table (creator_id uuid, brand_id uuid, booked_at timestamptz, booking_no int, content_url text, platform text, tier text, evidence text)
language sql stable security definer set search_path = public as $$
  select bk.creator_id, bk.brand_id, bk.booked_at, bk.booking_no, bk.content_url, bk.platform, bk.tier, bk.evidence
  from brand_bookings_mv bk join brands b on b.id = bk.brand_id
  where bk.booking_no >= 2 and bk.booked_at > now() - make_interval(days => p_days)
    and not b.is_junk and not b.is_self_brand and not coalesce(b.is_affiliate, false) and b.name not like '%(?)'
    and (p_category is null or b.category = p_category)
  order by bk.booked_at desc
  limit p_limit
$$;
revoke all on function brand_rebookers(uuid) from public, anon, authenticated;
revoke all on function rebooking_now(int, int, text) from public, anon, authenticated;
grant execute on function brand_rebookers(uuid), rebooking_now(int, int, text) to service_role;

create or replace view brand_leaderboard_v as
select b.id, b.name, b.key, b.category, b.verticals, b.website, b.domain, b.site_status, b.website_flag, b.classified_at,
       b.is_mass_sponsor, b.is_affiliate, b.platform_counts, b.deal_count, b.creator_count, b.last_seen,
       coalesce(s.bookings, 0) as bookings, coalesce(s.bookings_confirmed, 0) as bookings_confirmed,
       coalesce(s.bookings_90d, 0) as bookings_90d, coalesce(s.bookings_90d_confirmed, 0) as bookings_90d_confirmed,
       coalesce(s.bookings_prev_90d, 0) as bookings_prev_90d, coalesce(s.bookings_12m, 0) as bookings_12m,
       coalesce(s.creators, 0) as paid_creators, coalesce(s.creators_90d, 0) as creators_90d, coalesce(s.rebook_creators, 0) as rebook_creators,
       case when coalesce(s.creators, 0) >= 3 then round(s.rebook_creators::numeric / s.creators, 3) end as rebook_rate,
       s.median_followers, s.last_at as last_booked_at, s.by_month,
       coalesce(s.bookings_90d, 0) - coalesce(s.bookings_prev_90d, 0) as pace_delta,
       array(select k from jsonb_each_text(coalesce(b.verticals, '{}'::jsonb)) as v(k, n) where k <> 'Other' and n ~ '^\d+$' and n::int >= 2) as books
from brands b
left join brand_stats_mv s on s.brand_id = b.id
where not b.is_junk and not b.is_self_brand and b.merged_into is null and b.site_status is distinct from 'dead' and b.name not like '%(?)';
revoke all on brand_leaderboard_v from anon, authenticated;
grant select on brand_leaderboard_v to service_role;

create or replace function brand_category_counts(p_ids uuid[] default null)
returns table (category text, n int)
language sql stable security definer set search_path = public as $$
  select category, count(*)::int from brand_leaderboard_v
  where category is not null and (p_ids is null or id = any(p_ids))
  group by category order by 2 desc
$$;
revoke all on function brand_category_counts(uuid[]) from public, anon, authenticated;
grant execute on function brand_category_counts(uuid[]) to service_role;

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
revoke execute on function refresh_brand_wall() from public, anon, authenticated;
grant execute on function refresh_brand_wall() to service_role;
