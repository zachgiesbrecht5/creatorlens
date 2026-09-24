// Gmail draft creation with the user's own refresh token (scope gmail.compose).
// Drafts only. Nothing here can send.

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const j: any = await r.json();
  if (!r.ok || !j.access_token) throw new Error("Google token refresh failed: " + (j.error_description || j.error || r.status));
  return j.access_token;
}

function b64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The user's default Gmail signature (HTML) via the sendAs settings. Needs gmail.settings.basic. */
export async function fetchGmailSignature(accessToken: string): Promise<{ email: string; signature: string } | null> {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", { headers: { authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const j: any = await r.json();
  const list: any[] = j.sendAs || [];
  const primary = list.find((a) => a.isDefault) || list.find((a) => a.isPrimary) || list[0];
  if (!primary) return null;
  return { email: primary.sendAsEmail, signature: primary.signature || "" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Plain text pitch -> simple HTML paragraphs, then the user's real signature HTML underneath. */
export function bodyToHtml(body: string, signatureHtml?: string | null, link?: { handle: string; url: string } | null) {
  const linkify = (t: string) => (link ? t.replace(new RegExp(`@${link.handle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`, "gi"), `<a href="${link.url}" target="_blank">@${link.handle}</a>`) : t);
  const paras = body.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 1em 0">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${paras}${signatureHtml ? `<div>${signatureHtml}</div>` : ""}</div>`;
}

export async function createGmailDraft(accessToken: string, opts: { to: string; subject: string; body: string; from?: string; html?: string }) {
  const boundary = "sp_" + Math.random().toString(36).slice(2);
  const mime = [
    opts.from ? `From: ${opts.from}` : null,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    ...(opts.html ? [
      `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
      `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", opts.body, "",
      `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", opts.html, "",
      `--${boundary}--`,
    ] : ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", opts.body]),
  ].filter((l) => l !== null).join("\r\n");
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { raw: b64url(mime) } }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error("Gmail draft failed: " + (j.error?.message || r.status));
  return { id: j.id as string, messageId: j.message?.id as string, link: `https://mail.google.com/mail/u/0/#drafts?compose=${j.message?.id}` };
}
