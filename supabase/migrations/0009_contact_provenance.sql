-- Contact provenance and the house wall.
--   tracker : Rootfor's own outreach history (imported). HOUSE ONLY, forever.
--   hunter/apollo : third-party lookups. Visible to whoever the app decides.
--   manual  : pasted by a user. Private to that user (found_by).
-- The app enforces this in /api/contacts; RLS enforces it for any direct read.

alter table contacts add column if not exists found_by uuid references profiles(id) on delete set null;
alter table contacts add column if not exists house_only boolean not null default false;
update contacts set house_only = true where source = 'tracker';

-- Anything replied/verified through Rootfor's own threads is house knowledge too.
update contacts set house_only = true where last_replied_at is not null;

drop policy if exists "house read contacts" on contacts;
create policy "contacts read" on contacts for select using (
  is_house_user()
  or (not house_only and source in ('hunter','apollo'))
  or (source = 'manual' and found_by = auth.uid())
);

-- Tracker importer must never write anything but house-only rows.
create or replace function contacts_guard_provenance() returns trigger language plpgsql as $$
begin
  if new.source = 'tracker' then new.house_only := true; end if;
  if new.last_replied_at is not null then new.house_only := true; end if;
  return new;
end $$;
drop trigger if exists contacts_guard_provenance on contacts;
create trigger contacts_guard_provenance before insert or update on contacts for each row execute function contacts_guard_provenance();
