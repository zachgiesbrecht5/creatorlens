import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
// GET ?as=<rosterId> sets the preview cookie and opens /me; ?clear=1 ends the preview.
export async function GET(req: NextRequest) {
  const as = req.nextUrl.searchParams.get("as"); const clear = req.nextUrl.searchParams.get("clear");
  const res = NextResponse.redirect(new URL(clear ? "/creators" : "/me", req.url));
  if (clear) { res.cookies.set("sp_preview_as", "", { path: "/", maxAge: 0 }); return res; }
  if (!as || !(await ownRoster(as))) return NextResponse.redirect(new URL("/creators", req.url));
  res.cookies.set("sp_preview_as", as, { path: "/", maxAge: 60 * 60, httpOnly: true, sameSite: "lax" });
  return res;
}
