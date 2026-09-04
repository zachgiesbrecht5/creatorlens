-- Paste into Supabase SQL editor (Rootfor Internal project). Replace the placeholder
-- with the IG_ACCESS_TOKEN value from Apps Script > Project Settings > Script Properties
-- (the never-expiring system-user token the sheet already uses).
insert into ig_connections (ig_user_id, ig_username, access_token, is_house)
values ('17841401357087924', 'zach.gies', 'PASTE_IG_ACCESS_TOKEN_HERE', true)
on conflict (ig_user_id) do update set access_token = excluded.access_token, is_house = true, healthy = true, cooldown_until = null;
