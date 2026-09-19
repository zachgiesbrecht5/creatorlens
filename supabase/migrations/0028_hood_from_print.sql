-- Neighborhoods can start from any printed creator, not only a roster row.
alter table neighborhoods alter column roster_creator_id drop not null;
alter table neighborhoods add column if not exists creator_id uuid references creators(id) on delete cascade;
alter table neighborhoods add column if not exists exclude jsonb not null default '[]'::jsonb;   -- handles to avoid (previous rounds)
