-- Every opening line we've transcribed, fingerprinted, so a transcript that repeats across
-- creators is recognised as a trending sound rather than the creator speaking.
create table if not exists heard_lines (
  key text not null,                 -- first 8 words, lowercased, punctuation stripped
  creator_id uuid not null references creators(id) on delete cascade,
  url text not null,
  text text,
  created_at timestamptz not null default now(),
  primary key (key, url)
);
create index if not exists heard_lines_key on heard_lines (key);
alter table heard_lines enable row level security;

-- Lines a manager marked "not them talking" on a print; the worker treats these as sounds everywhere.
create table if not exists known_sounds (
  key text primary key,
  text text,
  marked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table known_sounds enable row level security;
