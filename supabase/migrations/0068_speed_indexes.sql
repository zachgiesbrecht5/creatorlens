-- Applied live Nov 10 2026. Home page "recently printed" sorted the whole creators table on every load;
-- scan_jobs lookups by creator and by user (My prints, the print page) had no index.
create index if not exists creators_last_scanned on public.creators (last_scanned_at desc nulls last);
create index if not exists scan_jobs_creator_idx on public.scan_jobs (creator_id);
create index if not exists scan_jobs_user_idx on public.scan_jobs (user_id, created_at desc);

-- Also applied Nov 10: the hooks backfill picks its candidates in SQL instead of downloading every
-- recent creator's performance blob; unchecked-brand-site lookup gets a partial index; brand_wall_state RLS on.
create or replace function public.hooks_backfill_candidates(p_limit int default 4)
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from creators c
  where c.platform = 'instagram' and c.last_scanned_at >= now() - interval '14 days' and c.performance is not null
    and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(c.performance->'top') = 'array' then c.performance->'top' else '[]'::jsonb end) with ordinality t(x, i)
      where t.i <= 6 and coalesce(t.x->>'kind','') ~* 'reel|video|clip'
        and (t.x->'audio' is null or t.x->'audio' = 'null'::jsonb)
        and coalesce(t.x->>'hooks_backfilled','false') in ('false','null','0','')
    )
  order by c.last_scanned_at desc limit p_limit
$$;
revoke execute on function public.hooks_backfill_candidates(int) from public, anon, authenticated;
grant execute on function public.hooks_backfill_candidates(int) to service_role;
create index if not exists brands_site_unchecked on public.brands (deal_count desc) where site_checked_at is null;
alter table public.brand_wall_state enable row level security;
