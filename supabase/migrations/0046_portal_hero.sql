-- Creator home hero: follower history for 14/30-day growth, and the manager's positioning note.
alter table performance_snapshots add column if not exists followers bigint;
alter table roster_creators add column if not exists thesis text;      -- "where we're taking you" (manager writes, creator sees)
