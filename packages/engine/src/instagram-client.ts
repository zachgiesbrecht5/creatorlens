// Meta Graph API: Business Discovery. Reads posts a public Business/Creator
// account OWNS (brand-authored collabs are invisible from the creator side).
// Rate limits scale with the number of connected users, so the worker picks a
// token from the pool (house token + every user who connected their IG).

const GRAPH_VERSION = "v25.0";

export interface IgProfile {
  username: string;
  id?: string;
  followers: number;
  mediaCount: number;
  biography: string;
  profilePicture: string;
  name: string;
}

export interface IgPost {
  id: string;
  caption: string;
  permalink: string;
  timestamp: string;
  likes: number;
  comments: number;
  mediaType: string;
  cover?: string | null;
  video?: string | null;
}

export interface IgToken {
  igUserId: string;   // the connected account's IG user id (the "viewer")
  accessToken: string;
}

export class IgRateLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = "IgRateLimitError"; }
}

async function graph(token: IgToken, query: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${token.igUserId}?${query}&access_token=${encodeURIComponent(token.accessToken)}`;
  const res = await fetch(url);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const msg = `Meta ${res.status} code=${e.code} sub=${e.error_subcode}: ${e.message || "unknown"}`;
    if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613 || /rate|limit/i.test(e.message || "")) throw new IgRateLimitError(msg);
    throw new Error(msg);
  }
  return json;
}

export function isValidIgUsername(u: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(u.trim().replace(/^@/, "").toLowerCase());
}

/** Profile only (no posts): one cheap call, for search previews. Null if not a professional account. */
export async function lookupIgProfile(token: IgToken, username: string): Promise<{ id?: string; username: string; name: string; followers: number; avatar: string | null; biography?: string | null; media?: { url: string; kind: string; thumb: string | null }[] } | null> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!isValidIgUsername(clean)) return null;
  try {
    const json = await graph(token, `fields=${encodeURIComponent(`business_discovery.username(${clean}){id,username,name,followers_count,profile_picture_url,biography,media.limit(4){permalink,media_type,thumbnail_url,media_url}}`)}`);
    const bd = json.business_discovery;
    if (!bd) return null;
    const media = (bd.media?.data || []).map((m: any) => ({ url: m.permalink, kind: m.media_type === "VIDEO" ? "reel" : "post", thumb: m.thumbnail_url || m.media_url || null }));
    return { id: bd.id || undefined, username: bd.username, name: bd.name || bd.username, followers: bd.followers_count || 0, avatar: bd.profile_picture_url || null, biography: bd.biography || null, media };
  } catch (e) {
    if (e instanceof IgRateLimitError) throw e;
    return null;   // private / personal / nonexistent
  }
}

/** Profile + up to maxPosts recent posts via business_discovery. */
export async function fetchIgCreator(token: IgToken, username: string, maxPosts = 100, pageSize = 50): Promise<{ profile: IgProfile; posts: IgPost[] }> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!isValidIgUsername(clean)) throw new Error(`"${username}" is not a valid IG username`);
  const fields = "id,caption,permalink,timestamp,like_count,comments_count,media_type,thumbnail_url,media_url";
  const posts: IgPost[] = [];
  let after: string | null = null;
  let profile: IgProfile | null = null;

  while (posts.length < maxPosts) {
    const media = `media.limit(${pageSize})${after ? `.after(${after})` : ""}{${fields}}`;
    const inner = after ? media : `username,name,followers_count,media_count,biography,profile_picture_url,${media}`;
    const json = await graph(token, `fields=${encodeURIComponent(`business_discovery.username(${clean}){${inner}}`)}`);
    const bd = json.business_discovery;
    if (!bd) throw new Error(`No business_discovery data for @${clean} (private, personal, or nonexistent account)`);
    if (!profile) {
      profile = {
        username: bd.username || clean, id: bd.id, name: bd.name || "",
        followers: Number(bd.followers_count || 0), mediaCount: Number(bd.media_count || 0),
        biography: bd.biography || "", profilePicture: bd.profile_picture_url || "",
      };
    }
    const m = bd.media;
    if (!m?.data?.length) break;
    for (const p of m.data) {
      posts.push({ id: p.id, caption: p.caption || "", permalink: p.permalink || "", timestamp: p.timestamp || "",
        likes: Number(p.like_count || 0), comments: Number(p.comments_count || 0), mediaType: p.media_type || "", cover: p.thumbnail_url || (p.media_type === "IMAGE" || p.media_type === "CAROUSEL_ALBUM" ? p.media_url : null) || null, video: p.media_type === "VIDEO" ? p.media_url || null : null });
    }
    after = m.paging?.cursors?.after || null;
    if (!after || m.data.length < pageSize) break;
  }
  return { profile: profile!, posts: posts.slice(0, maxPosts) };
}

export type IgHashtagPost = { id: string; permalink: string; timestamp: string; caption: string; mediaType: string; likes: number; comments: number; edge: "top" | "recent" };

/** Posts using #tag: top_media (most popular, any age) + recent_media (last 24 hours only,
 *  Meta's rule). Meta does NOT return who posted. Costs one of the 30 unique hashtags per
 *  rolling 7 days for the connected account; repeat lookups of the same tag are free. */
export async function hashtagMedia(token: IgToken, tag: string): Promise<{ tag: string; posts: IgHashtagPost[] } | null> {
  const clean = tag.replace(/^#/, "").toLowerCase();
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;
  const auth = `user_id=${token.igUserId}&access_token=${encodeURIComponent(token.accessToken)}`;
  const q: any = await fetch(`${base}/ig_hashtag_search?q=${encodeURIComponent(clean)}&${auth}`).then((r) => r.json()).catch(() => null);
  if (q?.error && (q.error.code === 4 || q.error.code === 17 || q.error.code === 613 || /limit/i.test(q.error.message || ""))) throw new IgRateLimitError(`Meta hashtag: ${q.error.message}`);
  const id = q?.data?.[0]?.id; if (!id) return null;
  const fields = "id,permalink,timestamp,caption,media_type,like_count,comments_count";
  const posts: IgHashtagPost[] = []; const seen = new Set<string>();
  for (const edge of ["top", "recent"] as const) {
    const j: any = await fetch(`${base}/${id}/${edge}_media?fields=${fields}&limit=50&${auth}`).then((r) => r.json()).catch(() => null);
    for (const m of j?.data || []) {
      if (seen.has(m.id)) continue; seen.add(m.id);
      posts.push({ id: m.id, permalink: m.permalink || "", timestamp: m.timestamp || "", caption: String(m.caption || ""), mediaType: m.media_type || "", likes: Number(m.like_count || 0), comments: Number(m.comments_count || 0), edge });
    }
  }
  return { tag: clean, posts };
}

/** Best-effort author of a public post via oEmbed (needs the Meta oEmbed Read feature).
 *  Meta dropped author_name in Nov 2025, so this reads it when present and otherwise looks
 *  for "(@handle)" or an instagram.com/handle link in the embed html. Null when unknown. */
export async function oembedAuthor(appToken: string, permalink: string): Promise<string | null> {
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/instagram_oembed?url=${encodeURIComponent(permalink)}&omitscript=true&access_token=${encodeURIComponent(appToken)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return authorFromOembed(j);
  } catch { return null; }
}

export function authorFromOembed(j: { author_name?: string; author_url?: string; html?: string } | null): string | null {
  if (!j) return null;
  const ok = (h?: string | null) => (h && isValidIgUsername(h) && !IG_RESERVED.has(h.toLowerCase()) ? h.toLowerCase() : null);
  const fromUrl = (u?: string) => ok(u?.match(/instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?|$|")/)?.[1]);
  const a = ok(j.author_name?.replace(/^@/, "")) || fromUrl(j.author_url);
  if (a) return a;
  const html = String(j.html || "");
  const shared = html.match(/shared by[^<(]*\(@([A-Za-z0-9._]{1,30})\)/i)?.[1];
  if (ok(shared)) return ok(shared);
  for (const m of html.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?[^"]*)?"/g)) { const h = ok(m[1]); if (h) return h; }
  return null;
}

const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "about", "developer", "legal", "direct", "web", "embed"]);

/** @mentions in a caption, lowercased, valid usernames only, no trailing dots. */
export function captionMentions(caption: string): string[] {
  const out = new Set<string>();
  for (const m of String(caption || "").matchAll(/(?:^|[^A-Za-z0-9_.@])@([A-Za-z0-9._]{1,30})/g)) {
    const h = m[1].replace(/\.+$/, "").toLowerCase();
    if (h && isValidIgUsername(h) && !IG_RESERVED.has(h)) out.add(h);
  }
  return [...out];
}

/** Instagram handle linked from a bio / channel description ("instagram.com/x", "IG: @x", "Instagram - @x"). */
export function linkedInstagram(text: string): string | null {
  const s = String(text || "");
  const url = s.match(/instagram\.com\/(?!p\/|reel\/|reels\/|stories\/|explore\/)([A-Za-z0-9._]{1,30})/i)?.[1];
  const label = s.match(/\b(?:ig|insta|instagram)\s*[:\-–|]?\s*@([A-Za-z0-9._]{1,30})/i)?.[1];
  const h = (url || label || "").replace(/\.+$/, "").toLowerCase();
  return h && isValidIgUsername(h) && !IG_RESERVED.has(h) ? h : null;
}

/** Hashtag pulse: public posts using #tag in the last N days (top + last-24h edges).
 *  Meta doesn't say who posted, so this is a spend signal, not a creator list. */
export async function hashtagPulse(token: IgToken, tag: string, days = 30): Promise<{ tag: string; posts: number; sample: { permalink: string; timestamp: string; caption: string }[] } | null> {
  const hm = await hashtagMedia(token, tag);
  if (!hm) return null;
  return pulseFrom(hm, days);
}

export function pulseFrom(hm: { tag: string; posts: IgHashtagPost[] }, days = 30) {
  const cutoff = Date.now() - days * 864e5;
  const recent = hm.posts.filter((m) => new Date(m.timestamp).getTime() > cutoff);
  return { tag: hm.tag, posts: recent.length, sample: recent.slice(0, 5).map((m) => ({ permalink: m.permalink, timestamp: m.timestamp, caption: m.caption.slice(0, 140) })) };
}
