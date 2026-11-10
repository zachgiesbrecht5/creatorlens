-- Applied live Nov 10 2026. Home page "recently printed" sorted the whole creators table on every load;
-- scan_jobs lookups by creator and by user (My prints, the print page) had no index.
create index if not exists creators_last_scanned on public.creators (last_scanned_at desc nulls last);
create index if not exists scan_jobs_creator_idx on public.scan_jobs (creator_id);
create index if not exists scan_jobs_user_idx on public.scan_jobs (user_id, created_at desc);
