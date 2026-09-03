import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Autocomplete over OUR database first (zero quota). Falls back to a YouTube
// channel search (100 units) only when the query looks like a name and we
// have nothing cached, and only for signed-in users via /api/scan.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().replace(/^@/, "");
  if (q.length < 2) return NextResponse.json([]);
  const admin = supabaseAdmin();
  const { data } = await admin.from("creators")
    .select("platform,handle,display_name,avatar_url,followers")
    .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order("followers", { ascending: false }).limit(8);
  return NextResponse.json((data || []).map((c) => ({ ...c, cached: true })));
}
