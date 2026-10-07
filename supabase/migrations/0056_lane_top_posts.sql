-- The lane's best posts as cards: top posts of every creator watched under these roster rows, each measured
-- against its own creator's median, thumbnails kept, CDN links dropped. Score blends size with the over-median
-- multiple (capped at 100x so a 90-median account can't own the list). Powers LaneCards on /me and /me/watchlist.
create or replace function lane_top_posts(p_roster_ids uuid[], p_limit int, p_days int, p_voice_only boolean)
returns table (creator_id uuid, handle text, platform text, display_name text, avatar_url text, followers int, median numeric, metric_label text, mult numeric, score numeric, post jsonb)
language sql stable security definer as $$
  with w as (
    select distinct platform::text as platform, lower(handle) as h from watchlist where roster_creator_id = any(p_roster_ids)
  ), lane as (
    select c.id, c.handle, c.platform::text as platform, c.display_name, c.avatar_url, c.followers,
           nullif((c.performance->>'median')::numeric, 0) as median, c.performance->>'metric_label' as metric_label, c.performance->'top' as top
    from creators c join w on w.platform = c.platform::text and lower(c.handle) = w.h
    where c.performance is not null
  ), posts as (
    select l.id, l.handle, l.platform, l.display_name, l.avatar_url, l.followers, l.median, l.metric_label,
           (t->>'metric')::numeric as metric,
           case when l.median >= 100 then round((t->>'metric')::numeric / l.median, 1) else null end as mult,
           (t - 'video' - 'cover') as post
    from lane l, jsonb_array_elements(coalesce(l.top, '[]'::jsonb)) t
    where (t->>'published_at')::timestamptz >= now() - make_interval(days => p_days)
      and (not p_voice_only or (t->>'audio' = 'voice' and length(coalesce(t->>'spoken','')) > 0))
  )
  select id, handle, platform, display_name, avatar_url, followers, median, metric_label, mult,
         round((ln(metric + 1) + ln(least(coalesce(mult, 1), 100) + 1))::numeric, 3) as score, post
  from posts
  order by score desc
  limit p_limit;
$$;
grant execute on function lane_top_posts(uuid[], int, int, boolean) to authenticated, service_role;
