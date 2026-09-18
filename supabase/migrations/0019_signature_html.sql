-- The user's real Gmail signature (HTML), imported through the Gmail API when
-- they connect Gmail, so drafts look exactly like their normal emails.
alter table profiles add column if not exists signature_html text;
alter table profiles add column if not exists signature_imported_at timestamptz;
