// Owned insights. Daily, for every Instagram account in the connection pool marked
// owned (our business portfolio: Rootfor's own and creators who assigned theirs),
// read the last 100 posts with saves, shares, reach, views, follows and total interactions. Stored per post and
// shown on the creator's home; the numbers public data can't see.
import type { SupabaseClient } from "@supabase/supabase-js";
const V = "v25.0";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[owned]", ...a);

/** Instagram Login tokens live 60 days; refresh any with under 10 days left (they must be at least a day old). */
async function refreshInstagramTokens(sb: SupabaseClient) {
  const soon = new Date(Date.now() + 10 * 864e5).toISOString();
  const { data: conns } = await sb.from("ig_connections").select("ig_user_id,ig_username,access_token,token_expires_at").eq("api_host", "instagram").eq("healthy", true).lt("token_expires_at", soon);
  for (const c of conns || []) {
    try {
      const j: any = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${c.access_token}`)).json();
      if (j.access_token) { await sb.from("ig_connections").update({ access_token: j.access_token, token_expires_at: new Date(Date.now() + (Number(j.expires_in) || 60 * 86400) * 1000).toISOString() }).eq("ig_user_id", c.ig_user_id); log(c.ig_username, "token refreshed"); }
      else { log(c.ig_username, "refresh failed:", j.error?.message || "unknown"); if (c.token_expires_at && new Date(c.token_expires_at) < new Date()) await sb.from("ig_connections").update({ healthy: false, last_error: "Instagram login expired; reconnect" }).eq("ig_user_id", c.ig_user_id); }
    } catch (e: any) { log(c.ig_username, "refresh error", String(e?.message || e).slice(0, 120)); }
  }
}

export async function syncOwnedInsights(sb: SupabaseClient): Promise<number> {
  await refreshInstagramTokens(sb).catch(() => {});
  const dayAgo = new Date(Date.now() - 20 * 3600e3).toISOString();
  const { data: conns } = await sb.from("ig_connections").select("ig_user_id,ig_username,access_token,api_host").eq("owned", true).eq("healthy", true).or(`insights_synced_at.is.null,insights_synced_at.lt.${dayAgo}`).limit(20);
  let total = 0;
  for (const c of conns || []) {
    try {
      // Facebook-login connections read through graph.facebook.com; Instagram-login ones through graph.instagram.com.
      const host = c.api_host === "instagram" ? "graph.instagram.com" : "graph.facebook.com";
      // follows + total_interactions are the two numbers the quarterly read is built on; not every media type
      // supports them, and one unsupported item fails the whole expansion, so fall back to the core set.
      const fetchMedia = async (metrics: string) => { const r = await fetch(`https://${host}/${V}/${c.ig_user_id}/media?fields=id,permalink,timestamp,caption,media_type,media_product_type,like_count,comments_count,insights.metric(${metrics})&limit=100&access_token=${c.access_token}`); const j: any = await r.json(); return { ok: r.ok && !j.error, j, status: r.status }; };
      let { ok, j, status } = await fetchMedia("reach,saved,shares,views,follows,total_interactions");
      if (!ok) { log(c.ig_username, "full metric set refused:", j.error?.message || status, "- retrying core set"); ({ ok, j, status } = await fetchMedia("reach,saved,shares,views")); }
      if (!ok) { log(c.ig_username, "insights failed:", j.error?.message || status); await sb.from("ig_connections").update({ insights_synced_at: new Date().toISOString() }).eq("ig_user_id", c.ig_user_id); continue; }
      const { data: creator } = await sb.from("creators").select("id").eq("platform", "instagram").ilike("handle", c.ig_username).maybeSingle();
      const rows = (j.data || []).map((m: any) => {
        const ins: Record<string, number> = {}; for (const x of m.insights?.data || []) ins[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value ?? 0);
        return { ig_user_id: c.ig_user_id, creator_id: creator?.id || null, media_id: String(m.id), permalink: m.permalink, posted_at: m.timestamp, media_type: m.media_product_type || m.media_type, caption: String(m.caption || "").slice(0, 400), likes: m.like_count ?? null, comments: m.comments_count ?? null, saves: ins.saved ?? null, shares: ins.shares ?? null, reach: ins.reach ?? null, views: ins.views ?? null, follows: ins.follows ?? null, total_interactions: ins.total_interactions ?? null, updated_at: new Date().toISOString() };
      });
      if (rows.length) { const { error } = await sb.from("owned_post_insights").upsert(rows, { onConflict: "media_id" }); if (error) log("upsert failed", error.message); else total += rows.length; }
      await sb.from("ig_connections").update({ insights_synced_at: new Date().toISOString() }).eq("ig_user_id", c.ig_user_id);
      log(c.ig_username, rows.length, "posts with insights");
    } catch (e: any) { log(c.ig_username, "failed", String(e?.message || e).slice(0, 120)); }
  }
  return total;
}
