-- Business Suite content-table rows -> owned_post_insights (applied in prod 2026-10-09).
-- Row shape: [date "Thu Oct 8, 10:58am" (Pacific), type, caption, views, reach, interactions, likes, comments, shares, saves, follows]
-- Fed by the daily scheduled task that reads Meta Business Suite Insights > Content for the creators in portfolio 1218022666099693.
create or replace function public.bs_ingest(p_handle text, p_page_id text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare n int; now_la timestamp := (now() at time zone 'America/Los_Angeles'); cid uuid;
begin
  select id into cid from creators where platform = 'instagram' and lower(handle) = lower(p_handle) limit 1;
  if cid is null then raise exception 'no instagram creator %', p_handle; end if;
  with r as (
    select e->>0 d, e->>1 typ, coalesce(e->>2, '') cap,
      (e->>3)::bigint views, (e->>4)::bigint reach, (e->>5)::bigint inter, (e->>6)::bigint likes,
      (e->>7)::bigint comments, (e->>8)::bigint shares, (e->>9)::bigint saves, (e->>10)::bigint follows
    from jsonb_array_elements(p_rows) e
  ), p as (
    select r.*, to_timestamp(substr(d, 5) || ' ' || extract(year from now_la)::int, 'Mon DD, HH12:MIam YYYY')::timestamp t,
      'bs:' || lower(p_handle) || ':' || left(encode(digest(d || '|' || left(cap, 40), 'sha1'), 'hex'), 16) mid
    from r
  )
  insert into owned_post_insights (ig_user_id, creator_id, media_id, permalink, posted_at, media_type, caption, likes, comments, saves, shares, reach, views, follows, total_interactions, updated_at)
  select 'bs:' || p_page_id, cid, mid, 'https://www.instagram.com/' || lower(p_handle) || '/#' || right(mid, 8),
    (case when t > now_la + interval '2 days' then t - interval '1 year' else t end) at time zone 'America/Los_Angeles',
    case typ when 'Reel' then 'REELS' when 'Multi media' then 'CAROUSEL_ALBUM' when 'Carousel' then 'CAROUSEL_ALBUM' when 'Photo' then 'IMAGE' when 'Video' then 'VIDEO' else typ end,
    cap, likes, comments, saves, shares, reach, views, follows, inter, now()
  from p
  on conflict (media_id) do update set likes = excluded.likes, comments = excluded.comments, saves = excluded.saves, shares = excluded.shares,
    reach = excluded.reach, views = excluded.views, follows = excluded.follows, total_interactions = excluded.total_interactions, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.bs_ingest(text, text, jsonb) from public, anon, authenticated;
