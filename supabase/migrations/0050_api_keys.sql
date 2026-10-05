-- Personal read-only API keys (for skills, scripts, Claude connectors).
alter table profiles add column if not exists api_key text unique;
alter table profiles add column if not exists api_key_created_at timestamptz;
