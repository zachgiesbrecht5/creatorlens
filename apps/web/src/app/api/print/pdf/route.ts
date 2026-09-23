import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import { currentAccess, supabaseAdmin, canSeeCreator } from "@/lib/supabase";

export const runtime = "nodejs";

// A print as a PDF a manager can send to a brand: recurring sponsors, every
// disclosed sponsor with a clickable link to the post, and the most recent
// sponsored posts. Links are real PDF link annotations.
const sane = (s: string) => String(s || "").replace(/[^\x20-\x7E]/g, "").trim();
const fmtK = (n: number | null) => (!n ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const mon = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") || "youtube";
  const handle = req.nextUrl.searchParams.get("handle") || "";
  const { profile, admin: seesAll } = await currentAccess();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: c } = await admin.from("creators").select("id,platform,handle,display_name,followers,category,last_scanned_at").eq("platform", platform).ilike("handle", handle).maybeSingle();
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canSeeCreator(profile.id, seesAll, c))) return NextResponse.json({ error: "Unlock this print first" }, { status: 403 });
  const { data: wall } = await admin.from("brand_wall").select("brand_id,brand,category,deals,first_seen,last_seen,repeat_partner,content_url,best_label").eq("creator_id", c.id).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).order("last_seen", { ascending: false });
  const { data: recent } = await admin.from("partnerships").select("brand_id,content_url,content_title,published_at,brands(name)").eq("creator_id", c.id).neq("status", "rejected").not("content_url", "is", null).order("published_at", { ascending: false }).limit(8);
  const rows = (wall || []).filter((w) => w.best_label !== "Low");
  const repeats = rows.filter((w) => w.repeat_partner);
  const name = sane(c.display_name || `@${c.handle}`);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  let page = pdf.addPage([612, 792]);
  const M = 48; let y = 792 - M;
  const ink = rgb(0.043, 0.051, 0.07), muted = rgb(0.357, 0.392, 0.447), blue = rgb(0.184, 0.357, 1), green = rgb(0.055, 0.42, 0.27);
  const links: { page: typeof page; x: number; y: number; w: number; h: number; url: string }[] = [];
  const text = (t: string, x: number, size: number, f = font, color = ink) => { page.drawText(sane(t), { x, y, size, font: f, color }); };
  const link = (t: string, x: number, size: number, url: string) => { const w = font.widthOfTextAtSize(sane(t), size); page.drawText(sane(t), { x, y, size, font, color: blue }); page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.5, color: blue }); links.push({ page, x, y: y - 3, w, h: size + 4, url }); };
  const newPageIfNeeded = (need = 40) => { if (y < M + need) { page = pdf.addPage([612, 792]); y = 792 - M; } };
  const rule = () => { page.drawLine({ start: { x: M, y }, end: { x: 612 - M, y }, thickness: 0.5, color: rgb(0.81, 0.83, 0.85), dashArray: [2, 2] }); y -= 14; };

  // header
  text("SPONSORPRINT", M, 9, mono, muted); y -= 22;
  text(name, M, 24, bold); y -= 16;
  text(`${platform === "youtube" ? "YouTube" : "Instagram"} @${sane(c.handle)}  ·  ${fmtK(c.followers)} ${platform === "youtube" ? "subscribers" : "followers"}${c.category ? `  ·  ${sane(c.category)}` : ""}  ·  printed ${c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleDateString("en-US") : ""}`, M, 10, mono, muted); y -= 22;
  const totalDeals = rows.reduce((s, r) => s + Number(r.deals || 0), 0);
  text(`${rows.length} brands   ·   ${totalDeals} disclosed deals   ·   ${repeats.length} recurring`, M, 12, bold); y -= 18; rule();

  // recurring sponsors
  text("RECURRING SPONSORS", M, 9, mono, muted); y -= 16;
  if (!repeats.length) { text("None yet: no brand has booked this creator more than once in the window.", M, 10, font, muted); y -= 16; }
  for (const r of repeats) {
    newPageIfNeeded();
    text(sane(r.brand), M, 11, bold); text(`${r.deals} deals  ·  ${mon(r.first_seen)} to ${mon(r.last_seen)}`, M + 200, 10, mono, muted);
    if (r.content_url) link("latest post", 612 - M - 60, 10, r.content_url);
    y -= 16;
  }
  y -= 6; rule();

  // all sponsors
  text("ALL DISCLOSED SPONSORS", M, 9, mono, muted); y -= 16;
  text("brand", M, 8, mono, muted); text("category", M + 200, 8, mono, muted); text("deals", M + 320, 8, mono, muted); text("last", M + 370, 8, mono, muted); text("post", M + 440, 8, mono, muted); y -= 14;
  for (const r of rows) {
    newPageIfNeeded();
    text(sane(r.brand).slice(0, 34), M, 10, bold); text(sane(r.category || ""), M + 200, 9, font, muted); text(String(r.deals), M + 320, 10, mono); text(mon(r.last_seen), M + 370, 9, mono, muted);
    if (r.content_url) link("view post", M + 440, 9, r.content_url);
    y -= 15;
  }
  y -= 6; rule();

  // most recent sponsored posts
  text("MOST RECENT SPONSORED POSTS", M, 9, mono, muted); y -= 16;
  for (const p of (recent || []) as any[]) {
    newPageIfNeeded();
    const label = `${mon(p.published_at)}  ·  ${sane(p.brands?.name || "")}`;
    text(label, M, 10, bold); y -= 13;
    link(sane(p.content_title || p.content_url).slice(0, 90), M, 9, p.content_url); y -= 16;
  }
  y -= 4; rule();
  text("Public posts only, read through the official YouTube and Instagram APIs. Disclosed deals (#ad, #partner, paid partnership, sponsored by). Not a complete record of any brand's spending.", M, 7.5, font, muted);
  y -= 12; text("sponsorprint.com", M, 8, mono, green);

  // link annotations
  for (const l of links) {
    const annot = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [l.x, l.y, l.x + l.w, l.y + l.h], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(l.url) } });
    const existing = l.page.node.get(PDFName.of("Annots"));
    const arr = existing ? (l.page.node.lookup(PDFName.of("Annots")) as any) : pdf.context.obj([]);
    arr.push(pdf.context.register(annot));
    l.page.node.set(PDFName.of("Annots"), arr);
  }
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${sane(name).replace(/[^A-Za-z0-9]+/g, "-") || "print"}-sponsorprint.pdf"` } });
}
