import { NextResponse, type NextRequest } from "next/server";
import { creatorContext } from "@/lib/creator-portal";
import { supabaseAdmin } from "@/lib/supabase";
export async function POST(req: NextRequest) {
  const ctx = await creatorContext(); if (!ctx || !ctx.enabled) return NextResponse.json({ error: "Not available" }, { status: 403 });
  const { text } = await req.json().catch(() => ({}));
  if (!String(text || "").trim()) return NextResponse.json({ error: "Write something" }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("requests").insert({ roster_creator_id: ctx.roster.id, text: String(text).trim().slice(0, 1000), created_by: "creator" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
