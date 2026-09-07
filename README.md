# Sponsorprint

Scan any creator, see every brand they have worked with, hover for the contact, click for a pitch draft in your own Gmail. Every scan anyone runs lands in one shared database, so the second person to look up a creator pays nothing.

This is the Creator Outreach Engine (Google Sheets + Apps Script) rebuilt as a multi-user web app. The detection logic is a line-for-line port of `Code.gs` (YouTube, methods 1-7) and `Instagram.gs` (igDetect v7), verified by a differential test against the original scripts.

## Layout

```
packages/engine     pure detection + API clients (TypeScript, 20 tests incl. parity vs Apps Script)
apps/web            Next.js 15 app: search, brand wall, contacts, drafting, settings, queue
apps/worker         scan worker: polls scan_jobs, runs the engine, writes the pool
supabase/           schema + RLS + credit functions (one migration)
scripts/            import-tracker (seed from your sheets), sync-sheet (push results back)
legacy-apps-script/ the original .gs files, kept for reference and the parity test
```

## How the API problem is solved

Users never see an API key.

- YouTube runs on ONE house key. A channel scan costs ~25 quota units (playlistItems + videos, no search). 10k units/day = ~400 scans; the worker stops at `YT_DAILY_BUDGET` and defers the rest to tomorrow. File Google's quota extension form once you pass that.
- Instagram runs on ONE Meta app. Every user who clicks "Connect Instagram" adds their token to a pool, and Meta's rate limits scale with connected users. The worker round-robins healthy tokens and cools down any that hit a limit.
- Gmail is the user's own Google sign-in (scope `gmail.compose`). Drafts only; the app cannot send.
- Cache: a creator scanned in the last 14 days is free for everyone. A creator already queued by anyone is piggybacked, no charge.

## Trial

New users get 5 scans + 3 drafts (set in `handle_new_user()`), no card. Referral link on Settings: both sides get 10 scans. Cached creators do not consume credits. Plans `team`/`pro`/`admin` are unlimited (set `profiles.plan` by hand for the team; Stripe can be added later).

## Run locally

```
cp apps/web/.env.example apps/web/.env.local   # fill in
npm install
npm test                                        # engine tests
npm run dev:web                                 # http://localhost:3000
npm run dev:worker                              # in another terminal, same env vars
```

See DEPLOY.md for the one-time setup (about 45 minutes of clicking).
