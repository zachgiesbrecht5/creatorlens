-- Watchlist per roster creator: each watched creator belongs to one of your
-- creators' lanes (or none), so the page can be filtered creator by creator.
alter table watchlist add column if not exists roster_creator_id uuid references roster_creators(id) on delete set null;
alter table watch_events add column if not exists roster_creator_id uuid references roster_creators(id) on delete set null;
create index if not exists watchlist_roster on watchlist (user_id, roster_creator_id);
