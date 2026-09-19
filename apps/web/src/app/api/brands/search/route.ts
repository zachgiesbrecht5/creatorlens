import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Brand typeahead: name match across the whole index, with category, creators
// booked and deal count. Aggregate numbers are public to any signed-in user;
// the depth (which creators, evidence, contacts) is gated on the brand page.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const admin = supabaseAdmin();
  const { data } = await admin.from("brands").select("id,name,domain,category,creator_count,deal_count,is_junk,is_mass_sponsor").ilike("name", `${q}%`).eq("is_junk", false).order("creator_count", { ascending: false }).limit(6);
  let rows = data || [];
  if (rows.length < 6) {
    const { data: more } = await admin.from("brands").select("id,name,domain,category,creator_count,deal_count,is_junk,is_mass_sponsor").ilike("name", `%${q}%`).eq("is_junk", false).order("creator_count", { ascending: false }).limit(8);
    for (const m of more || []) if (!rows.some((r) => r.id === m.id)) rows.push(m);
  }
  return NextResponse.json(rows.slice(0, 8).map((b) => ({ id: b.id, name: b.name, domain: b.domain, category: b.category, creators: b.creator_count, deals: b.deal_count, mass: b.is_mass_sponsor })));
}
