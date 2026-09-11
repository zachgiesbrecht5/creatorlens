-- Per-platform deal counts on each brand, so the leaderboard can say whether
-- a brand books on YouTube, Instagram, or both. Maintained by the worker's
-- rollup; backfilled here.
alter table brands add column if not exists platform_counts jsonb not null default '{}'::jsonb;
update brands b set platform_counts = coalesce((
  select jsonb_object_agg(platform, n) from (
    select p.platform::text as platform, count(*) as n from partnerships p where p.brand_id = b.id and p.status <> 'rejected' group by p.platform
  ) x), '{}'::jsonb);
-- clean up two site_name artefacts from the first backfill
update brands set name = regexp_replace(regexp_replace(name, '\s*[»«|·].*$', ''), '\s*(Limited|Ltd\.?|Inc\.?|LLC|Ventures|Corp\.?|Co\.)(,|\s|$).*$', '') where not name_locked and name ~ '[»«|·]|Limited|Ltd|Inc\.|LLC|Ventures|Corp';
