import { PDFDocument, rgb, PDFName, PDFString, pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath, setCharacterSpacing, type PDFPage, type PDFFont, type RGB, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readHook, decodeEntities, type HookRead } from "@/lib/hook-read";
import { FONTS } from "@/lib/print-fonts";

// The print as a document a manager sends to the creator it is about, to show
// "we looked at your partnerships properly". Everything is written to them (you / your).
// Two pages by default, both ink, built to be skimmed from an email:
//   1. the cover: their own top posts as a photo strip, one hero number, deals by
//      quarter, and every brand they've worked with as a wall of names;
//   2. the pitch: brands we'd pitch them to, gaps in their lane, first moves, sign-off.
// With full=true the evidence follows on paper pages: what we noticed, the 24-month
// map, top posts with hooks, format and opener averages, and every partnership linked.

const W = 612, H = 792, M = 40, FOOT = 62;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const INK = hex("#0B0D12"), PAPER = hex("#FBFBFA"), WHITE = rgb(1, 1, 1), BODY = hex("#3A4150"), MUTED = hex("#667085"), DIM = hex("#8B93A1");
const LINE = hex("#DDE1E8"), LINE2 = hex("#ECEEF2"), ACCENT = hex("#2F5BFF"), GREEN = hex("#0E7A4E"), AMBER = hex("#9A5B00"), AMBER_BG = hex("#FFF6E5");
const BLUE_ON_INK = hex("#8FA8FF"), ON_INK = hex("#B4BBC8"), ON_INK_DIM = hex("#7C8494"), INK_RULE = hex("#252A35");
const CAT: Record<string, string> = { Tech: "#2F5BFF", Food: "#E07A2E", Fashion: "#B0368A", Home: "#0E7A4E", Beauty: "#D64578", Business: "#5C6373", Travel: "#1F9ECF", Entertainment: "#7D3BED", Wellness: "#2BB573", Fitness: "#F04545", Sports: "#F59E0A", Finance: "#3D4656", Auto: "#384052", Baby: "#F573B5", Health: "#0FBA82", Lifestyle: "#8C5CF5", Pets: "#A16108", Education: "#0DA6E8", Outdoors: "#4D7D0F", Gaming: "#6366F2", Coffee: "#78360F", DIY: "#B5540A", Parenting: "#F573B5", Dad: "#F573B5" };
const NO_CAT = hex("#9AA1AE");
/** A category colour lifted toward white so it stays readable on the ink pages. */
const onInk = (c: RGB) => rgb(c.red + (1 - c.red) * 0.42, c.green + (1 - c.green) * 0.42, c.blue + (1 - c.blue) * 0.42);
const catColor = (c: string | null | undefined) => (c && CAT[c] ? hex(CAT[c]) : NO_CAT);

/** Text the embedded fonts can draw: Latin with accents and real punctuation. Emoji and other scripts are dropped. */
export const sane = (s: string) => decodeEntities(String(s || "")).replace(/[^\x20-\x7E -ſ–—‘’“”•…↗]/g, " ").replace(/\s+/g, " ").replace(/\s+([!?.,;:])/g, "$1").trim();
const monoSafe = (s: string) => sane(s).replace(/[^\x20-\x7E -ÿ]/g, "");
const fmtK = (n: number | null | undefined) => { const v = Number(n || 0); return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}K` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(v)); };
const plural = (k: string) => { const s = String(k || "post"); return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith("s") ? "" : "s"); };
const mon = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "");
const listAnd = (a: string[]) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const isGiveaway = (t: any) => /give\s?-?away/i.test(`${t?.hook || ""} ${t?.title || ""} ${t?.label || ""} ${t?.key || ""}`);
const stripGiveawayClosed = (s: string) => s.replace(/^\s*\(*\s*giveaway\s+closed\s*\)*[\s:!-]*/i, "");

export type LaneRead = { peers: number; leads: { brand: string; category: string | null; n: number }[]; gaps: { category: string; share: number; examples: string[] }[] };

/**
 * What the creator's lane is doing that they are not: brands booking several creators in the same lane
 * (in categories this creator already works in) that have never booked them, and brand categories a
 * good share of the lane has a partner in while this creator has none. Pure, so the route just feeds it rows.
 */
export function laneRead(lane: any[], creatorId: string, mine: Set<string>, myCats: Set<string>, sinceIso: string): LaneRead | null {
  const rows = (lane || []).filter((w) => w.creator_id !== creatorId);
  const peers = new Set(rows.map((w) => w.creator_id)).size;
  if (peers < 8) return null;
  const brands = new Map<string, { brand: string; category: string | null; creators: Set<string>; deals: number; last: string }>();
  const catCreators = new Map<string, Set<string>>();
  for (const w of rows) {
    if (w.category) (catCreators.get(w.category) || catCreators.set(w.category, new Set()).get(w.category)!).add(w.creator_id);
    if (mine.has(w.brand_id)) continue;
    const e = brands.get(w.brand_id) || brands.set(w.brand_id, { brand: String(w.brand || ""), category: w.category || null, creators: new Set(), deals: 0, last: "" }).get(w.brand_id)!;
    if (String(w.last_seen || "") < sinceIso) continue; // only bookings inside the window count, so "this year" is true
    e.creators.add(w.creator_id); e.deals += Number(w.deals || 0); if (String(w.last_seen || "") > e.last) e.last = String(w.last_seen || "");
  }
  const active = [...brands.values()].filter((b) => b.last >= sinceIso && b.creators.size >= 2 && sane(b.brand)).sort((a, b) => b.creators.size - a.creators.size || b.deals - a.deals);
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pick = (list: typeof active, n: number) => { const out: typeof active = []; for (const b of list) { const k = norm(b.brand); if (out.some((o) => norm(o.brand).startsWith(k) || k.startsWith(norm(o.brand)))) continue; out.push(b); if (out.length === n) break; } return out; };
  const leads = pick(active.filter((b) => b.category && myCats.has(b.category)), 6).map((b) => ({ brand: b.brand, category: b.category, n: b.creators.size }));
  const gaps = [...catCreators.entries()].filter(([ct, set]) => !myCats.has(ct) && set.size / peers >= 0.15).sort((a, b) => b[1].size - a[1].size).slice(0, 3)
    .map(([ct, set]) => ({ category: ct, share: set.size / peers, examples: pick(active.filter((b) => b.category === ct), 3).map((b) => b.brand) }));
  return leads.length || gaps.length ? { peers, leads, gaps } : null;
}

type Opt = { f?: PDFFont; size?: number; color?: RGB; track?: number; align?: "left" | "right" | "center" };

export async function renderPrint({ c, platform, wall, months, by, lane, full }: { c: any; platform: string; wall: any[]; recent?: any[]; months: any[]; by?: { name?: string | null; org?: string | null; signoff?: string | null }; lane?: (LaneRead & { counts?: boolean }) | null; full?: boolean }): Promise<Uint8Array> {
  const rows = (wall || []).filter((w) => w.best_label !== "Low");
  const repeats = rows.filter((w) => w.repeat_partner);
  const name = sane(c.display_name || `@${c.handle}`) || `@${monoSafe(c.handle)}`;
  const platformLabel = platform === "youtube" ? "YouTube" : "Instagram";
  const perf = (c as any).performance as any;
  const totalDeals = rows.reduce((s, r) => s + Number(r.deals || 0), 0);
  const laneColor = catColor(c.category);

  // ── document scaffolding ──────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${name} · Sponsorprint`); pdf.setAuthor("Sponsorprint");
  const emb = (k: keyof typeof FONTS) => pdf.embedFont(Buffer.from(FONTS[k], "base64"), { subset: true });
  const [font, semi, bold, display, mono, monoMed] = await Promise.all([emb("regular"), emb("semi"), emb("bold"), emb("display"), emb("mono"), emb("monoMed")]);
  const isMono = (f: PDFFont) => f === mono || f === monoMed;
  const links: { page: PDFPage; x: number; y: number; w: number; h: number; url: string }[] = [];
  let page: PDFPage = undefined as unknown as PDFPage, y = 0;

  const prep = (s: string, f: PDFFont) => (isMono(f) ? monoSafe(s) : sane(s));
  const tw = (s: string, f: PDFFont, size: number, track = 0) => { const t = prep(s, f); return f.widthOfTextAtSize(t, size) + track * t.length; };
  /** Draw one line. Returns its width. */
  const text = (s: string, x: number, yy: number, o: Opt = {}) => {
    const f = o.f || font, size = o.size || 9, track = o.track || 0, t = prep(s, f);
    if (!t) return 0;
    const w = f.widthOfTextAtSize(t, size) + track * t.length;
    const dx = o.align === "right" ? x - w + track : o.align === "center" ? x - (w - track) / 2 : x;
    if (track) page.pushOperators(setCharacterSpacing(track));
    page.drawText(t, { x: dx, y: yy, size, font: f, color: o.color || INK });
    if (track) page.pushOperators(setCharacterSpacing(0));
    return w;
  };
  const wrap = (s: string, f: PDFFont, size: number, width: number, maxLines = 99) => {
    const words = prep(s, f).split(" "); const out: string[] = []; let cur = "";
    for (const w of words) { const n = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(n, size) > width && cur) { out.push(cur); cur = w; } else cur = n; }
    if (cur) out.push(cur);
    if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = clipTo(out[maxLines - 1] + " …", f, size, width, true); }
    return out.map((l) => (f.widthOfTextAtSize(l, size) > width ? clipTo(l, f, size, width) : l));
  };
  /** Cut a single line to a width, ending in an ellipsis. */
  function clipTo(s: string, f: PDFFont, size: number, width: number, force = false) {
    let t = prep(s, f); if (!force && f.widthOfTextAtSize(t, size) <= width) return t;
    t = t.replace(/\s*…$/, "");
    while (t.length > 1 && f.widthOfTextAtSize(t + "…", size) > width) t = t.slice(0, -1);
    return t.replace(/[\s,.;:!-]+$/, "") + "…";
  }
  const link = (s: string, x: number, yy: number, url: string, o: Opt = {}) => {
    const f = o.f || semi, size = o.size || 8, w = tw(s, f, size), x0 = o.align === "right" ? x - w : x;
    text(s, x0, yy, { f, size, color: o.color || ACCENT });
    if (url) links.push({ page, x: x0 - 2, y: yy - 3, w: w + 4, h: size + 5, url });
    return w;
  };
  const rule = (x0: number, x1: number, yy: number, color: RGB = LINE, thickness = 0.5) => page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness, color });
  /** Rounded rectangle; (x, top) is the top-left corner. */
  const rrect = (x: number, top: number, w: number, h: number, r: number, o: { color?: RGB; borderColor?: RGB; borderWidth?: number }) => {
    const p = `M ${r},0 H ${w - r} Q ${w},0 ${w},${r} V ${h - r} Q ${w},${h} ${w - r},${h} H ${r} Q 0,${h} 0,${h - r} V ${r} Q 0,0 ${r},0 Z`;
    page.drawSvgPath(p, { x, y: top, color: o.color, borderColor: o.borderColor, borderWidth: o.borderWidth ?? (o.borderColor ? 0.5 : 0) });
  };
  const label = (s: string, x: number, yy: number, color: RGB = MUTED, o: Opt = {}) => text(s.toUpperCase(), x, yy, { f: monoMed, size: 6.5, track: 1.1, color, ...o });

  const newPage = (first = false) => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    if (!first) {
      label("Sponsorprint", M, H - 32, DIM);
      text(name, W - M, H - 32.5, { f: semi, size: 8, color: BODY, align: "right" });
      rule(M, W - M, H - 42);
      y = H - 66;
    }
  };
  const need = (h: number) => { if (y - h < FOOT) { newPage(); return true; } return false; };
  const section = (title: string, sub?: string, minBody = 40) => {
    need(26 + minBody);
    rule(M, W - M, y + 12);
    const w = label(title, M, y - 4, INK, { size: 7.5, track: 1.4 });
    if (sub) text(clipTo(sub, font, 8, W - 2 * M - w - 14), M + w + 12, y - 4, { size: 8, color: MUTED });
    y -= 26;
  };

  const jpg = async (b64: string | null | undefined): Promise<PDFImage | null> => { if (!b64) return null; try { return await pdf.embedJpg(new Uint8Array(Buffer.from(b64, "base64"))); } catch { return null; } };
  const k = 0.5523;
  const circleClip = (cx: number, cy: number, r: number) => [moveTo(cx + r, cy), appendBezierCurve(cx + r, cy + r * k, cx + r * k, cy + r, cx, cy + r), appendBezierCurve(cx - r * k, cy + r, cx - r, cy + r * k, cx - r, cy), appendBezierCurve(cx - r, cy - r * k, cx - r * k, cy - r, cx, cy - r), appendBezierCurve(cx + r * k, cy - r, cx + r, cy - r * k, cx + r, cy), closePath(), clip(), endPath()];
  const roundClip = (x: number, yy: number, w: number, h: number, r: number) => [moveTo(x + r, yy), lineTo(x + w - r, yy), appendBezierCurve(x + w - r * (1 - k), yy, x + w, yy + r * (1 - k), x + w, yy + r), lineTo(x + w, yy + h - r), appendBezierCurve(x + w, yy + h - r * (1 - k), x + w - r * (1 - k), yy + h, x + w - r, yy + h), lineTo(x + r, yy + h), appendBezierCurve(x + r * (1 - k), yy + h, x, yy + h - r * (1 - k), x, yy + h - r), lineTo(x, yy + r), appendBezierCurve(x, yy + r * (1 - k), x + r * (1 - k), yy, x + r, yy), closePath(), clip(), endPath()];
  const drawCircleImage = (img: PDFImage, cx: number, cy: number, r: number) => { const sc = Math.max((2 * r) / img.width, (2 * r) / img.height); const w = img.width * sc, h = img.height * sc; page.pushOperators(pushGraphicsState(), ...circleClip(cx, cy, r)); page.drawImage(img, { x: cx - w / 2, y: cy - h / 2, width: w, height: h }); page.pushOperators(popGraphicsState()); };
  const drawCoverImage = (img: PDFImage, x: number, yy: number, w: number, h: number, r = 4) => { const sc = Math.max(w / img.width, h / img.height); const iw = img.width * sc, ih = img.height * sc; page.pushOperators(pushGraphicsState(), ...roundClip(x, yy, w, h, r)); page.drawImage(img, { x: x + (w - iw) / 2, y: yy + (h - ih) / 2, width: iw, height: ih }); page.pushOperators(popGraphicsState()); };
  /** Small rounded chip; returns its width. */
  const chip = (s: string, x: number, yy: number, fg: RGB, bg: RGB | null, border?: RGB) => {
    const size = 5.6, track = 0.55, t = s.toUpperCase(), w = tw(t, monoMed, size, track) + 7.5;
    rrect(x, yy + 7.6, w, 10.4, 2.2, { color: bg || undefined, borderColor: border, borderWidth: border ? 0.5 : 0 });
    text(t, x + 4, yy, { f: monoMed, size, track, color: fg });
    return w;
  };

  // ── numbers the cover needs ───────────────────────────────────────────
  const rowIds = new Set(rows.map((r) => r.brand_id));
  const dated = (months || []).filter((m) => rowIds.has(m.brand_id) && m.published_at).map((m) => ({ brand_id: m.brand_id as string, ym: String(m.published_at).slice(0, 7) }));
  const now = new Date(), nowY = now.getUTCFullYear(), nowM = now.getUTCMonth();
  const cols: string[] = []; for (let i = 23; i >= 0; i--) { const d = new Date(Date.UTC(nowY, nowM - i, 1)); cols.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); }
  const qOf = (ym: string) => `${ym.slice(0, 4)}-Q${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;
  const quarters: { key: string; q: string; yr: string; n: number; current: boolean }[] = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(Date.UTC(nowY, Math.floor(nowM / 3) * 3 - i * 3, 1)); const key = qOf(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`); quarters.push({ key, q: key.slice(5), yr: key.slice(2, 4), n: 0, current: i === 0 }); }
  for (const d of dated) { const q = quarters.find((x) => x.key === qOf(d.ym)); if (q) q.n++; }
  const last12 = dated.filter((d) => cols.slice(12).includes(d.ym)).length, prev12 = dated.filter((d) => cols.slice(0, 12).includes(d.ym)).length;
  const byCat = new Map<string, number>(); for (const r of rows) byCat.set(r.category || "Other", (byCat.get(r.category || "Other") || 0) + Number(r.deals || 0));
  const catList = [...byCat.entries()].sort((a, b) => (a[0] === "Other" ? 1 : b[0] === "Other" ? -1 : b[1] - a[1]));
  const topCat = catList.find(([ct]) => ct !== "Other");
  const n6 = Math.min(6, perf?.top?.length || 0);
  const top6: any[] = (perf?.top || []).slice(0, n6);
  const giveaways = top6.filter(isGiveaway).length;
  const metricLabel = String(perf?.metric_label || (platform === "youtube" ? "views" : "engagement"));

  // ── cover: one ink page ────────────────────────────────────────────────
  const inkPages = new Set<PDFPage>();
  const TILE = hex("#141924");
  const thumbs = await Promise.all(top6.map((t: any) => jpg(t.thumb)));
  newPage(true); inkPages.add(page);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INK });
  label("Sponsorprint", M, H - 34, ON_INK, { size: 7.5, track: 3.2 });
  const printedOn = c.last_scanned_at ? new Date(c.last_scanned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const printNo = `Print #${String(Math.abs(hash(String(c.id)))).slice(0, 5)}${printedOn ? `  ·  ${printedOn}` : ""}`;
  const byLine = [sane(by?.name || ""), sane(by?.org || "")].filter(Boolean).join(", ");
  label(byLine ? `Prepared for you by ${byLine}` : "Prepared for you", W - M, H - 34, ON_INK_DIM, { align: "right" });

  const avatar = await jpg((c as any).avatar_thumb);
  const avR = 21, avCy = H - 78;
  if (avatar) { drawCircleImage(avatar, M + avR, avCy, avR); page.drawCircle({ x: M + avR, y: avCy, size: avR + 1.6, borderColor: laneColor, borderWidth: 1.6 }); }
  const textX = avatar ? M + 2 * avR + 14 : M, textW = W - M - textX;
  let nameSize = 25; while (nameSize > 13 && display.widthOfTextAtSize(name, nameSize) > textW) nameSize -= 1;
  text(clipTo(name, display, nameSize, textW), textX, H - 76, { f: display, size: nameSize, color: WHITE });
  const metaBits = [platformLabel, `@${c.handle}`, `${fmtK(c.followers)} ${platform === "youtube" ? "subscribers" : "followers"}`, c.category].filter(Boolean) as string[];
  text(clipTo(metaBits.join("  ·  "), mono, 7.8, textW), textX, H - 91, { f: mono, size: 7.8, color: ON_INK });
  y = H - 126;

  // their own best posts, as big as the page allows: the first thing they recognise
  const strip = top6.map((t: any, i: number) => ({ t, img: thumbs[i] })).filter((s) => s.img).slice(0, 4);
  if (strip.length >= 3) {
    const g = 8, pw = (W - 2 * M - g * (strip.length - 1)) / strip.length, ph = Math.min(168, pw * 1.22);
    label(`Your biggest posts · ${metricLabel}`, M, y, ON_INK_DIM); y -= 10;
    strip.forEach((sp, i) => {
      const x = M + i * (pw + g);
      drawCoverImage(sp.img!, x, y - ph, pw, ph, 6);
      if (sp.t.url) links.push({ page, x, y: y - ph, w: pw, h: ph, url: sp.t.url });
      const mw = text(fmtK(sp.t.metric), x, y - ph - 15, { f: semi, size: 10.5, color: WHITE });
      if (perf.median >= 100) text(clipTo(`${(sp.t.metric / perf.median).toFixed(1)}x your usual`, font, 7.8, pw - mw - 6), x + mw + 5, y - ph - 15, { size: 7.8, color: ON_INK_DIM });
    });
    y -= ph + 15 + 26;
  }

  if (!rows.length) {
    y -= 40;
    for (const ln of wrap("We didn't find a disclosed partnership in your public posts yet.", display, 28, W - 2 * M, 3)) { text(ln, M, y, { f: display, size: 28, color: WHITE }); y -= 34; }
    y -= 6;
    for (const ln of wrap("That is a clean slate, not a problem. The first brand deal is the one we'd help you land.", font, 12, 420, 3)) { text(ln, M, y, { size: 12, color: ON_INK }); y -= 17; }
  } else {
    // hero: one number, then the facts that qualify it
    const baseY = y - 96;
    const big = String(rows.length);
    let bigSize = 124; while (bigSize > 60 && display.widthOfTextAtSize(big, bigSize) > 170) bigSize -= 4;
    page.pushOperators(setCharacterSpacing(-bigSize * 0.035));
    page.drawText(big, { x: M - bigSize * 0.045, y: baseY, size: bigSize, font: display, color: WHITE });
    page.pushOperators(setCharacterSpacing(0));
    const bigW = display.widthOfTextAtSize(big, bigSize) - bigSize * 0.035 * big.length;
    const chartW = 196, chartX = W - M - chartW;
    const stX = M + bigW + 16, stW = chartX - 18 - stX;
    const heroLines = wrap(rows.length === 1 ? "brand has partnered with you" : "brands have partnered with you", semi, 14.5, stW, 2);
    heroLines.forEach((ln, i) => text(ln, stX, baseY + 74 - i * 17.5, { f: semi, size: 14.5, color: WHITE }));
    const facts = [
      totalDeals ? `across ${totalDeals} sponsored post${totalDeals === 1 ? "" : "s"}` : "",
      repeats.length ? `${repeats.length} came back for more` : "",
      rows[0]?.last_seen ? `Latest: ${sane(rows[0].brand)}, ${mon(rows[0].last_seen)}` : "",
    ].filter(Boolean);
    facts.forEach((s, i) => text(clipTo(s, font, 10, stW), stX, baseY + 74 - heroLines.length * 17.5 - 3 - i * 15, { size: 10, color: /came back/.test(s) ? hex("#6EE7A8") : ON_INK }));

    // deals by quarter, last eight quarters
    if (dated.length) {
      const maxQ = Math.max(...quarters.map((q) => q.n), 1), bh = 60, by = baseY + 13, gap = 6, bw = (chartW - gap * 7) / 8;
      label("Your brand deals by quarter", chartX, by + bh + 20, ON_INK_DIM);
      quarters.forEach((q, i) => {
        const x = chartX + i * (bw + gap), h = q.n ? Math.max(3, (q.n / maxQ) * bh) : 1.2;
        page.drawRectangle({ x, y: by, width: bw, height: h, color: q.n ? (q.current ? ACCENT : hex("#E6E9EF")) : INK_RULE });
        if (q.n) text(String(q.n), x + bw / 2, by + h + 4, { f: semi, size: 8, color: q.current ? BLUE_ON_INK : WHITE, align: "center" });
        text(q.q, x + bw / 2, by - 10, { f: mono, size: 6, color: q.current ? WHITE : ON_INK_DIM, align: "center" });
        if (q.q === "Q1" || i === 0) text(`'${q.yr}`, x + bw / 2, by - 18, { f: mono, size: 6, color: ON_INK_DIM, align: "center" });
      });
    }
    y = baseY - 46;

    // every brand they've worked with, as a wall of names: the ones that came back are bright and counted
    rule(M, W - M, y + 18, INK_RULE, 0.8);
    const lw0 = label("Who you've worked with", M, y, BLUE_ON_INK, { size: 7.5, track: 1.4 });
    if (repeats.length) text("bright names came back for more", M + lw0 + 12, y, { size: 8, color: ON_INK_DIM });
    y -= 14;
    const ordered = [...[...repeats].sort((a, b) => Number(b.deals) - Number(a.deals)), ...rows.filter((r) => !r.repeat_partner)];
    const avail = y - 62, fullW = W - 2 * M;
    const flow = (sz: number, items: any[]) => {
      const lines: { r: any; x: number; nw: number }[][] = [[]]; let x = 0;
      for (const r of items) {
        const nw = display.widthOfTextAtSize(sane(r.brand), sz), cw = r.repeat_partner ? semi.widthOfTextAtSize(` ×${r.deals}`, sz * 0.6) : 0, w = sz * 0.75 + nw + cw;
        if (x + w > fullW && lines[lines.length - 1].length) { lines.push([]); x = 0; }
        lines[lines.length - 1].push({ r, x, nw }); x += w + sz * 1.05;
      }
      return lines;
    };
    let sz = 23, shown = ordered, lines = flow(sz, shown);
    while (sz > 9.5 && lines.length * sz * 1.62 > avail) { sz -= 0.5; lines = flow(sz, shown); }
    while (lines.length * sz * 1.62 > avail && shown.length > 4) { shown = shown.slice(0, -1); lines = flow(sz, shown); }
    lines.forEach((ln, i) => {
      const yy = y - sz * 1.05 - i * sz * 1.62;
      for (const it of ln) {
        const x = M + it.x;
        page.drawCircle({ x: x + sz * 0.2, y: yy + sz * 0.34, size: sz * 0.16, color: catColor(it.r.category) });
        text(sane(it.r.brand), x + sz * 0.75, yy, { f: display, size: sz, color: it.r.repeat_partner ? WHITE : hex("#8E96A6") });
        if (it.r.repeat_partner) text(` ×${it.r.deals}`, x + sz * 0.75 + it.nw, yy + sz * 0.3, { f: semi, size: sz * 0.6, color: BLUE_ON_INK });
      }
    });
    if (shown.length < ordered.length) text(`and ${ordered.length - shown.length} more`, W - M, 56, { size: 8, color: ON_INK_DIM, align: "right" });
  }

  // ── the pitch: where we'd take them next, on its own ink page ──────────
  if (rows.length) {
    const yearAgo = `${cols[12]}-01`;
    const recentOnce = rows.filter((r) => !r.repeat_partner && String(r.last_seen || "") >= yearAgo).slice(0, 4);
    const quiet = [...rows].filter((r) => r.last_seen && String(r.last_seen) < yearAgo).sort((a, b) => Number(b.deals) - Number(a.deals)).slice(0, 3);
    const names = (rs: any[]) => listAnd(rs.map((r) => sane(r.brand)));
    const moves: [string, string][] = [];
    if (repeats.length) { const rs = [...repeats].sort((a, b) => Number(b.deals) - Number(a.deals)).slice(0, 3); moves.push(["Turn your repeats into longer deals", `${names(rs)} already ${rs.length === 1 ? "rebooks" : "rebook"} you. That is the case for a multi-month or ambassador deal instead of one post at a time.`]); }
    if (recentOnce.length) moves.push(["Go back for the second deal", `${names(recentOnce)} ${recentOnce.length === 1 ? "has" : "have"} worked with you in the last year${recentOnce.some((r) => Number(r.deals) > 1) ? "" : ", once each"}. They already said yes, so a follow-up is the easiest deal to win.`]);
    if (quiet.length) moves.push(["Reopen the quiet ones", `It has been over a year since ${names(quiet)}. We'd go back with your current numbers and a fresh idea.`]);
    if (topCat && moves.length < 3) moves.push([`Go deeper in ${topCat[0].toLowerCase()}`, `${topCat[1]} of your ${totalDeals} deals are in ${topCat[0].toLowerCase()}. Brands next door to the ones on your list can already see you fit.`]);
    const laneName = String(c.category || "").toLowerCase();
    const leads = (lane?.leads || []).slice(0, 6), gaps = (lane?.gaps || []).slice(0, 3), pitchLed = leads.length >= 2;
    page = pdf.addPage([W, H]); inkPages.add(page);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INK });
    label("Sponsorprint", M, H - 34, ON_INK, { size: 7.5, track: 3.2 });
    text(name, W - M, H - 34.5, { f: semi, size: 8, color: ON_INK, align: "right" });
    y = H - 90;
    label("Where we'd take you next", M, y, BLUE_ON_INK, { size: 7.5, track: 1.4 }); y -= 40;
    const headline = pitchLed ? `${["Two", "Three", "Four", "Five", "Six"][leads.length - 2]} brands we'd pitch you to first.` : moves.length === 1 ? "The first move we'd make with you." : `${["Two", "Three"][Math.min(moves.length, 3) - 2]} moves we'd make with you first.`;
    for (const ln of wrap(headline, display, 30, W - 2 * M, 2)) { page.pushOperators(setCharacterSpacing(-0.6)); page.drawText(ln, { x: M, y, size: 30, font: display, color: WHITE }); page.pushOperators(setCharacterSpacing(0)); y -= 35; }

    if (pitchLed) {
      y += 13;
      text(`They're booking ${laneName} creators like you right now, and they aren't on your list yet.`, M, y, { size: 10.5, color: ON_INK }); y -= 22;
      const g = 10, cw3 = (W - 2 * M - 2 * g) / 3, th = lane?.counts ? 68 : 56;
      leads.forEach((b, i) => {
        const x = M + (i % 3) * (cw3 + g), top = y - Math.floor(i / 3) * (th + g), nm = sane(b.brand);
        rrect(x, top, cw3, th, 7, { color: TILE, borderColor: INK_RULE, borderWidth: 0.8 });
        page.drawRectangle({ x: x + 14, y: top - 19.6, width: 4.5, height: 4.5, color: catColor(b.category) });
        label(sane(b.category || "Brand"), x + 23, top - 19.5, ON_INK_DIM, { size: 6.2, track: 0.9 });
        let ns = 19; while (ns > 11 && display.widthOfTextAtSize(nm, ns) > cw3 - 28) ns -= 0.5;
        text(clipTo(nm, display, ns, cw3 - 28), x + 14, top - 42, { f: display, size: ns, color: WHITE });
        if (lane?.counts) text(`${b.n} ${laneName} creators this year`, x + 14, top - 56, { size: 7.8, color: ON_INK_DIM });
      });
      y -= Math.ceil(leads.length / 3) * (th + g) + 26;
    } else y -= 10;

    // categories the lane has partners in and they don't
    if (gaps.length) {
      rule(M, W - M, y + 20, INK_RULE, 0.8);
      const lw = label("Gaps we'd fill", M, y, BLUE_ON_INK, { size: 7.5, track: 1.4 });
      text("categories your lane gets paid in that aren't on your list yet", M + lw + 12, y, { size: 8, color: ON_INK_DIM });
      y -= 30;
      const g = 20, cw3 = (W - 2 * M - 2 * g) / 3; let maxL = 0;
      gaps.forEach((gp, i) => {
        const x = M + i * (cw3 + g), ct = sane(gp.category), pct = `${Math.round(gp.share * 100)}%`;
        const pw = text(pct, x, y - 6, { f: display, size: 24, color: onInk(catColor(gp.category)) });
        text(ct, x + pw + 8, y - 6, { f: display, size: 13.5, color: WHITE });
        const body = `of ${laneName} creators we track have ${/^[aeiou]/i.test(ct) ? "an" : "a"} ${ct.toLowerCase()} partner.${gp.examples.length ? ` Think ${listAnd(gp.examples.map(sane))}.` : ""}`;
        const ls = wrap(body, font, 8.6, cw3, 3); maxL = Math.max(maxL, ls.length);
        ls.forEach((ln, j) => text(ln, x, y - 22 - j * 12, { size: 8.6, color: ON_INK }));
      });
      y -= 22 + maxL * 12 + 22;
    }

    // first moves: roomy when they lead the page, compact under the pitch
    const big = !pitchLed && !gaps.length, mv = moves.slice(0, 3);
    if (pitchLed || gaps.length) { rule(M, W - M, y + 20, INK_RULE, 0.8); label(mv.length === 1 ? "The first move we'd make" : "The first moves we'd make", M, y, BLUE_ON_INK, { size: 7.5, track: 1.4 }); y -= 26; }
    else y -= 8;
    const hs = big ? 14.5 : 12, bs = big ? 9.8 : 9, lh = bs * 1.4, floor = 138;
    for (let i = 0; i < mv.length; i++) {
      const [h, b] = mv[i], ls = wrap(b, font, bs, 470, big ? 3 : 2), need = hs + 5 + ls.length * lh;
      if (y - need < floor) break;
      if (big) rule(M, W - M, y + 22, INK_RULE, 0.8);
      text(`0${i + 1}`, M, y, { f: monoMed, size: 8.5, color: BLUE_ON_INK });
      text(clipTo(h, display, hs, W - 2 * M - 40), M + 40, y - 1, { f: display, size: hs, color: WHITE });
      ls.forEach((ln, j) => text(ln, M + 40, y - hs - 5 - j * lh, { size: bs, color: ON_INK }));
      y -= need + (big ? 30 : 13);
    }
    const signoff = sane(by?.signoff || "").replace(/[,.\s]+$/, "");
    rule(M, W - M, 136, INK_RULE, 0.8);
    if (signoff && signoff.length <= 40) text(signoff.charAt(0).toUpperCase() + signoff.slice(1) + ",", M, 108, { f: display, size: 20, color: WHITE });
    if (byLine) text(byLine, signoff ? M : M, signoff ? 90 : 104, { f: semi, size: 10, color: ON_INK });
    text(`Prepared for ${name}${printedOn ? ` on ${printedOn}` : ""}`, M, byLine ? (signoff ? 76 : 90) : 104, { size: 9, color: ON_INK_DIM });
  }

  // ── the evidence, on paper, only in the full print ────────────────────
  if (full) newPage();

  // ── the read: a headline and three short notes ────────────────────────
  if (full) {
    label("What we noticed", M, y, ACCENT, { size: 7.5, track: 1.4 }); y -= 25;
    const lead = !rows.length ? "We didn't find a disclosed partnership in your public posts yet."
      : (repeats.length ? `${repeats.length} of your ${rows.length} brand partners came back for more.` : rows.length === 1 ? "One brand has partnered with you so far." : `${rows.length} brands have partnered with you, each of them once so far.`)
        + (topCat && totalDeals && rows.length > 1 ? ` ${topCat[0]} is your strongest lane, with ${topCat[1]} of ${totalDeals} deals.` : "");
    for (const ln of wrap(lead, display, 18.5, W - 2 * M, 2)) { text(ln, M, y, { f: display, size: 18.5, color: INK }); y -= 23; }
    y -= 9;

    const notes: [string, string][] = [];
    if (repeats.length) {
      const rs = [...repeats].sort((a, b) => Number(b.deals) - Number(a.deals));
      notes.push(["Who keeps coming back", `${listAnd(rs.slice(0, 5).map((r) => `${sane(r.brand)} (${r.deals})`))}${rs.length > 5 ? `, plus ${rs.length - 5} more` : ""}. Repeat bookings are the strongest proof you can show a new brand.`]);
    } else if (rows.length) notes.push(["Who keeps coming back", "Nobody twice yet. Every brand here already said yes once, which makes a second deal the easiest one to win."]);
    if (dated.length) {
      const busiest = [...quarters].reverse().sort((a, b) => b.n - a.n)[0];
      notes.push(["Your momentum", `${last12} deal${last12 === 1 ? "" : "s"} in the last 12 months${last12 > prev12 ? `, up from ${prev12} the year before` : last12 === prev12 ? ", level with the year before" : `, and ${prev12} the year before`}.${busiest?.n ? ` Your busiest quarter was ${busiest.q} 20${busiest.yr}, with ${busiest.n}.` : ""}`]);
    }
    if (perf?.top?.length) {
      const minCount = Math.max(3, Math.round(Number(perf.items || 0) * 0.05));
      const fm = (perf.formats || []).filter((f: any) => f.count >= minCount).sort((a: any, b: any) => b.avg - a.avg);
      let s = fm.length >= 2 && fm[1].avg > 0 ? `Your ${plural(fm[0].kind).toLowerCase()} average ${fmtK(fm[0].avg)} ${metricLabel}, ${(fm[0].avg / fm[1].avg).toFixed(1)}x your ${plural(fm[1].kind).toLowerCase()}.` : `Your typical post gets ${fmtK(perf.median)} ${metricLabel}.`;
      if (giveaways * 2 >= n6 && giveaways >= 2) s += ` Giveaways are your biggest posts: ${giveaways === n6 ? `all ${n6}` : `${giveaways}`} of your top ${n6}.`;
      else { const t0 = perf.top[0]; s += ` Your best post reached ${fmtK(t0.metric)}${perf.median >= 100 ? `, ${(t0.metric / perf.median).toFixed(1)}x your usual` : ""}.`; }
      notes.push(["What your audience responds to", s]);
    }
    if (notes.length) {
      const gap = 22, cw = (W - 2 * M - gap * (notes.length - 1)) / notes.length; let maxLines = 0;
      notes.forEach(([h, b], i) => {
        const x = M + i * (cw + gap);
        rule(x, x + cw, y + 13, INK, 0.9);
        text(h, x, y, { f: semi, size: 9, color: INK });
        const ls = wrap(b, font, 9, cw, 6); maxLines = Math.max(maxLines, ls.length);
        ls.forEach((ln, j) => text(ln, x, y - 15 - j * 12.6, { size: 9, color: BODY }));
      });
      y -= 15 + maxLines * 12.6 + 20;
    }
  }

  // ── the map: brands × last 24 months ──────────────────────────────────
  const monthsBy = new Map<string, Map<string, number>>();
  for (const d of dated) { const e = monthsBy.get(d.brand_id) || monthsBy.set(d.brand_id, new Map()).get(d.brand_id)!; e.set(d.ym, (e.get(d.ym) || 0) + 1); }
  const mapAll = rows.filter((r) => [...(monthsBy.get(r.brand_id)?.keys() || [])].some((kk) => cols.includes(kk)));
  if (full && mapAll.length) {
    const rh = 14.2, overhead = 26 + 16 + 22;
    let fit = Math.floor((y - FOOT - overhead) / rh);
    if (fit < Math.min(6, mapAll.length)) { newPage(); fit = Math.floor((y - FOOT - overhead) / rh); }
    const mapRows = mapAll.slice(0, Math.min(16, fit));
    section("Your last 24 months", `each dot is a month you posted a partnership${mapRows.length < mapAll.length ? ` · your latest ${mapRows.length} of ${mapAll.length} brands` : ""}`, mapRows.length * rh + 30);
    const labelW = 112, gx0 = M + labelW, gx1 = W - M, cw = (gx1 - gx0) / 24, top = y + 2, bottom = top - 12 - mapRows.length * rh;
    cols.forEach((kk, i) => {
      const mnum = Number(kk.slice(5)), x = gx0 + i * cw;
      if (mnum === 1) { page.drawLine({ start: { x, y: top + 6 }, end: { x, y: bottom + 4 }, thickness: 0.6, color: LINE }); text(kk.slice(0, 4), x + 4, top, { f: monoMed, size: 6.5, color: BODY }); }
      else if (mnum === 4 || mnum === 7 || mnum === 10) { page.drawLine({ start: { x, y: top - 6 }, end: { x, y: bottom + 4 }, thickness: 0.4, color: LINE2 }); if (i < 23) text(["", "", "", "Apr", "", "", "Jul", "", "", "Oct"][mnum - 1], x + 3, top, { f: mono, size: 5.8, color: DIM }); }
    });
    if (Number(cols[0].slice(5)) > 1 && Number(cols[0].slice(5)) < 10) text(cols[0].slice(0, 4), gx0 + 4, top, { f: monoMed, size: 6.5, color: BODY });
    y -= 20;
    for (const r of mapRows) {
      text(clipTo(sane(r.brand), semi, 8.5, labelW - 10), M, y - 3, { f: semi, size: 8.5, color: INK });
      rule(gx0, gx1, y, LINE2, 0.4);
      const mm = monthsBy.get(r.brand_id) || new Map(), col = catColor(r.category);
      const hit = cols.map((kk, i) => (mm.get(kk) ? i : -1)).filter((i) => i >= 0);
      if (r.repeat_partner && hit.length > 1) page.drawLine({ start: { x: gx0 + hit[0] * cw + cw / 2, y }, end: { x: gx0 + hit[hit.length - 1] * cw + cw / 2, y }, thickness: 1.4, color: col, opacity: 0.28 });
      for (const i of hit) { const n = mm.get(cols[i]) || 1; page.drawCircle({ x: gx0 + i * cw + cw / 2, y, size: n > 2 ? 4 : n > 1 ? 3.3 : 2.6, color: col }); }
      y -= rh;
    }
    y -= 2;
    let lx = M;
    for (const ct of [...new Set(mapRows.map((r) => r.category).filter(Boolean))].slice(0, 6) as string[]) { page.drawCircle({ x: lx + 2.5, y: y + 2.4, size: 2.5, color: catColor(ct) }); lx += 9 + text(ct, lx + 8, y, { size: 7.5, color: MUTED }) + 12; }
    if (mapRows.some((r) => !r.category)) { page.drawCircle({ x: lx + 2.5, y: y + 2.4, size: 2.5, color: NO_CAT }); lx += 9 + text("Uncategorised", lx + 8, y, { size: 7.5, color: MUTED }) + 12; }
    if (mapRows.some((r) => r.repeat_partner)) { page.drawLine({ start: { x: lx, y: y + 2.4 }, end: { x: lx + 16, y: y + 2.4 }, thickness: 1.4, color: MUTED, opacity: 0.4 }); page.drawCircle({ x: lx, y: y + 2.4, size: 2.5, color: MUTED }); page.drawCircle({ x: lx + 16, y: y + 2.4, size: 2.5, color: MUTED }); text("came back", lx + 23, y, { size: 7.5, color: MUTED }); }
    y -= 30;
  }

  // ── what's performing ─────────────────────────────────────────────────
  // Cards read top to bottom: how big, what kind of post, the line a viewer got
  // first (and which channel carried it), then one supporting line if another
  // channel had text. Empty channels are left out rather than labelled.
  if (full && n6) {
    const gapX = 12, cardW = (W - 2 * M - gapX) / 2, gapY = 8;
    const reads: HookRead[] = top6.map((t: any) => readHook(t, platform));
    // a second channel with its own words (say, on-screen text under a spoken hook) earns one extra line on every card
    const others = reads.map((h) => (h.source === "caption" ? undefined : h.channels.find((ch) => ch.text && ch.text !== h.lead && ch.key !== (h.source === "said" ? "voice" : "screen"))));
    const cardH = others.some(Boolean) ? 102 : 90;
    const flagGiveaways = giveaways * 2 >= n6 && giveaways >= 2;
    if (y - (26 + (flagGiveaways ? 30 : 4) + cardH) < FOOT) newPage();
    section("Your top posts", `best ${n6} of your last ${perf.items} · your typical post gets ${fmtK(perf.median)} ${metricLabel}`, cardH);
    if (flagGiveaways) {
      rrect(M, y + 10, W - 2 * M, 21, 3, { color: AMBER_BG });
      const w0 = text(giveaways === n6 ? `All ${n6} are giveaways.` : `${giveaways} of these ${n6} are giveaways.`, M + 9, y - 3.5, { f: semi, size: 8.5, color: AMBER });
      text("They are your biggest posts. For everyday reach, we'd pitch the format averages below.", M + 9 + w0 + 5, y - 3.5, { size: 8.5, color: AMBER });
      y -= 30;
    } else y -= 4;
    const SRC: Record<string, string> = { said: "Said out loud", "on-video": "Text on video", "on-cover": "Text on cover", caption: "Caption" };
    for (let i = 0; i < n6; i++) {
      const colI = i % 2;
      if (colI === 0 && need(cardH + gapY)) y -= 2;
      const t = top6[i], h = reads[i], other = others[i], th = thumbs[i], gv = isGiveaway(t);
      const x = M + colI * (cardW + gapX), top = y + 8;
      rrect(x, top, cardW, cardH, 5, { color: WHITE, borderColor: LINE, borderWidth: 0.6 });
      const tW = 57, tH = cardH - 20;
      if (th) drawCoverImage(th, x + 10, top - 10 - tH, tW, tH, 4);
      else rrect(x + 10, top - 10, tW, tH, 4, { color: hex("#F1F3F6") });
      rrect(x + 10, top - 10, 15, 12, 3, { color: INK });
      text(String(i + 1), x + 17.5, top - 19, { f: monoMed, size: 6.5, color: WHITE, align: "center" });
      const cx0 = x + 10 + tW + 11, cx1 = x + cardW - 11, cw = cx1 - cx0;
      // metric row
      const mw = text(fmtK(t.metric), cx0, top - 26, { f: display, size: 18, color: INK });
      text(metricLabel, cx0 + mw + 5, top - 26, { size: 7.5, color: MUTED });
      if (perf.median >= 100) text(`${(t.metric / perf.median).toFixed(1)}x your usual`, cx1, top - 26, { f: semi, size: 8, color: GREEN, align: "right" });
      // chips
      let chx = cx0; const chy = top - 40;
      if (gv) chx += chip("Giveaway", chx, chy, AMBER, AMBER_BG) + 4;
      if (t.sponsored) chx += chip("Sponsored", chx, chy, GREEN, hex("#E7F6EE")) + 4;
      if (h.source !== "caption") chx += chip(SRC[h.source], chx, chy, ACCENT, hex("#EBF0FF")) + 4;
      if (h.audio !== "voice" && h.audio !== "no-audio" && h.audio !== "unread" && h.audioLabel && chx + 60 < cx1) chx += chip(h.audioLabel.split(",")[0].split("(")[0].trim(), chx, chy, MUTED, null, LINE) + 4;
      // the line itself
      let leadRaw = sane(stripGiveawayClosed(h.lead || "") || h.lead || t.title || "");
      if (h.source === "caption" && String(t.hook || "").length >= 80 && !/[.!?…]$/.test(leadRaw)) leadRaw = leadRaw.replace(/\s+\S*$/, "") + "…"; // the stored caption opener is cut mid-word
      const firstY = chx === cx0 ? top - 42 : top - 53;
      const leadLines = wrap(`“${leadRaw}”`, semi, 9, cw, chx === cx0 ? 3 : 2);
      leadLines.forEach((ln, j) => text(ln, cx0, firstY - j * 11.4, { f: semi, size: 9, color: INK }));
      if (other) text(clipTo(`${other.key === "caption" ? "Caption" : other.key === "voice" ? "Voice" : "On screen"}: “${stripGiveawayClosed(other.text || "")}”`, font, 7.6, cw), cx0, firstY - leadLines.length * 11.4 - 1, { size: 7.6, color: MUTED });
      // foot
      label(`${String(t.kind || "post")} · ${mon(t.published_at)}`, cx0, top - cardH + 10, DIM, { size: 6, track: 0.7 });
      if (t.url) link("open ↗", cx1, top - cardH + 9.5, t.url, { size: 7.8, align: "right" });
      if (colI === 1 || i === n6 - 1) y -= cardH + gapY;
    }
    y -= 12;

    // format and opener averages, side by side
    const fm = (perf.formats || []).filter((f: any) => f.count >= 2).sort((a: any, b: any) => b.avg - a.avg).slice(0, 4);
    const openers = (perf.openers || []).filter((o: any) => !isGiveaway(o) && o.count >= 2 && sane(o.label)).sort((a: any, b: any) => (b.mult || 0) - (a.mult || 0)).filter((o: any, i: number) => i < 2 || (o.mult || 0) >= 1).slice(0, 4);
    const hooks = openers.length ? [] : (perf.hooks || []).filter((hk: any) => hk.hook !== "Other" && hk.count >= 2).slice(0, 4);
    const right = openers.length ? openers.map((o: any) => ({ l: `“${sane(o.label).replace(/[!>.\s]+$/, "")}”`, v: `${Number(o.mult || o.avg / Math.max(perf.median, 1)).toFixed(1)}x usual`, n: `${o.count} posts`, up: (o.mult || 0) >= 1.15 })) : hooks.map((hk: any) => ({ l: sane(hk.hook), v: `${fmtK(hk.avg)} avg`, n: `${hk.count} posts`, up: hk.avg >= perf.median }));
    const lines = Math.max(fm.length, right.length);
    if (lines) {
      need(22 + lines * 15 + 16);
      const gap = 28, pw = (W - 2 * M - gap) / 2, px = [M, M + pw + gap];
      if (fm.length) {
        rule(px[0], px[0] + (right.length ? pw : W - 2 * M), y + 12, INK, 0.9); label(`Your formats · average ${metricLabel}`, px[0], y, INK);
        const maxAvg = Math.max(...fm.map((f: any) => f.avg), 1), barX = px[0] + 68, barW = pw - 68 - 92;
        fm.forEach((f: any, i: number) => { const yy = y - 18 - i * 15; text(plural(f.kind), px[0], yy, { size: 8.8, color: INK }); page.drawRectangle({ x: barX, y: yy, width: barW, height: 6, color: LINE2 }); page.drawRectangle({ x: barX, y: yy, width: Math.max(2, barW * (f.avg / maxAvg)), height: 6, color: i === 0 ? ACCENT : hex("#AEB6C4") }); text(fmtK(f.avg), barX + barW + 8, yy, { f: semi, size: 8.8, color: INK }); text(`${f.count} posts`, px[0] + pw, yy, { f: mono, size: 6.5, color: DIM, align: "right" }); });
      }
      if (right.length) {
        const x = fm.length ? px[1] : px[0], w = fm.length ? pw : W - 2 * M;
        rule(x, x + w, y + 12, INK, 0.9); label(openers.length ? "Openers that work for you" : "How your captions open", x, y, INK);
        right.forEach((o: any, i: number) => { const yy = y - 18 - i * 15; text(clipTo(o.l, font, 8.8, w - 118), x, yy, { size: 8.8, color: INK }); text(o.v, x + w - 48, yy, { f: semi, size: 8.5, color: o.up ? GREEN : MUTED, align: "right" }); text(o.n, x + w, yy, { f: mono, size: 6.5, color: DIM, align: "right" }); });
      }
      y -= 18 + lines * 15 + 20;
    }
  }

  // ── all disclosed sponsors ────────────────────────────────────────────
  if (full && rows.length) {
    let rh = 15.4; const two = rows.length > 8, gap = 24, cw = two ? (W - 2 * M - gap) / 2 : W - 2 * M;
    section("Every partnership we found", `${rows.length} brand${rows.length === 1 ? "" : "s"} · ${totalDeals} deal${totalDeals === 1 ? "" : "s"} · newest first${repeats.length ? " · blue count = came back" : ""}${rows.some((r) => /\(\?\)/.test(r.brand)) ? " · (?) = brand guessed from the post, verify" : ""}`, 14 + rh * Math.min(4, rows.length));
    const xs = (x: number) => ({ brand: x + 11, cat: x + cw - 136, deals: x + cw - 64, last: x + cw - 58, post: x + cw });
    const heads = (x: number) => { const c = xs(x); label("Brand", c.brand, y, DIM, { size: 5.8, track: 0.9 }); label("Category", c.cat, y, DIM, { size: 5.8, track: 0.9 }); label("Deals", c.deals, y, DIM, { size: 5.8, track: 0.9, align: "right" }); label("Last", c.last + 2, y, DIM, { size: 5.8, track: 0.9 }); label("Post", c.post, y, DIM, { size: 5.8, track: 0.9, align: "right" }); };
    let i = 0;
    while (i < rows.length) {
      if (y - 14 - rh * 2 < FOOT) newPage();
      heads(M); if (two && rows.length - i > 1) heads(M + cw + gap);
      y -= 7;
      const left = rows.length - i, colLen = two ? Math.ceil(left / 2) : left;
      if (colLen * rh > y - FOOT && colLen * 13.2 <= y - FOOT) rh = (y - FOOT) / colLen; // a few rows over: tighten rather than orphan them on a new page
      const fit = Math.max(1, Math.floor((y - FOOT + 0.01) / rh)), take = Math.min(rows.length - i, two ? fit * 2 : fit), perCol = two ? Math.ceil(take / 2) : take;
      for (let j = 0; j < take; j++) {
        const r = rows[i + j], colI = two ? Math.floor(j / perCol) : 0, x = M + colI * (cw + gap), yy = y - 10 - (j - colI * perCol) * rh, c2 = xs(x);
        rule(x, x + cw, yy + 10.6, LINE2, 0.5);
        page.drawCircle({ x: x + 3.5, y: yy + 2.8, size: 2.6, color: catColor(r.category) });
        text(clipTo(sane(r.brand), semi, 9, c2.cat - c2.brand - 8), c2.brand, yy, { f: semi, size: 9, color: INK });
        if (r.category) text(clipTo(sane(r.category), font, 7.8, c2.deals - c2.cat - 20), c2.cat, yy, { size: 7.8, color: MUTED });
        text(String(r.deals), c2.deals, yy, r.repeat_partner ? { f: bold, size: 9, color: ACCENT, align: "right" } : { size: 8.5, color: BODY, align: "right" });
        text(mon(r.last_seen), c2.last + 2, yy, { f: mono, size: 7, color: MUTED });
        if (r.content_url) link("view", c2.post, yy, r.content_url, { size: 7.6, align: "right" });
      }
      y -= perCol * rh + 12; i += take;
    }
  }


  // ── footers ───────────────────────────────────────────────────────────
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    page = pg; const dark = inkPages.has(pg);
    rule(M, W - M, 46, dark ? INK_RULE : LINE);
    text("Built from your public posts through the official YouTube and Instagram APIs. It only counts partnerships you disclosed (#ad, #partner, paid partnership), so your real list is likely longer.", M, 34, { size: 6.1, color: dark ? ON_INK_DIM : DIM });
    link("sponsorprint.com", M, 22, "https://sponsorprint.com", { f: monoMed, size: 7, color: dark ? WHITE : INK });
    text(printNo, W / 2, 22, { f: mono, size: 6.5, color: dark ? ON_INK_DIM : DIM, align: "center" });
    text(`${i + 1} / ${pages.length}`, W - M, 22, { f: mono, size: 7, color: dark ? ON_INK_DIM : DIM, align: "right" });
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
