import { decodeEntities } from "@/lib/hook-read";

// Candidate details for a first email to a creator: one real thing a person could mention.
// Deliberately not a summary and not a drafted sentence. The panel shows the raw detail and a
// link; the sender opens it, watches it, and writes the line in their own words.
export type EmailNotes = {
  series: { label: string; count: number; urls: string[] }[];
  said: { text: string; url: string }[];
  recent: { hook: string; url: string; date: string; kind: string }[];
};

const PROMO = /give\s?-?away|#ad\b|#sponsored|partner\b|% off|\bsale\b|\bcode\b|link in bio|comment .{0,12} for (the )?links?/i;
const tidy = (s: string) => decodeEntities(String(s || "")).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").replace(/[\s!>.:,~-]+$/, "").trim();
const firstSentence = (s: string) => { const t = tidy(s); const m = t.match(/^.{12,140}?[.!?](?=\s|$)/); return (m ? m[0] : t.slice(0, 140)).trim(); };

export function emailNotes(perf: any, heard: { url: string; text: string }[] = []): EmailNotes {
  const top: any[] = perf?.top || [];
  const promoUrls = new Set(top.filter((t) => t.sponsored || PROMO.test(`${t.title || ""} ${t.hook || ""}`)).map((t) => t.url));

  // 1. something they do again and again, named the way they name it
  const series = ((perf?.openers || []) as any[])
    .filter((o) => o.count >= 2 && !PROMO.test(`${o.label} ${(o.examples || []).join(" ")}`) && tidy(o.label).length >= 6)
    .sort((a, b) => b.count - a.count || (b.mult || 0) - (a.mult || 0)).slice(0, 3)
    .map((o) => ({ label: tidy(o.label), count: Number(o.count), urls: (o.urls || []).slice(0, 3) }));

  // 2. something they actually said out loud, in a post that wasn't an ad
  const said: EmailNotes["said"] = []; const seen = new Set<string>();
  for (const t of top) if (t.spoken && t.audio === "voice" && !promoUrls.has(t.url)) { const text = firstSentence(t.spoken); if (text.length >= 12 && !seen.has(t.url)) { seen.add(t.url); said.push({ text, url: t.url }); } }
  for (const h of heard) if (!promoUrls.has(h.url) && !seen.has(h.url) && !PROMO.test(h.text)) { const text = firstSentence(h.text); if (text.length >= 12) { seen.add(h.url); said.push({ text, url: h.url }); } }

  // 3. an ordinary recent post (stored from the next print onward)
  const recent = ((perf?.recent || []) as any[]).filter((r) => r.url && !PROMO.test(r.hook || "")).slice(0, 3)
    .map((r) => ({ hook: tidy(r.hook), url: r.url, date: String(r.published_at || "").slice(0, 10), kind: String(r.kind || "post") }));

  return { series, said: said.slice(0, 3), recent };
}
