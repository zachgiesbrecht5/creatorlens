-- small base64 avatar kept at scan time (Instagram's CDN links expire)
alter table creators add column if not exists avatar_thumb text;
