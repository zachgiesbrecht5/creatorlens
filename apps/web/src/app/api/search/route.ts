import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin, currentUser } from "@/lib/supabase";
import { resolveChannel, searchChannels, lookupIgProfile, isValidIgUsername } from "@creatorlens/engine";

// Search-as-you-type, the way it feels on the platforms themselves.
//   1. Our own index first (instant, free): handle or name contains the query.
//   2. When the user pauses, a live platform lookup:
//      - exact handle on YouTube (channels.forHandle, 1 unit) or Instagram
//        (business_discovery, 1 call) -> the real avatar, name, followers.
//      - a name query on YouTube -> channel search (100 units), cached 7 days,
//        signed-in only, capped per user per day so one person can't burn the
//        day's quota. Instagram has no name search API, so IG is handle-only.
const YT_SEARCH_PER_USER_PER_DAY = Number(process.env.YT_SEARCH_PER_USER_PER_DAY || 20);
const YT_SEARCH_DAILY_UNITS = Number(process.env.YT_SEARCH_DAILY_UNITS || 2500);   // share of the 9,000 budget reserved for search

type Hit = { platform: "youtube" | "instagram"; handle: string; display_name: string; avatar_url: string | null; followers: number | null; cached: boolean; source: "index" | "live" };

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("q") || "").trim();
  const platform = (req.nextUrl.searchParams.get("platform") || "youtube") as "youtube" | "instagram";
  const live = req.nextUrl.searchParams.get("live") === "1";
  const q = raw.replace(/^@/, "");
  if (q.length < 2) return NextResponse.json([]);
  const admin = supabaseAdmin();

  // 1. index
  const { data } = await admin.from("creators")
    .select("platform,handle,display_name,avatar_url,followers")
    .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order("followers", { ascending: false }).limit(8);
  let hits: Hit[] = (data || []).map((c) => ({ ...c, cached: true, source: "index" as const }));
  // platform the user picked floats up
  hits.sort((a, b) => Number(b.platform === platform) - Number(a.platform === platform));
  if (!live) return NextResponse.json(hits);

  const seen = new Set(hits.map((h) => `${h.platform}:${h.handle.toLowerCase()}`));
  const cacheKey = (kind: string) => `${platform}:${kind}:${q.toLowerCase()}`;
  const fromCache = async (key: string): Promise<Hit[] | null> => {
    const { data: c } = await admin.from("search_cache").select("results,created_at").eq("key", key).maybeSingle();
    if (!c || Date.now() - new Date(c.created_at).getTime() > 7 * 864e5) return null;
    return c.results as Hit[];
  };
  const toCache = (key: string, results: Hit[]) => admin.from("search_cache").upsert({ key, results, created_at: new Date().toISOString() }).then(() => {});
  const add = (h: Hit) => { const k = `${h.platform}:${h.handle.toLowerCase()}`; if (!seen.has(k)) { seen.add(k); hits.push(h); } };

  // 2a. exact handle lookup (cheap on both platforms)
  const handleish = /^[A-Za-z0-9._-]{2,30}$/.test(q);
  if (handleish) {
    const key = cacheKey("handle");
    const cached = await fromCache(key);
    if (cached) cached.forEach(add);
    else {
      try {
        if (platform === "youtube" && process.env.YT_API_KEY) {
          const ch = await resolveChannel(process.env.YT_API_KEY, q);
          const res: Hit[] = ch ? [{ platform: "youtube", handle: ch.handle || ch.id, display_name: ch.title, avatar_url: ch.thumbnail || null, followers: ch.subs ?? null, cached: false, source: "live" }] : [];
          res.forEach(add); await toCache(key, res);
        } else if (platform === "instagram" && isValidIgUsername(q)) {
          const { data: tok } = await admin.from("ig_connections").select("ig_user_id,access_token").eq("is_house", true).or("cooldown_until.is.null,cooldown_until.lt.now()").limit(1).maybeSingle();
          if (tok) {
            const p = await lookupIgProfile({ igUserId: tok.ig_user_id, accessToken: tok.access_token }, q);
            const res: Hit[] = p ? [{ platform: "instagram", handle: p.username, display_name: p.name, avatar_url: p.avatar, followers: p.followers, cached: false, source: "live" }] : [];
            res.forEach(add); await toCache(key, res);
          }
        }
      } catch { /* live lookup is best-effort */ }
    }
  }

  // 2b. name search (YouTube only), signed in, throttled, cached
  const looksLikeName = /\s/.test(q) || (!handleish && q.length >= 3) || (handleish && q.length >= 4 && !hits.some((h) => h.source === "live"));
  if (platform === "youtube" && looksLikeName && process.env.YT_API_KEY) {
    const key = cacheKey("name");
    const cached = await fromCache(key);
    if (cached) cached.forEach(add);
    else {
      const user = await currentUser();
      if (user) {
        const day = new Date().toISOString().slice(0, 10);
        const [{ data: mine }, { data: quota }] = await Promise.all([
          admin.from("search_spend").select("yt_searches").eq("user_id", user.id).eq("day", day).maybeSingle(),
          admin.from("house_quota").select("yt_units").eq("day", day).maybeSingle(),
        ]);
        const unitsUsed = Number(quota?.yt_units || 0);
        if ((mine?.yt_searches || 0) < YT_SEARCH_PER_USER_PER_DAY && unitsUsed + 100 <= Number(process.env.YT_DAILY_BUDGET || 9000) - (9000 - YT_SEARCH_DAILY_UNITS)) {
          try {
            const found = await searchChannels(process.env.YT_API_KEY, q, 6);
            const res: Hit[] = found.map((f: any) => ({ platform: "youtube" as const, handle: f.channelId, display_name: f.title, avatar_url: f.thumbnail || null, followers: null, cached: false, source: "live" as const }));
            res.forEach(add); await toCache(key, res);
            await admin.from("search_spend").upsert({ user_id: user.id, day, yt_searches: (mine?.yt_searches || 0) + 1 });
            await admin.from("house_quota").upsert({ day, yt_units: unitsUsed + 100 });
          } catch { /* best-effort */ }
        }
      }
    }
  }
  return NextResponse.json(hits.slice(0, 10));
}
