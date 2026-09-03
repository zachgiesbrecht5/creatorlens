# Deploy checklist

Everything below is a click-through I cannot do for you (account creation, OAuth consent, secrets). Each step says what to copy where. Order matters.

## 1. Supabase (10 min)

1. supabase.com -> New project (region: us-east or ca-central). Save the DB password.
2. SQL Editor -> paste `supabase/migrations/0001_init.sql` -> Run. Should end with no errors.
3. Project Settings -> API: copy `URL`, `anon key`, `service_role key` into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Authentication -> Providers -> Google: enable. Leave this tab open; it shows the **Callback URL** you need in step 2.
5. Authentication -> URL Configuration: Site URL = your app URL; add `http://localhost:3000/**` and `https://<your-domain>/**` to Redirect URLs.
6. Database -> Replication: confirm `scan_jobs` is in the `supabase_realtime` publication (the migration adds it).

## 2. Google Cloud (15 min): one project does YouTube + Gmail + sign-in

1. console.cloud.google.com -> New project "CreatorLens".
2. APIs & Services -> Enable: **YouTube Data API v3**, **Gmail API**.
3. Credentials -> Create credentials -> **API key** -> restrict to YouTube Data API v3 -> copy to `YT_API_KEY`.
4. OAuth consent screen -> External -> app name, support email, your logo. Scopes: add `.../auth/gmail.compose`, `openid`, `email`, `profile`. Add your team as **Test users** (this is what lets the team use Gmail drafts before Google verifies the app).
5. Credentials -> Create credentials -> **OAuth client ID** -> Web application. Authorized redirect URIs: the Supabase Google callback URL from step 1.4. Copy Client ID / Secret into (a) Supabase Google provider settings and (b) `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (the app needs them to refresh Gmail tokens).
6. Later, for outside users: submit the consent screen for verification (needs a privacy policy URL and a 1-minute demo video of the Gmail draft flow). Until then, only Test users can grant the Gmail scope; everyone else can still scan.

## 3. Meta app (10 min): reuse "Rootfor Brand Scanner"

1. developers.facebook.com -> Rootfor Brand Scanner (App ID 937301792677790) -> Add product **Facebook Login for Business**.
2. Facebook Login -> Settings -> Valid OAuth Redirect URIs: `https://<your-domain>/api/ig/callback` and `http://localhost:3000/api/ig/callback`.
3. App settings -> Basic: copy App ID / App secret to `META_APP_ID` / `META_APP_SECRET`.
4. Seed the house token: in Supabase SQL editor run
   `insert into ig_connections (ig_user_id, ig_username, access_token, is_house) values ('17841401357087924', 'zach.gies', '<your never-expiring system-user token>', true);`
   That is the same token the sheet uses today. Every teammate who clicks Connect Instagram adds another.
5. App Review (only needed for people outside your Business): request `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management` with a screencast of the Connect flow. Teammates can be added under App roles -> Testers with no review.

## 4. Anthropic + Hunter (3 min)

- console.anthropic.com -> API key -> `ANTHROPIC_API_KEY`. Drafts cost well under a cent each.
- Optional: hunter.io API key -> `HUNTER_API_KEY` for contacts not already in your tracker (free tier: 25 lookups/month, paid from ~$49).

## 5. Seed from your sheets (5 min)

1. Google Cloud -> IAM -> Service accounts -> Create -> Keys -> JSON. Put the file contents in `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. Share BOTH sheets (Creator Outreach Engine `1U_rFq4-...` and the team tracker `16zwA7...`) with the service account email as Editor.
3. Sign in to the app once (creates your profile). In Supabase: `insert into orgs (name, owner_id) values ('Rootfor Group', '<your profile id>') returning id;` then `update profiles set org_id='<that id>', plan='admin' where id='<your profile id>';`
4. `TRACKER_SHEET_ID=16zwA7EvNqDQPo5XAoh-nRgsiHqSmdJm_7poES-rxuOg ENGINE_SHEET_ID=1U_rFq4-QETKS7B_mZ9SKUPasSt-mrgyIsz_-9128GyE ORG_ID=... IMPORT_USER_ID=... npm run import:tracker`
   Imports 5,597 outreach rows + contacts, 1,821 exclusions, and every Raw tab (~155 creators) so the app starts full, not empty.
5. Nightly `npm run sync:sheet` writes "App Partnerships" and "App Brand Wall" tabs back into the Engine sheet. Note the Engine sheet is currently over Drive quota; free space first or point `ENGINE_SHEET_ID` at a new sheet.

## 6. Hosting (10 min)

- Web: Vercel -> Import repo -> Root directory `apps/web` -> add every env var from `.env.example`. Set `NEXT_PUBLIC_APP_URL` to the Vercel URL.
- Worker: Railway (or Render/Fly) -> New service from repo -> Start command `npm run start -w apps/worker` -> same env vars (`SUPABASE_URL` = the NEXT_PUBLIC one). One instance is enough.
- Sheet sync: Railway cron `0 8 * * *` running `npm run sync:sheet`, or a GitHub Action.

## 7. Team

Have Victoria, Tristan, and Karli sign in with Google, then in Supabase: `update profiles set org_id='<org id>', plan='team' where email in (...)`. Each of them clicks Connect Instagram on Settings (adds capacity) and pastes their pitch style.

## Known limits (unchanged from the sheet)

- Instagram sees only posts the creator owns; brand-authored collabs and photo-tag credits are invisible to the API.
- Personal (non-Business) IG accounts return nothing.
- TikTok has no commercial API; log deals by hand (not built in this version).
- YouTube channel-name search costs 100 units; the search box prefers @handles and the shared database.
