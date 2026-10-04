import { PDFDocument, StandardFonts, rgb, PDFName, PDFString, pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath, type PDFPage, type PDFFont, type RGB, type PDFImage } from "pdf-lib";
import { readHook, hookMix, decodeEntities, type HookRead } from "@/lib/hook-read";


// The print as a document a manager sends to a brand or a creator: dark masthead,
// stat tiles, the 24-month sponsor map, what's performing (hook first), recurring
// sponsors, every disclosed deal with a live link. Letter size, Helvetica/Courier
// (standard fonts, no embedding), real link annotations.

const W = 612, H = 792, M = 44;
const INK = rgb(0.043, 0.051, 0.07), PAPER = rgb(0.984, 0.984, 0.98), MUTED = rgb(0.357, 0.392, 0.447), DIM = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.86, 0.875, 0.9), LINE2 = rgb(0.93, 0.94, 0.955), ACCENT = rgb(0.184, 0.357, 1), GREEN = rgb(0.055, 0.42, 0.27), PANEL = rgb(0.965, 0.968, 0.975), PURPLE = rgb(0.42, 0.22, 0.78), AMBER = rgb(0.72, 0.42, 0.02), AMBER_TXT = rgb(0.55, 0.32, 0.0);
const CAT: Record<string, [number, number, number]> = { Tech: [0.18, 0.36, 1], Food: [0.88, 0.48, 0.18], Fashion: [0.69, 0.21, 0.54], Home: [0.05, 0.42, 0.27], Beauty: [0.84, 0.27, 0.47], Business: [0.36, 0.39, 0.45], Travel: [0.12, 0.62, 0.81], Entertainment: [0.49, 0.23, 0.93], Wellness: [0.17, 0.71, 0.45], Fitness: [0.94, 0.27, 0.27], Sports: [0.96, 0.62, 0.04], Finance: [0.04, 0.05, 0.07], Auto: [0.22, 0.25, 0.32], Baby: [0.96, 0.45, 0.71], Health: [0.06, 0.73, 0.51], Lifestyle: [0.55, 0.36, 0.96], Pets: [0.63, 0.38, 0.03], Education: [0.05, 0.65, 0.91], Outdoors: [0.3, 0.49, 0.06], Gaming: [0.39, 0.4, 0.95], Coffee: [0.47, 0.21, 0.06], DIY: [0.71, 0.33, 0.04], Parenting: [0.96, 0.45, 0.71], Dad: [0.96, 0.45, 0.71] };
const catColor = (c: string | null) => { const v = c && CAT[c]; return v ? rgb(v[0], v[1], v[2]) : rgb(0.55, 0.58, 0.63); };

export const sane = (s: string) => decodeEntities(String(s || "")).replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").replace(/[^\x20-\x7E\xB7]/g, "").trim();
const fmtK = (n: number | null | undefined) => (!n ? "0" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const plural = (k: string) => { const s = String(k || "post"); return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith("s") ? "" : "s"); };
const mon = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "");

export async function renderPrint({ c, platform, wall, recent, months }: { c: any; platform: string; wall: any[]; recent: any[]; months: any[] }): Promise<Uint8Array> {
  const rows = (wall || []).filter((w) => w.best_label !== "Low");
  const repeats = rows.filter((w) => w.repeat_partner);
  const name = sane(c.display_name || `@${c.handle}`);
  const platformLabel = platform === "youtube" ? "YouTube" : "Instagram";
  const perf = (c as any).performance as any;

  // ── document scaffolding ──────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${name} · Sponsorprint`); pdf.setAuthor("Sponsorprint");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), mono = await pdf.embedFont(StandardFonts.Courier), oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const links: { page: PDFPage; x: number; y: number; w: number; h: number; url: string }[] = [];
  let page: PDFPage = undefined as unknown as PDFPage, y = 0, pageNo = 0;
  const newPage = (first = false) => {
    page = pdf.addPage([W, H]); pageNo++;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    if (!first) { page.drawText("SPONSORPRINT", { x: M, y: H - 30, size: 7.5, font: mono, color: DIM }); page.drawText(sane(name), { x: M + 90, y: H - 30, size: 7.5, font: mono, color: MUTED }); page.drawLine({ start: { x: M, y: H - 38 }, end: { x: W - M, y: H - 38 }, thickness: 0.5, color: LINE }); y = H - 58; }
  };
  const txt = (t: string, x: number, size: number, f: PDFFont = font, color: RGB = INK, yy = y) => page.drawText(sane(t), { x, y: yy, size, font: f, color });
  const wrap = (t: string, f: PDFFont, size: number, width: number) => { const words = sane(t).split(" "); const out: string[] = []; let cur = ""; for (const w of words) { const n = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(n, size) > width && cur) { out.push(cur); cur = w; } else cur = n; } if (cur) out.push(cur); return out; };
  const link = (t: string, x: number, size: number, url: string, yy = y, f: PDFFont = font, color: RGB = ACCENT) => { const s = sane(t); const w = f.widthOfTextAtSize(s, size); page.drawText(s, { x, y: yy, size, font: f, color }); page.drawLine({ start: { x, y: yy - 1.5 }, end: { x: x + w, y: yy - 1.5 }, thickness: 0.5, color }); links.push({ page, x, y: yy - 3, w, h: size + 4, url }); };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const section = (label: string, sub?: string) => { need(44); page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: LINE }); y -= 14; txt(label, M, 9, bold, INK); if (sub) txt(sub, M + bold.widthOfTextAtSize(label, 9) + 10, 8.5, font, MUTED); y -= 18; };
  const jpg = async (b64: string | null | undefined): Promise<PDFImage | null> => { if (!b64) return null; try { return await pdf.embedJpg(new Uint8Array(Buffer.from(b64, "base64"))); } catch { return null; } };
  const k = 0.5523;
  const circleClip = (cx: number, cy: number, r: number) => [moveTo(cx + r, cy), appendBezierCurve(cx + r, cy + r * k, cx + r * k, cy + r, cx, cy + r), appendBezierCurve(cx - r * k, cy + r, cx - r, cy + r * k, cx - r, cy), appendBezierCurve(cx - r, cy - r * k, cx - r * k, cy - r, cx, cy - r), appendBezierCurve(cx + r * k, cy - r, cx + r, cy - r * k, cx + r, cy), closePath(), clip(), endPath()];
  const roundClip = (x: number, yy: number, w: number, h: number, r: number) => [moveTo(x + r, yy), lineTo(x + w - r, yy), appendBezierCurve(x + w - r * (1 - k), yy, x + w, yy + r * (1 - k), x + w, yy + r), lineTo(x + w, yy + h - r), appendBezierCurve(x + w, yy + h - r * (1 - k), x + w - r * (1 - k), yy + h, x + w - r, yy + h), lineTo(x + r, yy + h), appendBezierCurve(x + r * (1 - k), yy + h, x, yy + h - r * (1 - k), x, yy + h - r), lineTo(x, yy + r), appendBezierCurve(x, yy + r * (1 - k), x + r * (1 - k), yy, x + r, yy), closePath(), clip(), endPath()];
  const drawCircleImage = (img: PDFImage, cx: number, cy: number, r: number) => { const sc = Math.max((2 * r) / img.width, (2 * r) / img.height); const w = img.width * sc, h = img.height * sc; page.pushOperators(pushGraphicsState(), ...circleClip(cx, cy, r)); page.drawImage(img, { x: cx - w / 2, y: cy - h / 2, width: w, height: h }); page.pushOperators(popGraphicsState()); };
  const drawCoverImage = (img: PDFImage, x: number, yy: number, w: number, h: number) => { const sc = Math.max(w / img.width, h / img.height); const iw = img.width * sc, ih = img.height * sc; page.pushOperators(pushGraphicsState(), ...roundClip(x, yy, w, h, 4)); page.drawImage(img, { x: x + (w - iw) / 2, y: yy + (h - ih) / 2, width: iw, height: ih }); page.pushOperators(popGraphicsState()); };
  const pill = (t: string, x: number, yy: number, color: RGB, size = 7) => { const w = mono.widthOfTextAtSize(t, size) + 10; page.drawRectangle({ x, y: yy - 3, width: w, height: size + 6, color: PANEL, borderColor: LINE, borderWidth: 0.4 }); page.drawCircle({ x: x + 6, y: yy + size / 2 - 0.5, size: 2.2, color }); page.drawText(t, { x: x + 11, y: yy, size, font: mono, color: MUTED }); return w; };

  // filled (primary) or outlined tag; returns its width
  const tag = (t: string, x: number, yy: number, color: RGB, filled: boolean) => { const size = 7; const w = bold.widthOfTextAtSize(t, size) + 10; page.drawRectangle({ x, y: yy - 3.5, width: w, height: size + 6, color: filled ? color : rgb(1, 1, 1), borderColor: color, borderWidth: 0.8 }); page.drawText(t, { x: x + 5, y: yy, size, font: bold, color: filled ? rgb(1, 1, 1) : color }); return w; };

  // ── masthead ──────────────────────────────────────────────────────────
  newPage(true);
  const mastH = 168;
  page.drawRectangle({ x: 0, y: H - mastH, width: W, height: mastH, color: INK });
  // receipt tear along the bottom edge of the masthead
  for (let x = 0; x < W; x += 9) page.drawRectangle({ x, y: H - mastH - 4, width: 4.5, height: 5, color: INK });
  const laneColor = catColor(c.category);
  page.drawRectangle({ x: 0, y: H - mastH - 4, width: W, height: 4, color: laneColor });
  const avatar = await jpg((c as any).avatar_thumb);
  const avX = M, avR = 30;
  if (avatar) { drawCircleImage(avatar, avX + avR, H - 86, avR); page.drawCircle({ x: avX + avR, y: H - 86, size: avR + 1.5, borderColor: laneColor, borderWidth: 2 }); }
  const textX = avatar ? M + 2 * avR + 16 : M;
  page.drawText("S P O N S O R P R I N T", { x: M, y: H - 34, size: 8, font: mono, color: rgb(0.6, 0.64, 0.72) });
  page.drawText(`print #${String(Math.abs(hash(c.id))).slice(0, 5)}`, { x: W - M - mono.widthOfTextAtSize("print #00000", 8), y: H - 34, size: 8, font: mono, color: rgb(0.6, 0.64, 0.72) });
  const totalDeals = rows.reduce((s, r) => s + Number(r.deals || 0), 0);
  const tiles: [string, string][] = [[String(rows.length), "brands"], [String(totalDeals), "disclosed deals"], [String(repeats.length), "recurring"]];
  const tw = 78, tx0 = W - M - tiles.length * tw - (tiles.length - 1) * 8, textW = tx0 - textX - 16;
  let nameSize = 30; while (nameSize > 14 && bold.widthOfTextAtSize(name, nameSize) > textW) nameSize -= 2;
  page.drawText(name, { x: textX, y: H - 78, size: nameSize, font: bold, color: rgb(1, 1, 1) });
  const meta = sane(`${platformLabel}  ·  @${c.handle}  ·  ${fmtK(c.followers)} ${platform === "youtube" ? "subs" : "followers"}`);
  page.drawText(wrap(meta, mono, 8.5, textW)[0] || "", { x: textX, y: H - 96, size: 8.5, font: mono, color: rgb(0.72, 0.75, 0.8) });
  if (c.category) { page.drawRectangle({ x: textX, y: H - 114, width: mono.widthOfTextAtSize(c.category.toUpperCase(), 7) + 12, height: 12, color: laneColor }); page.drawText(c.category.toUpperCase(), { x: textX + 6, y: H - 110.5, size: 7, font: mono, color: rgb(1, 1, 1) }); }
  if (c.bio) { const bl = wrap(c.bio, font, 8, textW - (c.category ? mono.widthOfTextAtSize(c.category.toUpperCase(), 7) + 20 : 0)); page.drawText(sane(bl[0] || "") + (bl.length > 1 ? " ..." : ""), { x: textX + (c.category ? mono.widthOfTextAtSize(c.category.toUpperCase(), 7) + 20 : 0), y: H - 111, size: 8, font, color: rgb(0.62, 0.65, 0.72) }); }
  // deals by category, as a stacked bar under the tiles
  const byCat = new Map<string, number>(); for (const r of rows) byCat.set(r.category || "Other", (byCat.get(r.category || "Other") || 0) + Number(r.deals || 0));
  const catList = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  if (totalDeals > 0) { let bx = tx0; const bw = tiles.length * tw + (tiles.length - 1) * 8; page.drawText("deals by category", { x: tx0, y: H - 148, size: 6.5, font: mono, color: rgb(0.5, 0.54, 0.62) }); for (const [ct, n] of catList) { const w = (n / totalDeals) * bw; page.drawRectangle({ x: bx, y: H - 160, width: Math.max(w - 1, 0.5), height: 7, color: catColor(ct === "Other" ? null : ct) }); bx += w; } }
  page.drawText(sane(`printed ${c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}  ·  public posts only`), { x: M, y: H - 148, size: 7.5, font: mono, color: rgb(0.5, 0.54, 0.62) });
  // stat tiles on the right of the masthead
  tiles.forEach(([v, l], i) => { const x = tx0 + i * (tw + 8); page.drawRectangle({ x, y: H - 134, width: tw, height: 56, color: rgb(0.1, 0.11, 0.14), borderColor: rgb(0.2, 0.22, 0.27), borderWidth: 0.6 }); page.drawRectangle({ x, y: H - 78, width: tw, height: 2, color: i === 2 ? rgb(0.35, 0.85, 0.55) : i === 1 ? ACCENT : laneColor }); page.drawText(v, { x: x + 10, y: H - 108, size: 22, font: bold, color: i === 2 && repeats.length ? rgb(0.35, 0.85, 0.55) : rgb(1, 1, 1) }); page.drawText(l, { x: x + 10, y: H - 124, size: 7, font: mono, color: rgb(0.6, 0.64, 0.72) }); });
  y = H - mastH - 28;

  // ── the short version: the 4-6 facts a reader should leave with, as sentences ──
  {
    const pts: string[] = [];
    pts.push(`${rows.length} brand${rows.length === 1 ? "" : "s"} paid for ${totalDeals} disclosed deal${totalDeals === 1 ? "" : "s"}.` + (repeats.length ? ` ${repeats.length} came back for more: ${repeats.slice(0, 3).map((r) => sane(r.brand)).join(", ")}${repeats.length > 3 ? " and others" : ""}.` : " None has booked twice yet."));
    const topCat = catList.find(([ct]) => ct !== "Other");
    if (topCat && totalDeals) pts.push(`Biggest category: ${topCat[0]}, ${topCat[1]} of ${totalDeals} deals.`);
    if (rows[0]?.last_seen) pts.push(`Most recent sponsor: ${sane(rows[0].brand)}, ${mon(rows[0].last_seen)}.`);
    const fm = (perf?.formats || []).filter((f: any) => f.count >= 3).sort((a: any, b: any) => b.avg - a.avg);
    if (fm.length >= 2 && fm[1].avg > 0) pts.push(`${plural(fm[0].kind)} average ${fmtK(fm[0].avg)} ${perf.metric_label}, ${(fm[0].avg / fm[1].avg).toFixed(1)}x ${plural(fm[1].kind).toLowerCase()}.`);
    if (perf?.top?.length) {
      const t0 = perf.top[0], h0 = readHook(t0, platform);
      pts.push(`Best post: ${fmtK(t0.metric)} ${perf.metric_label}${perf.median >= 1000 ? ` (${(t0.metric / perf.median).toFixed(0)}x median)` : ""}. The hook was ${h0.source === "said" ? "said out loud" : h0.source === "caption" ? "in the caption only" : "text on the video"}${h0.audio === "music" || h0.audio === "no-voice" ? ", with no talking" : ""}.`);
      const mix = hookMix(perf.top.slice(0, 6), platform); if (mix) pts.push(mix);
    }
    const bw = W - 2 * M - 28;
    const wrapped = pts.map((p) => wrap(p, font, 9.5, bw));
    const boxH = 30 + wrapped.reduce((a, l) => a + l.length * 12.5 + 3, 0);
    page.drawRectangle({ x: M, y: y - boxH + 10, width: W - 2 * M, height: boxH, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
    page.drawRectangle({ x: M, y: y - boxH + 10, width: 3, height: boxH, color: ACCENT });
    txt("THE SHORT VERSION", M + 14, 9, bold, INK); y -= 18;
    for (const lines of wrapped) {
      page.drawCircle({ x: M + 17, y: y + 3, size: 1.8, color: INK });
      for (const ln of lines) { txt(ln, M + 24, 9.5, font, INK); y -= 12.5; }
      y -= 3;
    }
    y -= 22;
  }

  // ── the map: brands × last 24 months ──────────────────────────────────
  const monthsBy = new Map<string, Map<string, number>>();
  for (const m of months || []) { const k = String(m.published_at).slice(0, 7); const e = monthsBy.get(m.brand_id) || monthsBy.set(m.brand_id, new Map()).get(m.brand_id)!; e.set(k, (e.get(k) || 0) + 1); }
  const now = new Date(); const cols: string[] = []; for (let i = 23; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); cols.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
  const mapRows = rows.filter((r) => [...(monthsBy.get(r.brand_id)?.keys() || [])].some((k) => cols.includes(k))).slice(0, 14);
  if (mapRows.length) {
    section("THE MAP", "last 24 months · one dot per month with a disclosed deal · ring = recurring partner");
    const labelW = 118, gx0 = M + labelW, gx1 = W - M, cw = (gx1 - gx0) / 24, rh = 14;
    need(mapRows.length * rh + 30);
    // month ticks: Jan and Jul
    cols.forEach((k, i) => { const mnum = Number(k.slice(5)); if (mnum === 1 || mnum === 7) { const x = gx0 + i * cw + cw / 2; page.drawLine({ start: { x, y: y + 4 }, end: { x, y: y - mapRows.length * rh + 4 }, thickness: 0.4, color: LINE2 }); page.drawText(mnum === 1 ? k.slice(0, 4) : `mid ${k.slice(0, 4)}`, { x: x - 10, y: y + 7, size: 6.5, font: mono, color: DIM }); } });
    y -= 6;
    for (const r of mapRows) {
      page.drawText(sane(r.brand).slice(0, 22), { x: M, y: y - 4, size: 8.5, font: bold, color: INK });
      page.drawLine({ start: { x: gx0, y: y - 1 }, end: { x: gx1, y: y - 1 }, thickness: 0.3, color: LINE2 });
      const mm = monthsBy.get(r.brand_id) || new Map();
      cols.forEach((k, i) => { const n = mm.get(k); if (!n) return; const x = gx0 + i * cw + cw / 2; const col = catColor(r.category); page.drawCircle({ x, y: y - 1, size: n > 2 ? 3.6 : n > 1 ? 3 : 2.4, color: col }); if (r.repeat_partner) page.drawCircle({ x, y: y - 1, size: 5, borderColor: col, borderWidth: 0.6 }); });
      y -= rh;
    }
    // legend
    const cats = [...new Set(mapRows.map((r) => r.category).filter(Boolean))].slice(0, 6) as string[];
    let lx = M; y -= 6; for (const ct of cats) { lx += pill(ct, lx, y, catColor(ct)) + 6; } y -= 16;
  }

  // ── what's performing ─────────────────────────────────────────────────
  // Each card answers, in reading order: how big (number, vs median), what the
  // viewer got first (one bold line, tagged SAID OUT LOUD / TEXT ON VIDEO /
  // CAPTION ONLY), then the other two channels in fixed rows with plain empty
  // states ("Nobody talks. Music only."), so nothing has to be reopened.
  if (perf?.top?.length) {
    const n6 = Math.min(6, perf.top.length);
    section("WHAT'S PERFORMING", `best ${n6} of ${perf.items} posts · median ${fmtK(perf.median)} ${perf.metric_label}`);
    txt("Bold line = what a viewer hears or sees first. The tag says where it came from; the rows below show the other channels.", M, 7.5, oblique, MUTED); y -= 16;
    const best = Math.max(...perf.top.slice(0, n6).map((t: any) => Number(t.metric) || 0), 1);
    const thumbs = await Promise.all(perf.top.slice(0, n6).map((t: any) => jpg(t.thumb)));
    const SRC: Record<string, RGB> = { said: ACCENT, "on-video": PURPLE, "on-cover": PURPLE, caption: MUTED };
    const leadKey = (h: HookRead) => (h.source === "said" ? "voice" : h.source === "caption" ? "caption" : "screen");
    for (let k = 0; k < n6; k++) {
      const t = perf.top[k];
      const h = readHook(t, platform);
      const th = thumbs[k];
      const thumbW = th ? 46 : 0;
      const numX = M + 12 + (th ? thumbW + 10 : 0);
      const colX = numX + 86, colW = W - M - 12 - colX;
      const leadLines = wrap(`"${h.lead}"`, bold, 11, colW).slice(0, 3);
      if (wrap(`"${h.lead}"`, bold, 11, colW).length > 3) leadLines[2] = leadLines[2].replace(/.{0,3}$/, "...");
      const rowsC = h.channels.filter((c) => c.key !== leadKey(h));
      const cardH = Math.max(th ? 72 : 60, 14 + 15 + leadLines.length * 13.5 + 4 + rowsC.length * 11.5 + 14);
      need(cardH + 8);
      const top = y + 4;
      page.drawRectangle({ x: M, y: top - cardH, width: W - 2 * M, height: cardH, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.5 });
      page.drawRectangle({ x: M, y: top - cardH, width: 3, height: cardH, color: t.sponsored ? GREEN : laneColor });
      if (th) drawCoverImage(th, M + 12, top - 10 - Math.min(cardH - 20, 82), thumbW, Math.min(cardH - 20, 82));
      // number column
      page.drawText(`#${k + 1}`, { x: numX, y: top - 14, size: 7.5, font: mono, color: MUTED });
      page.drawText(fmtK(t.metric), { x: numX, y: top - 32, size: 18, font: bold, color: INK });
      page.drawText(perf.metric_label, { x: numX, y: top - 43, size: 7.5, font, color: MUTED });
      const mult = perf.median >= 1000 ? `${(t.metric / perf.median).toFixed(1)}x median` : `#${k + 1} of ${perf.items}`;
      page.drawText(mult, { x: numX, y: top - 54, size: 8, font: bold, color: GREEN });
      page.drawRectangle({ x: numX, y: top - 61, width: 70, height: 3, color: LINE2 });
      page.drawRectangle({ x: numX, y: top - 61, width: Math.max(2, 70 * (Number(t.metric) / best)), height: 3, color: t.sponsored ? GREEN : laneColor });
      // tags row: where the hook came from, what the audio is, then date/format
      let cy = top - 14, tx = colX;
      tx += tag(h.sourceLabel, tx, cy, SRC[h.source], true) + 5;
      if (h.audio !== "voice" && h.audioLabel) tx += tag(h.audioLabel, tx, cy, h.audio === "unread" ? MUTED : AMBER, false) + 5;
      const meta = `${mon(t.published_at)} · ${t.kind}${t.sponsored ? " · SPONSORED" : ""}`;
      page.drawText(meta, { x: W - M - 12 - font.widthOfTextAtSize(meta, 7.5), y: cy, size: 7.5, font, color: t.sponsored ? GREEN : MUTED });
      cy -= 17;
      for (const ln of leadLines) { page.drawText(sane(ln), { x: colX, y: cy, size: 11, font: bold, color: INK }); cy -= 13.5; }
      cy -= 3;
      for (const c of rowsC) {
        page.drawText(c.label, { x: colX, y: cy, size: 7, font: mono, color: MUTED });
        const body = c.text ? `"${c.text}"` : c.empty || "";
        const f = c.text ? font : oblique, col = c.text ? INK : (c.key === "voice" && (h.audio === "music" || h.audio === "no-voice" || h.audio === "silent") ? AMBER_TXT : MUTED);
        const bw = colW - 62 - (c === rowsC[rowsC.length - 1] ? 50 : 0);
        const ls = wrap(body, f, 8.5, bw);
        page.drawText(sane(ls[0] || "") + (ls.length > 1 ? " ..." : ""), { x: colX + 58, y: cy, size: 8.5, font: f, color: col });
        cy -= 11.5;
      }
      link("open post", W - M - 12 - font.widthOfTextAtSize("open post", 8), 8, t.url, top - cardH + 8);
      y = top - cardH - 10;
    }
    y -= 6;
    const fm = (perf.formats || []).filter((f: any) => f.count >= 2).sort((a: any, b: any) => b.avg - a.avg);
    if (fm.length) { txt("By format", M, 8, bold, INK); txt(fm.map((f: any) => `${plural(f.kind)} ${fmtK(f.avg)} avg (${f.count} posts)`).join("     "), M + 70, 8.5, font, INK); y -= 13; }
    const hooks = (perf.hooks || []).filter((h: any) => h.hook !== "Other").slice(0, 4);
    if (hooks.length) { txt("Caption openers", M, 8, bold, INK); txt(hooks.map((h: any) => `${h.hook} ${fmtK(h.avg)} avg (${h.count} posts)`).join("     "), M + 70, 8.5, font, INK); y -= 13; }
    y -= 8;
  }

  // ── recurring sponsors ────────────────────────────────────────────────
  section("RECURRING SPONSORS", repeats.length ? "booked more than once · a budget line, not a one-off" : undefined);
  if (!repeats.length) { txt("None yet: no brand has booked this creator more than once in the window.", M, 9, font, MUTED); y -= 16; }
  for (const r of repeats) {
    need(22);
    page.drawCircle({ x: M + 4, y: y + 3, size: 3, color: catColor(r.category) });
    txt(sane(r.brand), M + 14, 10.5, bold);
    txt(`${r.deals} deals  ·  ${mon(r.first_seen)} to ${mon(r.last_seen)}`, M + 190, 8, mono, MUTED);
    if (r.content_url) link("latest post", W - M - font.widthOfTextAtSize("latest post", 8), 8, r.content_url);
    y -= 17;
  }
  y -= 4;

  // ── all disclosed sponsors ────────────────────────────────────────────
  section("ALL DISCLOSED SPONSORS", `${rows.length} brands · ${totalDeals} deals · newest first${rows.some((r) => /\(\?\)/.test(r.brand)) ? " · (?) = brand guessed from the post, verify" : ""}`);
  const cx = { brand: M, cat: M + 215, deals: M + 335, last: M + 390, post: W - M - 40 };
  txt("brand", cx.brand, 6.5, mono, DIM); txt("category", cx.cat, 6.5, mono, DIM); txt("deals", cx.deals, 6.5, mono, DIM); txt("last", cx.last, 6.5, mono, DIM); txt("post", cx.post, 6.5, mono, DIM); y -= 12;
  rows.forEach((r, i) => {
    need(18);
    if (i % 2 === 0) page.drawRectangle({ x: M - 4, y: y - 4, width: W - 2 * M + 8, height: 15, color: rgb(0.975, 0.977, 0.982) });
    page.drawRectangle({ x: M - 4, y: y - 4, width: 2.5, height: 15, color: catColor(r.category) });
    txt(sane(r.brand).slice(0, 36), cx.brand + 4, 9.5, bold);
    if (r.category) { page.drawCircle({ x: cx.cat + 3, y: y + 3, size: 2.2, color: catColor(r.category) }); txt(sane(r.category), cx.cat + 9, 8, font, MUTED); }
    const maxDeals = Math.max(...rows.map((x) => Number(x.deals) || 0), 1);
    txt(String(r.deals), cx.deals, 9, mono); page.drawRectangle({ x: cx.deals + 18, y: y + 1, width: Math.max(2, 28 * (Number(r.deals) / maxDeals)), height: 5, color: catColor(r.category) });
    txt(mon(r.last_seen), cx.last, 8, mono, MUTED);
    if (r.content_url) link("view", cx.post, 8, r.content_url);
    y -= 15;
  });
  y -= 8;

  // ── most recent sponsored posts ───────────────────────────────────────
  if (recent?.length) {
    section("MOST RECENT SPONSORED POSTS");
    for (const p of recent as any[]) {
      need(26);
      txt(`${mon(p.published_at)}  ·  ${sane(p.brands?.name || "")}`, M, 8, mono, MUTED); y -= 11;
      link(sane(p.content_title || p.content_url).slice(0, 100), M, 9, p.content_url); y -= 15;
    }
  }

  // ── footers ───────────────────────────────────────────────────────────
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: LINE });
    pg.drawText("Public posts only, read through the official YouTube and Instagram APIs. Disclosed deals (#ad, #partner, paid partnership, sponsored by). Not a complete record of any brand's spending.", { x: M, y: M - 18, size: 6.2, font, color: DIM });
    pg.drawText("sponsorprint.com", { x: M, y: M - 28, size: 7, font: mono, color: GREEN });
    pg.drawText(`${i + 1} / ${pages.length}`, { x: W - M - mono.widthOfTextAtSize(`${i + 1} / ${pages.length}`, 7), y: M - 28, size: 7, font: mono, color: DIM });
  });
  for (const l of links) {
    const annot = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [l.x, l.y, l.x + l.w, l.y + l.h], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(l.url) } });
    const existing = l.page.node.get(PDFName.of("Annots"));
    const arr = existing ? (l.page.node.lookup(PDFName.of("Annots")) as any) : pdf.context.obj([]);
    arr.push(pdf.context.register(annot)); l.page.node.set(PDFName.of("Annots"), arr);
  }
  return pdf.save();
}

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
