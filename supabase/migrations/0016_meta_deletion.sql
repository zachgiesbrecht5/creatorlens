-- Meta App Review needs deauthorize + data deletion callbacks; they identify
-- the person by Facebook user id, so store it on each connection.
alter table ig_connections add column if not exists fb_user_id text;
create index if not exists ig_connections_fb_user on ig_connections (fb_user_id);
