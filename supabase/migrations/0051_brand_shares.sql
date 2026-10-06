-- Read-only share links for brand pages ("send this to our creators").
-- Server-side only: the web app reads/writes with the service role, so RLS has no policies.
create table if not exists brand_shares (
  token text primary key,
  brand_id uuid not null references brands(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  views int not null default 0,
  last_viewed_at timestamptz
);
create index if not exists brand_shares_brand on brand_shares (brand_id) where revoked_at is null;
alter table brand_shares enable row level security;
