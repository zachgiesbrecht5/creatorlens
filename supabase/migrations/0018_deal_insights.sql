-- One-line "why this brand, why then" per creator x brand, written by the
-- worker after a scan (one cheap model call per creator, all brands at once).
create table if not exists deal_insights (
  creator_id uuid not null references creators(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  why text not null,
  season text,                       -- e.g. "Q4 gifting", "back to school", "tax season", "summer travel"
  created_at timestamptz not null default now(),
  primary key (creator_id, brand_id)
);
alter table deal_insights enable row level security;
drop policy if exists "insights read" on deal_insights;
create policy "insights read" on deal_insights for select using (
  is_admin_user() or exists (select 1 from creators c join creator_access a on a.platform = c.platform and lower(a.handle) = lower(c.handle) where c.id = deal_insights.creator_id and a.user_id = auth.uid())
);
-- creators get re-explained when a new scan adds brands
alter table creators add column if not exists insights_at timestamptz;
