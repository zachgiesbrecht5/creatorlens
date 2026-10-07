-- performance without the base64 thumbnails and expiring CDN links, for list pages (lane, watchlists).
-- A lane of 130 creators was 13 MB of JSON per page load once the cover backfill filled in thumbs.
create or replace function perf_slim(p jsonb) returns jsonb language sql immutable as $$
  select case when p is null then null else
    (p - 'top') || jsonb_build_object('top', coalesce((select jsonb_agg(t - 'thumb' - 'cover' - 'video' order by ord) from jsonb_array_elements(coalesce(p->'top','[]'::jsonb)) with ordinality x(t, ord)), '[]'::jsonb))
  end
$$;
create or replace view creators_slim as
  select id, platform, handle, external_id, display_name, avatar_url, followers, category, last_scanned_at, is_public, perf_slim(performance) as performance
  from creators;
grant select on creators_slim to authenticated, service_role;
