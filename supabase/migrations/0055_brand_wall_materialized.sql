-- brand_wall as a materialized view (brand_wall_mv). The live view re-aggregated every partnership on
-- every read (2-3 s per query; a creator page read it three times). The worker refreshes it after each
-- print (refresh_brand_wall(), concurrent, needs the unique index). The old view stays until a quiet
-- moment allows `drop view brand_wall; alter materialized view brand_wall_mv rename to brand_wall`.
create materialized view if not exists brand_wall_mv as
 SELECT p.creator_id, b.id AS brand_id, b.name AS brand, b.category, b.is_mass_sponsor, b.is_self_brand, b.is_affiliate, b.website, b.site_status, b.is_junk,
    count(*) AS deals,
    array_agg(DISTINCT p.platform::text) AS platforms,
    max(p.confidence_score) AS best_score,
    (array_agg(p.confidence_label ORDER BY p.confidence_score DESC))[1] AS best_label,
    min(p.published_at) AS first_seen, max(p.published_at) AS last_seen,
    (array_agg(p.evidence ORDER BY p.confidence_score DESC))[1] AS evidence,
    (array_agg(p.content_url ORDER BY p.confidence_score DESC))[1] AS content_url,
    (array_agg(p.content_title ORDER BY p.confidence_score DESC))[1] AS content_title,
    count(*) FILTER (WHERE p.confidence_label = ANY (ARRAY['High'::text, 'Medium'::text])) >= 2 AND (max(p.published_at) - min(p.published_at)) >= '30 days'::interval AS repeat_partner,
    cb.creators_booked
   FROM partnerships p
     JOIN brands b ON b.id = p.brand_id
     JOIN (select brand_id, count(distinct creator_id) as creators_booked from partnerships group by brand_id) cb ON cb.brand_id = b.id
  WHERE p.status <> 'rejected'::text
  GROUP BY p.creator_id, b.id, b.name, b.category, b.is_mass_sponsor, b.is_self_brand, b.is_affiliate, b.website, b.site_status, b.is_junk, cb.creators_booked;
create unique index if not exists brand_wall_mv_pk on brand_wall_mv (creator_id, brand_id);
create index if not exists brand_wall_mv_brand on brand_wall_mv (brand_id);
grant select on brand_wall_mv to anon, authenticated, service_role;
create or replace function refresh_brand_wall() returns void language sql security definer as $$ refresh materialized view concurrently brand_wall_mv; $$;
grant execute on function refresh_brand_wall() to service_role, authenticated;
