import type { NextRequest } from "next/server";

// Public origin of the app. Behind Railway's proxy, req.url resolves to the
// container's internal host (localhost:3000), so never build redirects from it.
export function publicOrigin(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !/localhost/.test(env)) return env.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host && !/localhost/.test(host)) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export function redirectTo(req: NextRequest, path: string): URL {
  return new URL(path, publicOrigin(req) + "/");
}
