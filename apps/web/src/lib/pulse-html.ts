// Newsletter-style HTML for the weekly pulse and monthly update. Table-based,
// inline styles, background-color + bgcolor (Gmail strips CSS shorthand and
// images), text wordmark instead of a logo. Brand: purple #2E1B5B, green
// #007D2A, pink accent #E85D9B. Parses the four section headings from the
// plain body the model writes, so the manager still edits plain text.

const PURPLE = "#2E1B5B", GREEN = "#007D2A", PINK = "#E85D9B", INK = "#1a1a24", MUTED = "#6b6f80", PAPER = "#f6f5f8", CARD = "#ffffff", LINE = "#e8e6ee";
const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type PulseStats = { projects?: number; pitched?: number; pending?: string | null; paid?: string | null };

const HEADINGS = ["WHAT WE'RE SEEING", "WORTH TESTING", "COMING UP", "ON OUR END"];
const ACCENT: Record<string, string> = { "WHAT WE'RE SEEING": PURPLE, "WORTH TESTING": PINK, "COMING UP": GREEN, "ON OUR END": PURPLE };
const ICON: Record<string, string> = { "WHAT WE'RE SEEING": "&#9673;", "WORTH TESTING": "&#10022;", "COMING UP": "&#9656;", "ON OUR END": "&#9679;" };

/** Split the plain body into {greeting, sections[], closing}. Tolerates headings in any case with or without colons. */
export function parsePulse(body: string) {
  const lines = String(body || "").replace(/\r/g, "").split("\n");
  const isHead = (l: string) => HEADINGS.find((h) => l.trim().replace(/[:\-–—]+$/, "").toUpperCase() === h);
  const sections: { title: string; lines: string[] }[] = []; const pre: string[] = []; let cur: { title: string; lines: string[] } | null = null;
  for (const l of lines) { const h = isHead(l); if (h) { cur = { title: h, lines: [] }; sections.push(cur); continue; } if (cur) cur.lines.push(l); else pre.push(l); }
  // closing: trailing lines of the last section that look like a sign-off
  let closing: string[] = [];
  if (sections.length) { const last = sections[sections.length - 1]; const idx = last.lines.findIndex((l, i) => i > 0 && /^(rooting for you|best|cheers|talk soon|thanks|thank you|warmly)[,!.]?\s*$/i.test(l.trim())); if (idx >= 0) { closing = last.lines.slice(idx); last.lines = last.lines.slice(0, idx); } }
  return { greeting: pre.join("\n").trim(), sections, closing: closing.join("\n").trim() };
}

function paras(lines: string[]) {
  const out: string[] = []; let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 10px 0">${list.map((li) => `<tr><td valign="top" style="padding:3px 10px 3px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:${INK}">&middot;</td><td style="padding:3px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:${INK}">${esc(li)}</td></tr>`).join("")}</table>`); list = []; } };
  for (const raw of lines) { const l = raw.trim(); if (!l) { flush(); continue; } const m = l.match(/^[-•·*]\s+(.*)$/); if (m) { list.push(m[1]); continue; } flush(); out.push(`<p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:${INK}">${esc(l)}</p>`); }
  flush(); return out.join("");
}

export function pulseHtml(opts: { body: string; creatorFirst: string; dateLabel: string; kind: "weekly" | "monthly"; stats?: PulseStats; signatureHtml?: string | null }) {
  const { greeting, sections, closing } = parsePulse(opts.body);
  const stats = opts.stats || {};
  const statCells = [
    stats.projects != null ? [String(stats.projects), "live projects"] : null,
    stats.pitched != null ? [String(stats.pitched), "brands pitched this week"] : null,
    stats.pending ? [stats.pending, "payouts pending"] : null,
    stats.paid ? [stats.paid, "paid this month"] : null,
  ].filter(Boolean) as string[][];
  const statRow = statCells.length ? `<tr><td style="padding:0 28px 8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${statCells.map(([v, l]) => `<td width="${Math.floor(100 / statCells.length)}%" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${LINE};border-radius:10px;padding:14px 12px;text-align:center"><div style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;color:${PURPLE};line-height:26px">${esc(v)}</div><div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${MUTED};margin-top:2px">${esc(l)}</div></td>`).join(`<td width="10">&nbsp;</td>`)}</tr></table></td></tr>` : "";
  const sectionHtml = sections.length ? sections.map((s) => `<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${LINE};border-radius:12px"><tr><td width="6" bgcolor="${ACCENT[s.title]}" style="background-color:${ACCENT[s.title]};border-radius:12px 0 0 12px">&nbsp;</td><td style="padding:16px 18px 10px 18px"><div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;color:${ACCENT[s.title]};font-weight:700;margin-bottom:8px">${ICON[s.title]} ${esc(s.title)}</div>${paras(s.lines)}</td></tr></table></td></tr>`).join("") : `<tr><td style="padding:8px 28px">${paras(opts.body.split("\n"))}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background-color:${PAPER}" bgcolor="${PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
  <tr><td bgcolor="${PURPLE}" style="background-color:${PURPLE};border-radius:14px 14px 0 0;padding:22px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:3px;color:#ffffff">ROOTFOR</td>
      <td align="right" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1.5px;color:#c9c0e3">${opts.kind === "weekly" ? "WEEKLY PULSE" : "MONTHLY UPDATE"}</td>
    </tr></table>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#ffffff;margin-top:14px;line-height:30px">${esc(opts.creatorFirst)}, here's your ${opts.kind === "weekly" ? "week" : "month"}.</div>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#c9c0e3;margin-top:4px">${esc(opts.dateLabel)}</div>
  </td></tr>
  <tr><td bgcolor="${PINK}" style="background-color:${PINK};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
  ${greeting ? `<tr><td style="padding:18px 28px 6px 28px">${paras(greeting.split("\n"))}</td></tr>` : `<tr><td style="padding:12px 0 0 0"></td></tr>`}
  ${statRow}
  ${sectionHtml}
  ${closing ? `<tr><td style="padding:10px 28px 4px 28px">${paras(closing.split("\n"))}</td></tr>` : ""}
  ${opts.signatureHtml ? `<tr><td style="padding:6px 28px 10px 28px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:${INK}">${opts.signatureHtml}</td></tr>` : ""}
  <tr><td style="padding:16px 28px 26px 28px;border-top:1px solid ${LINE};font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${MUTED};line-height:17px">Sent by your team at Rootfor Group. Reply to this email any time; it lands with your manager. Project status and payouts also live on your Sponsorprint page.</td></tr>
</table></td></tr></table></body></html>`;
}
