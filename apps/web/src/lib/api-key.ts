import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
/** Resolve a profile from `Authorization: Bearer sp_…` or `?key=`. Read-only endpoints only. */
export async function profileFromKey(req: NextRequest) {
  const h = req.headers.get("authorization") || ""; const key = (h.match(/^Bearer\s+(\S+)/i)?.[1] || req.nextUrl.searchParams.get("key") || "").trim();
  if (!key.startsWith("sp_")) return null;
  const { data } = await supabaseAdmin().from("profiles").select("id,email,plan,org_id").eq("api_key", key).maybeSingle();
  return data || null;
}
