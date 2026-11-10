-- Applied live Nov 9 2026. brand_wall_mv now takes ~5 s to refresh (120k partnerships) and went past the
-- API's 8 s statement timeout under load, so new prints showed "No deals found" even though their deals were saved.
-- 1) Server-side (service-role) API calls get a longer timeout; browser roles keep 8 s / 3 s.
alter role service_role set statement_timeout = '120s';
alter role service_role set lock_timeout = '90s';

-- 2) One refresh at a time; a caller already covered by a refresh that started after it returns immediately.
create sequence if not exists public.brand_wall_bump;
create table if not exists public.brand_wall_state (id int primary key default 1 check (id = 1), covered bigint not null default 0, refreshed_at timestamptz);
insert into public.brand_wall_state (id) values (1) on conflict do nothing;
revoke all on public.brand_wall_state from anon, authenticated;
revoke all on sequence public.brand_wall_bump from anon, authenticated;

create or replace function public.refresh_brand_wall()
returns void language plpgsql security definer set search_path = public as $$
declare mine bigint; upto bigint;
begin
  mine := nextval('brand_wall_bump');
  perform pg_advisory_xact_lock(hashtext('refresh_brand_wall'));
  if (select covered from brand_wall_state where id = 1) >= mine then return; end if;
  select last_value into upto from brand_wall_bump;
  refresh materialized view concurrently brand_wall_mv;
  update brand_wall_state set covered = greatest(covered, upto), refreshed_at = now() where id = 1;
end $$;
revoke execute on function public.refresh_brand_wall() from public, anon, authenticated;
grant execute on function public.refresh_brand_wall() to service_role;

notify pgrst, 'reload config';
