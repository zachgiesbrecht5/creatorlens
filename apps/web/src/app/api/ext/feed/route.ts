import { type NextRequest } from "next/server";
import { supabaseAdmin, unlockedCreatorIds } from "@/lib/supabase";
import { profileFromFeedToken, brandRows, findCreator, printUrl, TYPE_LABEL, type ExtCreator } from "@/lib/ext";

// GET /api/ext/feed?t=<feed token>[&all=1]
// CSV of every creator pulled with the YouTube extension, one row per creator x brand.
// Built for Google Sheets: =IMPORTDATA("https://sponsorprint.com/api/ext/feed?t=…")
// keeps a tab in step with the extension (Sheets re-reads the link about once an hour).
// all=1 lists every print this user has opened, not only the ones pulled from YouTube.
// Each row carries a Type: Sponsored, Gifted, or Affiliate or code. low=1 also lists "Mention only"
// rows (a bare link or hashtag, no deal language); off by default.

export const dynamic = "force-dynamic";
const MAX_ROWS = 5000;
const COLS = "id,platform,handle,external_id,display_name,followers,avatar_url,category,last_scanned_at";
const HEAD = ["Creator", "Handle", "Platform", "Subscribers", "Lane", "Brand", "Type", "Brand category", "Deals", "Confidence", "First deal", "Last deal", "Repeat partner", "Evidence video", "Evidence link", "Brand website", "Print", "Pulled", "Last printed"];

// A cell that starts like a formula would run inside the sheet: neutralise it.
const cell = (v: unknown) => { let s = v == null ? "" : String(v).replace(/[\r\n\t]+/g, " ").trim(); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : "");
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
const text = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const profile = await profileFromFeedToken(q.get("t") || "");
  if (!profile) return text(csv([["This Sponsorprint feed link is no longer valid. Copy a fresh one from sponsorprint.com/extension"]]), 401);
  const admin = supabaseAdmin();
  const pulled = new Map<string, string>();   // lowercased handle or channel id -> when it was pulled
  let creators: ExtCreator[] = [];

  if (q.get("all") === "1") {
    const ids = await unlockedCreatorIds(profile.id);
    for (let i = 0; i < ids.length; i += 200) { const { data } = await admin.from("creators").select(COLS).in("id", ids.slice(i, i + 200)); creators.push(...((data || []) as ExtCreator[])); }
  } else {
    const { data: ev } = await admin.from("events").select("props,created_at").eq("user_id", profile.id).eq("name", "ext_print").order("created_at", { ascending: false }).limit(2000);
    const original = new Map<string, string>();   // lowercased -> as stored on the event
    for (const e of ev || []) { const raw = String((e.props as any)?.handle || ""); const h = raw.toLowerCase(); if (h && !pulled.has(h)) { pulled.set(h, e.created_at); original.set(h, raw); } }
    const refs = [...original.values()].slice(0, 600);
    if (refs.length) {
      const ucs = refs.filter((r) => /^UC[A-Za-z0-9_-]{20,}$/.test(r));
      const [a, b] = await Promise.all([
        admin.from("creators").select(COLS).eq("platform", "youtube").in("handle", refs),
        ucs.length ? admin.from("creators").select(COLS).eq("platform", "youtube").in("external_id", ucs) : Promise.resolve({ data: [] as any[] }),
      ]);
      const byId = new Map<string, ExtCreator>();
      for (const c of [...(a.data || []), ...(b.data || [])] as ExtCreator[]) byId.set(c.id, c);
      // creators.handle keeps YouTube's own casing: look up the few that missed an exact match one by one
      const hit = new Set([...byId.values()].flatMap((c) => [c.handle.toLowerCase(), String(c.external_id || "").toLowerCase()]));
      const missed = refs.filter((r) => !hit.has(r.toLowerCase())).slice(0, 40);
      for (const c of await Promise.all(missed.map((r) => findCreator("youtube", r)))) if (c) byId.set(c.id, c);
      creators = [...byId.values()];
    }
  }

  const when = (c: ExtCreator) => pulled.get(c.handle.toLowerCase()) || pulled.get(String(c.external_id || "").toLowerCase()) || c.last_scanned_at || "";
  creators = creators.filter((c) => c.last_scanned_at).sort((a, b) => String(when(b)).localeCompare(String(when(a))));
  const walls = await brandRows(creators, q.get("low") === "1");
  const rows: unknown[][] = [HEAD];
  for (const c of creators) {
    const base = [c.display_name || c.handle, `@${c.handle}`, c.platform === "youtube" ? "YouTube" : "Instagram", c.followers ?? "", c.category || ""];
    const tail = [printUrl(c), day(when(c)), day(c.last_scanned_at)];
    const brands = walls.get(c.id) || [];
    if (!brands.length) rows.push([...base, "(no deals found)", "", "", "", "", "", "", "", "", "", "", ...tail]);
    for (const b of brands) {
      rows.push([...base, b.brand, TYPE_LABEL[b.type], b.category || "", b.deals, b.confidence || "", day(b.first_seen), day(b.last_seen), b.repeat_partner ? "Yes" : "", b.evidence_title || "", b.evidence_url || "", b.website || "", ...tail]);
      if (rows.length > MAX_ROWS) break;
    }
    if (rows.length > MAX_ROWS) break;
  }
  return text(csv(rows));
}
