import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";

const REGION: Record<string, string> = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", alberta: "AB", "british columbia": "BC", manitoba: "MB", ontario: "ON", quebec: "QC", saskatchewan: "SK", "nova scotia": "NS", "new brunswick": "NB", nyc: "NY", "new york city": "NY", "los angeles": "CA", "la": "CA", denver: "CO", chicago: "IL", houston: "TX", dallas: "TX", austin: "TX", miami: "FL", atlanta: "GA", seattle: "WA", portland: "OR", phoenix: "AZ", boston: "MA", philadelphia: "PA", toronto: "ON", vancouver: "BC", winnipeg: "MB", montreal: "QC", calgary: "AB", nashville: "TN", "las vegas": "NV", minneapolis: "MN", detroit: "MI", "san francisco": "CA", "san diego": "CA" };
export function regionFor(location: string): string | null {
  const l = location.toLowerCase();
  const m = l.match(/\b([a-z]{2})\b\s*$/); if (m && Object.values(REGION).includes(m[1].toUpperCase())) return m[1].toUpperCase();
  for (const [k, v] of Object.entries(REGION)) if (l.includes(k)) return v;
  return null;
}

// PATCH { rosterCreatorId, location } -> set where a creator is based
export async function PATCH(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { rosterCreatorId, location } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: rc } = await admin.from("roster_creators").select("id,user_id").eq("id", rosterCreatorId).single();
  if (!rc || rc.user_id !== profile.id) return NextResponse.json({ error: "Not yours" }, { status: 403 });
  const loc = String(location || "").trim().slice(0, 80);
  await admin.from("roster_creators").update({ location: loc || null, region: loc ? regionFor(loc) : null }).eq("id", rc.id);
  return NextResponse.json({ ok: true, region: loc ? regionFor(loc) : null });
}

// POST marks matches seen
export async function POST() {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await supabaseAdmin().from("signal_matches").update({ seen: true }).eq("user_id", profile.id).eq("seen", false);
  return NextResponse.json({ ok: true });
}
