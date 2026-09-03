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

/** Profile + up to maxPosts recent posts via business_discovery. */
export async function fetchIgCreator(token: IgToken, username: string, maxPosts = 100, pageSize = 50): Promise<{ profile: IgProfile; posts: IgPost[] }> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();
  if (!isValidIgUsername(clean)) throw new Error(`"${username}" is not a valid IG username`);
  const fields = "id,caption,permalink,timestamp,like_count,comments_count,media_type";
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
        likes: Number(p.like_count || 0), comments: Number(p.comments_count || 0), mediaType: p.media_type || "" });
    }
    after = m.paging?.cursors?.after || null;
    if (!after || m.data.length < pageSize) break;
  }
  return { profile: profile!, posts: posts.slice(0, maxPosts) };
}
