-- House scope: the shared index is Rootfor's asset. Members of the house org
-- (and plan='admin') see everything. Everyone else sees only the creators
-- they scanned themselves, brand names on the leaderboard, and their own
-- drafts/outreach. Enforced in the app (server routes) AND in RLS so a
-- direct API call with the anon key gets the same fence.

alter table orgs add column if not exists is_house boolean not null default false;
update orgs set is_house = true where name = 'Rootfor Group';

-- Auto-attach @rootforgroup.com sign-ups to the house org so teammates are
-- insiders the moment they log in (owner stays admin via seed-org.sql).
create or replace function attach_house_org() returns trigger language plpgsql security definer as $$
declare h uuid;
begin
  if new.org_id is null and new.email ilike '%@rootforgroup.com' then
    select id into h from orgs where is_house limit 1;
    if h is not null then new.org_id := h; if new.plan = 'trial' then new.plan := 'team'; end if; end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_attach_house on profiles;
create trigger profiles_attach_house before insert on profiles for each row execute function attach_house_org();
-- backfill anyone who already signed in with a house address
update profiles set org_id = (select id from orgs where is_house limit 1), plan = case when plan = 'trial' then 'team' else plan end
 where org_id is null and email ilike '%@rootforgroup.com';

-- Which creators each user has "unlocked" by scanning (cached hits included:
-- scan_jobs alone misses those). One row per user x creator handle.
create table if not exists creator_access (
  user_id uuid not null references profiles(id) on delete cascade,
  platform platform_t not null,
  handle text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, platform, handle)
);
alter table creator_access enable row level security;
drop policy if exists "own access" on creator_access;
create policy "own access" on creator_access for select using (auth.uid() = user_id);
-- backfill from every scan anyone has run
insert into creator_access (user_id, platform, handle, created_at)
  select user_id, platform, lower(handle), min(created_at) from scan_jobs where user_id is not null group by user_id, platform, lower(handle)
on conflict do nothing;

create or replace function is_house_user() returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles p left join orgs o on o.id = p.org_id
    where p.id = auth.uid() and (p.plan = 'admin' or coalesce(o.is_house, false))
  );
$$;

-- RLS: pool reads become house-only, except brand names.
drop policy if exists "pool read creators" on creators;
create policy "house read creators" on creators for select using (
  is_house_user() or exists (select 1 from creator_access a where a.user_id = auth.uid() and a.platform = creators.platform and lower(a.handle) = lower(creators.handle))
);
drop policy if exists "pool read partnerships" on partnerships;
create policy "house read partnerships" on partnerships for select using (
  is_house_user() or exists (select 1 from creators c join creator_access a on a.platform = c.platform and lower(a.handle) = lower(c.handle) where c.id = partnerships.creator_id and a.user_id = auth.uid())
);
drop policy if exists "pool read contacts" on contacts;
create policy "house read contacts" on contacts for select using (is_house_user());
drop policy if exists "confirm partnerships" on partnerships;
create policy "house confirm partnerships" on partnerships for update using (is_house_user()) with check (is_house_user());
drop policy if exists "pool read jobs" on scan_jobs;
create policy "jobs read" on scan_jobs for select using (is_house_user() or user_id = auth.uid());
-- outreach_log: house sees all (cross-manager intel); others only their own
drop policy if exists "org outreach" on outreach_log;
create policy "outreach read" on outreach_log for select using (is_house_user() or user_id = auth.uid());
