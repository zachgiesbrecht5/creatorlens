// Owned insights. Daily, for every Instagram account in the connection pool marked
// owned (our business portfolio: Rootfor's own and creators who assigned theirs),
// read the last 50 posts with saves, shares, reach and views. Stored per post and
// shown on the creator's home; the numbers public data can't see.
import type { SupabaseClient } from "@supabase/supabase-js";
const V = "v25.0";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[owned]", ...a);

export async function syncOwnedInsights(sb: SupabaseClient): Promise<number> {
  const dayAgo = new Date(Date.now() - 20 * 3600e3).toISOString();
  const { data: conns } = await sb.from("ig_connections").select("ig_user_id,ig_username,access_token").eq("owned", true).eq("healthy", true).or(`insights_synced_at.is.null,insights_synced_at.lt.${dayAgo}`).limit(20);
  let total = 0;
  for (const c of conns || []) {
    try {
      const r = await fetch(`https://graph.facebook.com/${V}/${c.ig_user_id}/media?fields=id,permalink,timestamp,caption,media_type,media_product_type,like_count,comments_count,insights.metric(reach,saved,shares,views)&limit=50&access_token=${c.access_token}`);
      const j: any = await r.json();
      if (!r.ok || j.error) { log(c.ig_username, "insights failed:", j.error?.message || r.status); await sb.from("ig_connections").update({ insights_synced_at: new Date().toISOString() }).eq("ig_user_id", c.ig_user_id); continue; }
      const { data: creator } = await sb.from("creators").select("id").eq("platform", "instagram").ilike("handle", c.ig_username).maybeSingle();
      const rows = (j.data || []).map((m: any) => {
        const ins: Record<string, number> = {}; for (const x of m.insights?.data || []) ins[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value ?? 0);
        return { ig_user_id: c.ig_user_id, creator_id: creator?.id || null, media_id: String(m.id), permalink: m.permalink, posted_at: m.timestamp, media_type: m.media_product_type || m.media_type, caption: String(m.caption || "").slice(0, 400), likes: m.like_count ?? null, comments: m.comments_count ?? null, saves: ins.saved ?? null, shares: ins.shares ?? null, reach: ins.reach ?? null, views: ins.views ?? null, updated_at: new Date().toISOString() };
      });
      if (rows.length) { const { error } = await sb.from("owned_post_insights").upsert(rows, { onConflict: "media_id" }); if (error) log("upsert failed", error.message); else total += rows.length; }
      await sb.from("ig_connections").update({ insights_synced_at: new Date().toISOString() }).eq("ig_user_id", c.ig_user_id);
      log(c.ig_username, rows.length, "posts with insights");
    } catch (e: any) { log(c.ig_username, "failed", String(e?.message || e).slice(0, 120)); }
  }
  return total;
}
