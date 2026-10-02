-- Top posts + format/hook read per creator, captured at scan time.
alter table creators add column if not exists performance jsonb;
