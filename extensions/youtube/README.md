# Sponsorprint for YouTube

A button on every YouTube channel and video page. It shows whether Sponsorprint already has a
print for that creator, and one click pulls it. Nothing is scanned until you click.

## Install (unpacked)
1. Open `chrome://extensions` and switch on Developer mode (top right).
2. Click **Load unpacked** and choose this folder (`extensions/youtube`).
3. Open https://sponsorprint.com/extension and press **Connect extension**.

## Send pulls to a Google Sheet
On https://sponsorprint.com/extension (or in the extension popup) copy the sheet formula and paste
it into cell A1 of an empty tab. Every creator pulled with the extension lands there, one row per
brand. Google re-reads the link about once an hour. Add `&all=1` to the link to list every print
you have opened, not only the ones pulled from YouTube.

## How it talks to Sponsorprint
- `GET /api/ext/print?handle=` on each channel or video page: database lookup only, no YouTube quota.
- `POST /api/ext/print` on click: same rules as the site (prints from the last 14 days are free and instant).
- The key lives in the background worker; YouTube pages never see it.
