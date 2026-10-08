-- Instagram Login (Meta's "Instagram API with Instagram login"): creators connect with their Instagram
-- username and password, no Facebook Page or business portfolio involved. Those tokens talk to
-- graph.instagram.com and expire after 60 days (refreshable), so the connection records which host it
-- speaks to and when the token runs out.
alter table ig_connections add column if not exists api_host text not null default 'facebook';   -- facebook | instagram
alter table ig_connections add column if not exists token_expires_at timestamptz;
alter table ig_connections add column if not exists scopes text;
