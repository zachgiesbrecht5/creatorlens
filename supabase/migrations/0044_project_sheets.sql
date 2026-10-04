-- Per-creator project tracker sheet, synced hourly into projects.
alter table roster_creators add column if not exists project_sheet_id text;
alter table roster_creators add column if not exists project_sheet_synced_at timestamptz;
alter table roster_creators add column if not exists project_sheet_note text;
alter table projects add column if not exists brand_rate numeric;      -- gross (manager-only)
create unique index if not exists projects_sheet_key on projects (roster_creator_id, source_ref) where source = 'sheet';
