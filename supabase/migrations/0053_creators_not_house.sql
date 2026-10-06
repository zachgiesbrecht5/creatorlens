-- Roster creators (profiles.role = 'creator') sign in with house-domain emails but are not house users:
-- RLS must not hand them contacts, outreach logs or every scan. Mirrors currentAccess() in the web app.
create or replace function is_house_user() returns boolean language sql stable security definer as $$
  select exists (
    select 1 from profiles p left join orgs o on o.id = p.org_id
    where p.id = auth.uid() and coalesce(p.role, '') <> 'creator' and (p.plan = 'admin' or coalesce(o.is_house, false))
  );
$$;
