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

export async function createGmailDraft(accessToken: string, opts: { to: string; subject: string; body: string; from?: string }) {
  const mime = [
    opts.from ? `From: ${opts.from}` : null,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    opts.body,
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
