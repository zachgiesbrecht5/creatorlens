// End-to-end scans: fetch a creator's content, run detection, return
// normalized rows. No storage here; the worker persists.

import { detectYouTube, buildSelfRefKeys } from "./youtube";
import { detectInstagram } from "./instagram";
import { resolveChannel, listVideoIds, getVideos, type QuotaMeter, type YtChannel } from "./youtube-client";
import { fetchIgCreator, type IgToken, type IgProfile } from "./instagram-client";

export type Platform = "youtube" | "instagram";

export interface PartnershipRow {
  platform: Platform;
  brand: string;
  confidenceScore: number;
  confidenceLabel: "High" | "Medium" | "Low";
  signalType: string;
  evidence: string;
  isMassSponsor: boolean;
  contentId: string;
  contentTitle: string;
  contentUrl: string;
  publishedAt: string;
  views: number;          // views on YT, likes on IG
  thumbnail: string;
}

export interface ScanResult {
  platform: Platform;
  creator: {
    externalId: string;
    handle: string;
    displayName: string;
    followers: number;
    avatar: string;
    bio: string;
  };
  itemsChecked: number;
  rows: PartnershipRow[];
  quotaUnits: number;
}

export interface YtScanOptions { lookbackDays?: number; maxVideos?: number }

export async function scanYouTube(apiKey: string, handleOrId: string, opts: YtScanOptions = {}): Promise<ScanResult> {
  const meter: QuotaMeter = { units: 0 };
  const channel: YtChannel | null = await resolveChannel(apiKey, handleOrId, meter);
  if (!channel) throw new Error(`Channel not found: ${handleOrId}`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (opts.lookbackDays ?? 730));
  let ids = await listVideoIds(apiKey, channel.uploadsPlaylist, cutoff, meter);
  if (opts.maxVideos) ids = ids.slice(0, opts.maxVideos);
  const videos = await getVideos(apiKey, ids, meter);
  const selfKeys = buildSelfRefKeys(channel.title, channel.handle);
  const rows: PartnershipRow[] = [];
  for (const v of videos) {
    for (const d of detectYouTube({ title: v.title, description: v.description, tags: v.tags }, selfKeys)) {
      rows.push({
        platform: "youtube", brand: d.brand, confidenceScore: d.confidenceScore, confidenceLabel: d.confidenceLabel,
        signalType: d.signals, evidence: d.evidence, isMassSponsor: d.isMassSponsor,
        contentId: v.id, contentTitle: v.title, contentUrl: `https://www.youtube.com/watch?v=${v.id}`,
        publishedAt: v.publishedAt, views: v.views, thumbnail: v.thumbnail,
      });
    }
  }
  dropBoilerplate(rows, videos.length);
  rows.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return {
    platform: "youtube",
    creator: { externalId: channel.id, handle: channel.handle.replace(/^@/, ""), displayName: channel.title,
      followers: channel.subs, avatar: channel.thumbnail, bio: channel.description },
    itemsChecked: videos.length, rows, quotaUnits: meter.units,
  };
}

export async function scanInstagram(token: IgToken, username: string, maxPosts = 100): Promise<ScanResult> {
  const { profile, posts } = await fetchIgCreator(token, username, maxPosts);
  const rows: PartnershipRow[] = [];
  for (const p of posts) {
    for (const f of detectInstagram(p.caption, profile.username)) {
      rows.push({
        platform: "instagram", brand: f.brand, confidenceScore: f.score, confidenceLabel: f.label,
        signalType: f.type, evidence: f.evidence, isMassSponsor: f.isMassSponsor,
        contentId: p.id, contentTitle: (p.caption || "").substring(0, 80).replace(/\s+/g, " "),
        contentUrl: p.permalink, publishedAt: p.timestamp, views: p.likes, thumbnail: "",
      });
    }
  }
  rows.sort((a, b) => b.confidenceScore - a.confidenceScore);
  return {
    platform: "instagram",
    creator: profileToCreator(profile),
    itemsChecked: posts.length, rows, quotaUnits: Math.ceil(posts.length / 50) || 1,
  };
}

function profileToCreator(p: IgProfile) {
  return { externalId: p.id || p.username, handle: p.username, displayName: p.name || p.username,
    followers: p.followers, avatar: p.profilePicture, bio: p.biography };
}

/**
 * Roll partnership rows up into the brand wall: one card per brand with
 * deal count, first/last seen, best evidence, and the repeat-partner flag
 * (2+ verified deals 30+ days apart, same rule as Rebook Radar).
 */
export interface BrandCard {
  brand: string;
  deals: number;
  platforms: Platform[];
  bestLabel: "High" | "Medium" | "Low";
  bestScore: number;
  firstSeen: string;
  lastSeen: string;
  repeatPartner: boolean;
  isMassSponsor: boolean;
  evidence: string;
  contentUrl: string;
}

export function buildBrandWall(rows: PartnershipRow[], minLabel: "High" | "Medium" | "Low" = "Medium"): BrandCard[] {
  const rank = { High: 3, Medium: 2, Low: 1 };
  const byBrand = new Map<string, BrandCard & { dates: string[] }>();
  for (const r of rows) {
    if (rank[r.confidenceLabel] < rank[minLabel]) continue;
    const key = r.brand.toLowerCase();
    let c = byBrand.get(key);
    if (!c) {
      c = { brand: r.brand, deals: 0, platforms: [], bestLabel: r.confidenceLabel, bestScore: r.confidenceScore,
        firstSeen: r.publishedAt, lastSeen: r.publishedAt, repeatPartner: false, isMassSponsor: r.isMassSponsor,
        evidence: r.evidence, contentUrl: r.contentUrl, dates: [] };
      byBrand.set(key, c);
    }
    c.deals++;
    if (!c.platforms.includes(r.platform)) c.platforms.push(r.platform);
    if (r.confidenceScore > c.bestScore) { c.bestScore = r.confidenceScore; c.bestLabel = r.confidenceLabel; c.evidence = r.evidence; c.contentUrl = r.contentUrl; }
    if (r.publishedAt && (!c.firstSeen || r.publishedAt < c.firstSeen)) c.firstSeen = r.publishedAt;
    if (r.publishedAt && r.publishedAt > c.lastSeen) c.lastSeen = r.publishedAt;
    if (r.publishedAt && rank[r.confidenceLabel] >= 2) c.dates.push(r.publishedAt);
  }
  const out: BrandCard[] = [];
  for (const c of byBrand.values()) {
    const ds = c.dates.map((d) => new Date(d).getTime()).filter((n) => !isNaN(n)).sort();
    c.repeatPartner = ds.length >= 2 && ds[ds.length - 1] - ds[0] >= 30 * 86400000;
    const { dates, ...card } = c;
    out.push(card);
  }
  out.sort((a, b) => b.deals - a.deals || b.bestScore - a.bestScore || (b.lastSeen > a.lastSeen ? 1 : -1));
  return out;
}

// A "brand" that shows up in most of a creator's videos is description
// boilerplate (their agency link, music library credit, own merch), not a
// sponsor. Real sponsors appear in a minority of uploads. Explicit sponsor
// grammar ("thanks X for sponsoring") is exempt; URL/credit-style hits are not.
export function dropBoilerplate(rows: PartnershipRow[], itemsChecked: number, share = 0.45, minItems = 6): void {
  if (itemsChecked < minItems) return;
  const perBrand = new Map<string, Set<string>>();
  const explicit = new Set<string>();
  for (const r of rows) {
    const k = r.brand.toLowerCase();
    if (!perBrand.has(k)) perBrand.set(k, new Set());
    perBrand.get(k)!.add(r.contentId);
    if (/sponsor|partner|brought to you|presented by|paid|#ad\b|thank/i.test(r.evidence)) explicit.add(k);
  }
  const boiler = new Set<string>();
  for (const [k, ids] of perBrand) {
    if (ids.size >= minItems && ids.size / itemsChecked >= share && !explicit.has(k)) boiler.add(k);
  }
  if (!boiler.size) return;
  for (let i = rows.length - 1; i >= 0; i--) if (boiler.has(rows[i].brand.toLowerCase())) rows.splice(i, 1);
}
