-- When can Instagram prints run again? Earliest moment a healthy connection leaves cooldown
-- (null when one is free now). Readable by any signed-in user; exposes a timestamp only.
create or replace function ig_pool_ready_at() returns timestamptz language sql security definer stable as $$
  select case
    when exists (select 1 from ig_connections where healthy and (cooldown_until is null or cooldown_until < now())) then null
    else (select min(cooldown_until) from ig_connections where healthy)
  end;
$$;
grant execute on function ig_pool_ready_at() to authenticated;
