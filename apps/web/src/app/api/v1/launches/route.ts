import { NextResponse, type NextRequest } from "next/server";
import { profileFromKey } from "@/lib/api-key";
import { laneLaunches, laneLaunchesAll } from "@/lib/launches";
// GET /api/v1/launches?lane=Parenting  (or no lane for everything) : brand launches with pitch windows.
export async function GET(req: NextRequest) {
  const profile = await profileFromKey(req); if (!profile) return NextResponse.json({ error: "Missing or invalid API key" }, { status: 401 });
  const lane = req.nextUrl.searchParams.get("lane");
  const list = lane ? await laneLaunches(lane) : await laneLaunchesAll();
  return NextResponse.json({ lane: lane || "all", count: list.length, launches: list.map((l) => ({ brand: l.brand, website: l.website, kind: l.kind, product: l.product, summary: l.summary, posted_at: l.posted_at, said: l.spoken || l.on_video || null, window: l.status, window_start: l.window_start, window_end: l.window_end, repush_month: l.repush_month, lane_creators_paid: l.lane_creators, url: l.url, brand_url: `https://sponsorprint.com/brands/${l.brand_id}` })) });
}
