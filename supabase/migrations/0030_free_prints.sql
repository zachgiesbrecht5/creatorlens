-- Prints are free on every plan. They cost YouTube/Instagram quota, not money, so free users
-- get a fair-use cap of 25 new prints a day (cached prints never count). The money-costing
-- tools stay metered: contact reveals (Hunter/Apollo), pitch drafts (Claude), research (Claude
-- + web search) and the neighborhood finder (Claude web search), which gets its own credit.

alter table profiles add column if not exists hood_credits int not null default 1;  -- first neighborhood free

create or replace function spend_credit(p_user uuid, p_kind text, p_reason text, p_ref text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean; n int;
begin
  if p_kind = 'scan' then
    select count(*) into n from credit_ledger where user_id = p_user and kind = 'scan' and created_at > now() - interval '1 day';
    select (plan in ('team','pro','agency','admin') or n < 25) into ok from profiles where id = p_user;
  elsif p_kind = 'research' then
    update profiles set research_credits = research_credits - 1 where id = p_user and (research_credits > 0 or plan in ('team','admin')) returning true into ok;
  elsif p_kind = 'reveal' then
    update profiles set reveal_credits = reveal_credits - 1 where id = p_user and (reveal_credits > 0 or plan in ('team','pro','agency','admin')) returning true into ok;
  elsif p_kind = 'hood' then
    update profiles set hood_credits = hood_credits - 1 where id = p_user and (hood_credits > 0 or plan in ('team','admin')) returning true into ok;
  else
    update profiles set draft_credits = draft_credits - 1 where id = p_user and (draft_credits > 0 or plan in ('team','agency','admin')) returning true into ok;
  end if;
  if ok then insert into credit_ledger (user_id, kind, delta, reason, ref) values (p_user, p_kind, -1, p_reason, p_ref); end if;
  return coalesce(ok, false);
end $$;

create or replace function refill_plan_credits(p_user uuid, p_plan text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_plan = 'pro' then
    update profiles set draft_credits = greatest(draft_credits, 60), research_credits = greatest(research_credits, 15), hood_credits = greatest(hood_credits, 10) where id = p_user;
  elsif p_plan = 'agency' then
    update profiles set draft_credits = greatest(draft_credits, 9999), research_credits = greatest(research_credits, 60), hood_credits = greatest(hood_credits, 40) where id = p_user;
  end if;
  insert into credit_ledger (user_id, kind, delta, reason) values (p_user, 'refill', 0, 'plan:' || p_plan);
end $$;

create or replace function grant_credits(p_user uuid, p_kind text, p_n int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'scan' then
    -- prints are free; a refund (failed print) just gives back today's fair-use slot
    delete from credit_ledger where id = (select id from credit_ledger where user_id = p_user and kind = 'scan' and delta < 0 order by created_at desc limit 1);
  elsif p_kind = 'research' then update profiles set research_credits = research_credits + p_n where id = p_user;
  elsif p_kind = 'reveal' then update profiles set reveal_credits = reveal_credits + p_n where id = p_user;
  elsif p_kind = 'hood' then update profiles set hood_credits = hood_credits + p_n where id = p_user;
  else update profiles set draft_credits = draft_credits + p_n where id = p_user; end if;
  if p_kind <> 'scan' then insert into credit_ledger (user_id, kind, delta, reason) values (p_user, p_kind, p_n, p_reason); end if;
end $$;

-- Referrals used to give prints; prints are free now, so both sides get 5 pitch drafts.
create or replace function apply_referral(p_new_user uuid, p_code text) returns boolean language plpgsql security definer set search_path = public as $$
declare ref_id uuid;
begin
  select id into ref_id from profiles where referral_code = p_code and id <> p_new_user;
  if ref_id is null then return false; end if;
  update profiles set referred_by = ref_id where id = p_new_user and referred_by is null;
  if not found then return false; end if;
  perform grant_credits(p_new_user, 'draft', 5, 'referral');
  perform grant_credits(ref_id, 'draft', 5, 'referral');
  return true;
end $$;

-- existing paid users get their monthly neighborhoods now rather than at next renewal
update profiles set hood_credits = greatest(hood_credits, 10) where plan = 'pro';
update profiles set hood_credits = greatest(hood_credits, 40) where plan = 'agency';
select 'ok' as done;
