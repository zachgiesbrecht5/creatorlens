-- Atomic job claiming so N concurrent scans (and N worker replicas) never pick
-- the same job. FOR UPDATE SKIP LOCKED is the standard Postgres queue trick.
-- Also a queue-position function for the printing screen.

create or replace function claim_scan_jobs(p_limit int, p_worker text)
returns setof scan_jobs language plpgsql security definer as $$
begin
  return query
  with picked as (
    select id from scan_jobs
    where status in ('queued','rate_limited') and run_after <= now()
    order by priority, created_at
    limit p_limit
    for update skip locked
  )
  update scan_jobs j set status = 'running', started_at = now(), attempts = j.attempts + 1, error = null
  from picked where j.id = picked.id
  returning j.*;
end $$;

-- how many jobs are ahead of this one (queued/rate_limited/running with earlier priority+created)
create or replace function queue_position(p_job uuid) returns int language sql stable security definer as $$
  select count(*)::int from scan_jobs a, scan_jobs me
  where me.id = p_job and a.id <> me.id
    and a.status in ('queued','rate_limited','running')
    and (a.priority < me.priority or (a.priority = me.priority and a.created_at < me.created_at));
$$;

-- stuck-job reaper: anything "running" for >15 minutes goes back to queued (worker died mid-scan)
create or replace function requeue_stuck_jobs() returns int language plpgsql security definer as $$
declare n int;
begin
  update scan_jobs set status = 'queued', run_after = now(), error = 'requeued: worker did not finish'
  where status = 'running' and started_at < now() - interval '15 minutes' and attempts < 6;
  get diagnostics n = row_count;
  return n;
end $$;
