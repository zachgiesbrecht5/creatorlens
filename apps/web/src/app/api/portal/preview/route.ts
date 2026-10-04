import { NextResponse, type NextRequest } from "next/server";
import { ownRoster } from "@/lib/portal-admin";
// GET ?as=<rosterId> sets the preview cookie and opens /me; ?clear=1 ends the preview.
export async function GET(req: NextRequest) {
  const as = req.nextUrl.searchParams.get("as"); const clear = req.nextUrl.searchParams.get("clear");
  // behind Railway's proxy req.url is the container's own address; build redirects from the public origin
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host") || req.headers.get("host")}`;
  const res = NextResponse.redirect(new URL(clear ? "/creators" : "/me", origin));
  if (clear) { res.cookies.set("sp_preview_as", "", { path: "/", maxAge: 0 }); return res; }
  if (!as || !(await ownRoster(as))) return NextResponse.redirect(new URL("/creators", origin));
  res.cookies.set("sp_preview_as", as, { path: "/", maxAge: 60 * 60, httpOnly: true, sameSite: "lax" });
  return res;
}
