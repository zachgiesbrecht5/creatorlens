-- Scans are per person. Only admins (Zach, Victoria) see every scan across
-- every user; house members keep the team's contacts, history, exclusions and
-- research but only see the creators they scanned themselves.

update profiles set plan = 'admin' where lower(email) in ('zach.giesbrecht@rootforgroup.com', 'victoria@rootforgroup.com');

-- future sign-ins from those addresses become admins
create or replace function attach_house_org() returns trigger language plpgsql security definer as $$
declare h uuid;
begin
  if new.org_id is null and new.email ilike '%@rootforgroup.com' then
    select id into h from orgs where is_house limit 1;
    if h is not null then new.org_id := h; if new.plan = 'trial' then new.plan := 'team'; end if; end if;
  end if;
  if lower(new.email) in ('zach.giesbrecht@rootforgroup.com', 'victoria@rootforgroup.com') then new.plan := 'admin'; end if;
  return new;
end $$;

create or replace function is_admin_user() returns boolean language sql stable security definer as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.plan = 'admin');
$$;

-- creators / partnerships: admins see all; everyone else only what they unlocked
drop policy if exists "house read creators" on creators;
create policy "creators read" on creators for select using (
  is_admin_user() or exists (select 1 from creator_access a where a.user_id = auth.uid() and a.platform = creators.platform and lower(a.handle) = lower(creators.handle))
);
drop policy if exists "house read partnerships" on partnerships;
create policy "partnerships read" on partnerships for select using (
  is_admin_user() or exists (select 1 from creators c join creator_access a on a.platform = c.platform and lower(a.handle) = lower(c.handle) where c.id = partnerships.creator_id and a.user_id = auth.uid())
);
drop policy if exists "jobs read" on scan_jobs;
create policy "jobs read" on scan_jobs for select using (is_admin_user() or user_id = auth.uid());
-- contacts, outreach_log, exclusions, research stay house-wide (team assets)
