import crypto from "node:crypto";

// Meta sends a `signed_request` (base64url(sig).base64url(json)) signed with the app secret.
export function parseSignedRequest(signed: string): { user_id?: string; [k: string]: unknown } | null {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signed?.includes(".")) return null;
  const [sig, payload] = signed.split(".", 2);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  const got = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try { return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { return null; }
}
