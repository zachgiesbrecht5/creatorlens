-- Full transcripts: every reel of an Instagram creator, start to finish (the hook pass only
-- hears the first six seconds of the top six). A job names a handle; the worker pages the
-- creator's media, sends each reel's whole audio track to speech-to-text, and files one row
-- per reel here. Admin-only (service role; no client policies).

create table if not exists transcript_jobs (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  max_posts int not null default 500,
  total int,                     -- reels found
  done int not null default 0,   -- reels filed this run
  heard int not null default 0,  -- of those, reels with talking
  error text,
  requested_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists transcript_jobs_status on transcript_jobs (status, created_at);

create table if not exists post_transcripts (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  url text not null unique,
  published_at timestamptz,
  caption text,
  likes int,
  comments int,
  seconds numeric,
  audio text not null check (audio in ('voice','music','silent','nofile','unread')),
  text text,                     -- what is said (voice) or sung (music); null otherwise
  confidence numeric,
  created_at timestamptz not null default now()
);
create index if not exists post_transcripts_handle on post_transcripts (handle, published_at desc);

alter table transcript_jobs enable row level security;
alter table post_transcripts enable row level security;
