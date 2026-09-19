-- Discover: the worker picks creators on its own each night (adjacent to the
-- rosters people have added, plus thin categories), prints them, and they are
-- public: anyone signed in can open them. They feed "Fresh off the printer"
-- on the home page.
alter table creators add column if not exists is_public boolean not null default false;
alter table creators add column if not exists discovered_at timestamptz;
alter table creators add column if not exists discover_reason text;
alter table scan_jobs add column if not exists note text;
create index if not exists creators_discovered on creators (discovered_at desc) where is_public;

create or replace function category_counts() returns table(category text, n bigint) language sql stable security definer as $$
  select c.category, count(*) from creators c where c.last_scanned_at is not null and c.category is not null group by c.category order by 2;
$$;
