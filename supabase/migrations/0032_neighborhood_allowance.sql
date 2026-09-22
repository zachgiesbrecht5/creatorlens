-- Neighborhoods are the discovery engine, so they're generous and reset every 30 days:
-- free 5, pro 50, agency 200, house unlimited. Measured cost is logged per run.
alter table neighborhoods add column if not exists seed_key text;
alter table neighborhoods add column if not exists cost_usd numeric(8,4);
create index if not exists neighborhoods_seed_idx on neighborhoods (seed_key, created_at desc);

create or replace function hood_limit(p_plan text) returns int language sql immutable as $$
  select case p_plan when 'agency' then 200 when 'pro' then 50 when 'team' then 100000 when 'admin' then 100000 else 5 end;
$$;

create or replace function hood_remaining(p_user uuid) returns int language sql stable security definer set search_path = public as $$
  select greatest(0, hood_limit(p.plan::text) - (select count(*)::int from credit_ledger l where l.user_id = p.id and l.kind = 'hood' and l.created_at > now() - interval '30 days'))
  from profiles p where p.id = p_user;
$$;

create or replace function spend_credit(p_user uuid, p_kind text, p_reason text, p_ref text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean; n int;
begin
  if p_kind = 'scan' then
    select count(*) into n from credit_ledger where user_id = p_user and kind = 'scan' and created_at > now() - interval '1 day';
    select (plan in ('team','pro','agency','admin') or n < 25) into ok from profiles where id = p_user;
  elsif p_kind = 'hood' then
    select hood_remaining(p_user) > 0 into ok;
  elsif p_kind = 'research' then
    update profiles set research_credits = research_credits - 1 where id = p_user and (research_credits > 0 or plan in ('team','admin')) returning true into ok;
  elsif p_kind = 'reveal' then
    update profiles set reveal_credits = reveal_credits - 1 where id = p_user and (reveal_credits > 0 or plan in ('team','pro','agency','admin')) returning true into ok;
  else
    update profiles set draft_credits = draft_credits - 1 where id = p_user and (draft_credits > 0 or plan in ('team','agency','admin')) returning true into ok;
  end if;
  if ok then insert into credit_ledger (user_id, kind, delta, reason, ref) values (p_user, p_kind, -1, p_reason, p_ref); end if;
  return coalesce(ok, false);
end $$;
select 'ok' as done;
