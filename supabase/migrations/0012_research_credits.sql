-- Research for beta users: 3 credits each (it costs real money per run).
-- House/pro/admin are unlimited. Agent-found contacts are visible to the
-- house and to whoever requested that research.

alter table profiles add column if not exists research_credits int not null default 3;

create or replace function spend_credit(p_user uuid, p_kind text, p_reason text, p_ref text default null)
returns boolean language plpgsql security definer as $$
declare ok boolean;
begin
  if p_kind = 'scan' then
    update profiles set scan_credits = scan_credits - 1 where id = p_user and (scan_credits > 0 or plan in ('team','pro','admin')) returning true into ok;
  elsif p_kind = 'research' then
    update profiles set research_credits = research_credits - 1 where id = p_user and (research_credits > 0 or plan in ('team','pro','admin')) returning true into ok;
  else
    update profiles set draft_credits = draft_credits - 1 where id = p_user and (draft_credits > 0 or plan in ('team','pro','admin')) returning true into ok;
  end if;
  if ok then insert into credit_ledger (user_id, kind, delta, reason, ref) values (p_user, p_kind, -1, p_reason, p_ref); end if;
  return coalesce(ok, false);
end $$;

create or replace function grant_credits(p_user uuid, p_kind text, p_n int, p_reason text)
returns void language plpgsql security definer as $$
begin
  if p_kind = 'scan' then update profiles set scan_credits = scan_credits + p_n where id = p_user;
  elsif p_kind = 'research' then update profiles set research_credits = research_credits + p_n where id = p_user;
  else update profiles set draft_credits = draft_credits + p_n where id = p_user; end if;
  insert into credit_ledger (user_id, kind, delta, reason) values (p_user, p_kind, p_n, p_reason);
end $$;

-- research results: house sees all; the requester sees their own
drop policy if exists "research read" on contact_research;
create policy "research read" on contact_research for select using (is_house_user() or requested_by = auth.uid());

-- agent contacts: house, or the person whose research found them
drop policy if exists "contacts read" on contacts;
create policy "contacts read" on contacts for select using (
  is_house_user()
  or (not house_only and source in ('hunter','apollo'))
  or (source in ('manual','agent') and found_by = auth.uid())
);
