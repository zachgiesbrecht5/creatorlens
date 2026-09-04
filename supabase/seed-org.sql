-- Run AFTER your first Google sign-in to the app (that creates your profile row).
-- 1) Create the org and make yourself admin:
with me as (select id from profiles where email = 'zach.giesbrecht@rootforgroup.com'),
     o as (insert into orgs (name, owner_id) select 'Rootfor Group', id from me returning id)
update profiles set org_id = (select id from o), plan = 'admin' where id = (select id from me);

-- 2) After teammates sign in once, attach them:
-- update profiles set org_id = (select id from orgs where name = 'Rootfor Group'), plan = 'team'
--  where email in ('victoria@rootforgroup.com','tristan@rootforgroup.com','karli@rootforgroup.com');

-- 3) Grab the ids you need for the import script:
-- select o.id as org_id, p.id as import_user_id from orgs o join profiles p on p.id = o.owner_id;
