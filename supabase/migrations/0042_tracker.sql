-- Outreach tracker sync: a Google Sheet per account (Rootfor's team tracker), read hourly,
-- so every brand on every page carries "pitched 12 days ago by Karli" / "excluded" / "clean".
alter table profiles add column if not exists tracker_sheet_id text;
alter table profiles add column if not exists tracker_synced_at timestamptz;
alter table profiles add column if not exists tracker_note text;
create table if not exists tracker_rows (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  tab text not null,                 -- outreach | exclude
  brand text not null,
  brand_key text not null,           -- normalized name
  domain text,                       -- from the contact email
  date_sent date,
  sent_by text,
  creator text,
  contact_email text,
  status text,
  notes text
);
create index if not exists tracker_rows_user_key on tracker_rows (user_id, brand_key);
create index if not exists tracker_rows_user_domain on tracker_rows (user_id, domain);
alter table tracker_rows enable row level security;
drop policy if exists "tracker own" on tracker_rows;
create policy "tracker own" on tracker_rows for select using (user_id = auth.uid());
