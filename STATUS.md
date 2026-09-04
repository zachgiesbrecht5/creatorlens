# Setup status (Sep 3, 2026)

## Done
- Supabase project "Rootfor Internal" (ulzrgkkytkvrwldzwwas): migration applied, URL + publishable + secret key in apps/web/.env.local
- Supabase custom domain auth.rootforgroup.com active (Pro + $10 add-on). App + worker use https://auth.rootforgroup.com as SUPABASE_URL; Google OAuth redirect https://auth.rootforgroup.com/auth/v1/callback added.
- Google Cloud project "CreatorLens" (creatorlens-507522): YouTube key exists ("API key 1"), OAuth client "CreatorLens web (Supabase auth)" created with the Supabase callback, Client ID + secret in .env.local, Google provider enabled in Supabase with the Client ID
- Google Sheets API enabled; service account creatorlens-sheets@creatorlens-507522.iam.gserviceaccount.com created (no key yet)
- Meta app Rootfor Brand Scanner: Facebook Login for Business product present, redirect URI http://localhost:3000/api/ig/callback saved; META_APP_ID in .env.local

## You (one click each)
1. Supabase > Auth > Providers > Google: paste the client secret (in .env.local as GOOGLE_CLIENT_SECRET), Save.
2. Supabase > Auth > URL Configuration: Site URL + add http://localhost:3000/** and https://<vercel-domain>/** to Redirect URLs.
3. Google Cloud > Credentials > API key 1 > Show key -> YT_API_KEY in .env.local.
4. Meta > App settings > Basic > App secret > Show (password prompt) -> META_APP_SECRET in .env.local.
5. Meta > Facebook Login for Business > Settings: add https://<vercel-domain>/api/ig/callback once you have the domain.
6. console.anthropic.com > API keys > Create -> ANTHROPIC_API_KEY.
7. Supabase SQL editor: run supabase/seed-house-token.sql with the IG_ACCESS_TOKEN from Apps Script Script Properties.
8. Share both sheets with creatorlens-sheets@creatorlens-507522.iam.gserviceaccount.com as Editor (Engine sheet is link-view only, which is enough to import but not to write back).
9. Google Cloud > IAM > Service accounts > creatorlens-sheets > Keys > Add key > JSON -> file contents into GOOGLE_SERVICE_ACCOUNT_JSON (only where you run the import/sync scripts).
10. Push the repo to GitHub, then Vercel (root apps/web) + Railway (worker) with the env vars from .env.local; set NEXT_PUBLIC_APP_URL to the Vercel URL.
11. Sign in once, run supabase/seed-org.sql, then `npm run import:tracker`.

## Later / optional
- Google OAuth consent verification (privacy policy URL + 1-min demo video) so people outside your Test users can grant the Gmail scope.
- Meta: public_profile advanced access needs Business Verification; App Review for instagram_basic etc. only for users outside your Business. Teammates: App roles > Testers.
- Hunter.io key for contacts not in the tracker.
