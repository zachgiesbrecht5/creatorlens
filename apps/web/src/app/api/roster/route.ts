import { NextResponse, type NextRequest } from "next/server";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { resolveChannel, lookupIgProfile } from "@creatorlens/engine";
import { track } from "@/lib/track";

// POST { platform, handle } -> looks the creator up on the platform, adds them
// to the roster with name/avatar/followers/bio filled in, returns the row.
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { platform: p, handle: raw } = await req.json().catch(() => ({}));
  const platform = p === "youtube" ? "youtube" : "instagram";
  const handle = String(raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/[^/]+\/(@)?/, "").replace(/\/.*$/, "");
  if (!handle) return NextResponse.json({ error: "Type a handle" }, { status: 400 });
  const admin = supabaseAdmin();

  let row: any = { user_id: profile.id, org_id: profile.org_id || null, platform, handle, name: handle };
  try {
    if (platform === "youtube" && process.env.YT_API_KEY) {
      const ch = await resolveChannel(process.env.YT_API_KEY, handle);
      if (!ch) return NextResponse.json({ error: "No YouTube channel by that handle" }, { status: 404 });
      row = { ...row, handle: ch.handle || handle, name: ch.title, followers: ch.subs ?? null, avatar_url: ch.thumbnail || null, bio: (ch.description || "").slice(0, 400) };
    } else if (platform === "instagram") {
      const { data: tok } = await admin.from("ig_connections").select("ig_user_id,access_token").eq("is_house", true).or("cooldown_until.is.null,cooldown_until.lt.now()").limit(1).maybeSingle();
      const p = tok ? await lookupIgProfile({ igUserId: tok.ig_user_id, accessToken: tok.access_token }, handle) : null;
      if (!p) return NextResponse.json({ error: "Couldn't find that Instagram account (it needs to be a Business or Creator account)" }, { status: 404 });
      row = { ...row, handle: p.username, name: p.name, followers: p.followers, avatar_url: p.avatar };
    }
  } catch (e: any) { return NextResponse.json({ error: "Lookup failed, try again" }, { status: 502 }); }

  const { data: dup } = await admin.from("roster_creators").select("id").eq("user_id", profile.id).eq("platform", platform).ilike("handle", row.handle).maybeSingle();
  if (dup) { const { data } = await admin.from("roster_creators").update({ name: row.name, followers: row.followers, avatar_url: row.avatar_url, bio: row.bio }).eq("id", dup.id).select("*").single(); return NextResponse.json({ creator: data, existed: true }); }
  const { data, error } = await admin.from("roster_creators").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  track(profile.id, "roster_add", { platform, handle: row.handle });
  return NextResponse.json({ creator: data });
}
