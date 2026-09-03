// YouTube Data API v3 client. Cheap calls only: channels.list (1 unit),
// playlistItems.list (1 unit/page), videos.list (1 unit/50 videos).
// search.list (100 units) is deliberately isolated in searchChannels so the
// budget-heavy path is obvious.

const API = "https://www.googleapis.com/youtube/v3";

export interface YtChannel {
  id: string;
  title: string;
  handle: string;
  subs: number;
  thumbnail: string;
  uploadsPlaylist: string;
  description: string;
}

export interface YtVideo {
  id: string;
  title: string;
  description: string;
  tags: string[];
  publishedAt: string;
  views: number;
  thumbnail: string;
  durationSeconds: number;
}

export interface QuotaMeter { units: number }

async function ytGet(apiKey: string, path: string, params: Record<string, string>, meter?: QuotaMeter, cost = 1) {
  const q = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${API}/${path}?${q}`);
  if (meter) meter.units += cost;
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`YouTube ${path} ${res.status}: ${body.substring(0, 300)}`) as Error & { status?: number; quota?: boolean };
    err.status = res.status;
    err.quota = res.status === 403 && /quota/i.test(body);
    throw err;
  }
  return res.json();
}

function parseChannel(ch: any): YtChannel {
  const sn = ch.snippet || {};
  return {
    id: ch.id,
    title: sn.title || ch.id,
    handle: sn.customUrl || "",
    subs: Number((ch.statistics || {}).subscriberCount || 0),
    thumbnail: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || "",
    uploadsPlaylist: ch.contentDetails?.relatedPlaylists?.uploads || "UU" + String(ch.id).substring(2),
    description: sn.description || "",
  };
}

/** Resolve a channel by @handle or UC id. 1 unit. */
export async function resolveChannel(apiKey: string, handleOrId: string, meter?: QuotaMeter): Promise<YtChannel | null> {
  const raw = handleOrId.trim().replace(/^@/, "");
  const params: Record<string, string> = { part: "snippet,statistics,contentDetails" };
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(raw)) params.id = raw; else params.forHandle = raw;
  const json = await ytGet(apiKey, "channels", params, meter);
  if (!json.items?.length) return null;
  return parseChannel(json.items[0]);
}

/** Channel search. 100 units per call. Use sparingly (autocomplete should hit the DB first). */
export async function searchChannels(apiKey: string, query: string, max = 8, meter?: QuotaMeter) {
  const json = await ytGet(apiKey, "search", { part: "snippet", type: "channel", maxResults: String(max), q: query }, meter, 100);
  return (json.items || []).map((it: any) => ({
    channelId: it.id?.channelId || it.snippet?.channelId || "",
    title: it.snippet?.title || "",
    description: (it.snippet?.description || "").substring(0, 120),
    thumbnail: it.snippet?.thumbnails?.default?.url || "",
  })).filter((r: any) => r.channelId);
}

/** All video IDs newer than cutoff. 1 unit per 50 videos. */
export async function listVideoIds(apiKey: string, uploadsPlaylist: string, cutoff: Date, meter?: QuotaMeter, maxPages = 100): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: "50" };
    if (pageToken) params.pageToken = pageToken;
    const json = await ytGet(apiKey, "playlistItems", params, meter);
    let reachedCutoff = false;
    for (const it of json.items || []) {
      const cd = it.contentDetails || {};
      if (!cd.videoId) continue;
      if (cd.videoPublishedAt && new Date(cd.videoPublishedAt) < cutoff) { reachedCutoff = true; break; }
      ids.push(cd.videoId);
    }
    if (reachedCutoff || !json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return ids;
}

function isoDurationToSeconds(d: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || "");
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/** Video details in batches of 50. 1 unit per batch. */
export async function getVideos(apiKey: string, ids: string[], meter?: QuotaMeter): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const json = await ytGet(apiKey, "videos", { part: "snippet,statistics,contentDetails", id: batch.join(",") }, meter);
    for (const v of json.items || []) {
      const sn = v.snippet || {};
      out.push({
        id: v.id,
        title: sn.title || "",
        description: sn.description || "",
        tags: sn.tags || [],
        publishedAt: sn.publishedAt || "",
        views: Number((v.statistics || {}).viewCount || 0),
        thumbnail: sn.thumbnails?.medium?.url || "",
        durationSeconds: isoDurationToSeconds(v.contentDetails?.duration),
      });
    }
  }
  return out;
}
