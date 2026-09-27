-- Who an Instagram creator tags in their captions (collabs, friends), from each scan.
alter table creators add column if not exists mentions jsonb;
