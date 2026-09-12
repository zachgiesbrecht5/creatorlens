-- Agent research for brands Hunter can't reach (house brands of P&G, Unilever…).
-- The web asks for a job; the worker runs a web-searching model, verifies emails
-- through Hunter, and files what it finds as contacts with source='agent' plus
-- the URL it found the person on. One research pass per brand, cached.

create table if not exists contact_research (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  status text not null default 'queued',      -- queued | running | done | failed
  summary text,                               -- one-line answer for the card (agency of record, parent, etc.)
  parent_company text,
  agency text,
  agency_url text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (brand_id)
);
alter table contact_research enable row level security;
drop policy if exists "research read" on contact_research;
create policy "research read" on contact_research for select using (is_house_user());

alter table contacts add column if not exists source_url text;
alter table contacts add column if not exists confidence numeric;

-- brand_wall/leaderboard don't need it; the contacts route reads this directly.
