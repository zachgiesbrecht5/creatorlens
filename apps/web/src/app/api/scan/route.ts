import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase";
import { startScan } from "@/lib/scan-start";

// POST { platform, handle } -> { handle, cached, jobId? }
// Cache-first: a creator scanned in the last 14 days costs nothing and no job
// is queued. Otherwise spend one scan credit and enqueue. Logic lives in lib/scan-start.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const r = await startScan(user.id, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { ok: _ok, ...out } = r;
  return NextResponse.json(out);
}
