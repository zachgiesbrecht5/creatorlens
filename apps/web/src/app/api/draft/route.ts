import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentProfile, currentAccess, canSeeCreator, supabaseAdmin } from "@/lib/supabase";
import { track, alert } from "@/lib/track";
import { googleAccessToken, createGmailDraft, bodyToHtml } from "@/lib/gmail";

// POST { brandId, creatorId, rosterCreatorId, contactId?, toEmail }
// creatorId       = the scanned creator whose deal with this brand is the PROOF
// rosterCreatorId = the user's own creator being PITCHED
// 1. gather evidence (brand x scanned creator, who else the brand books)
// 2. write the pitch for the roster creator with the user's pitch_prompt as style guide
// 3. append the user's email signature verbatim, create a Gmail draft, log it
// Public profile URL for a roster creator, so the brand can click through.
function profileUrlFor(platform: string | null, handle: string | null): string | null {
  const h = (handle || "").replace(/^@/, "").trim();
  if (!h) return null;
  if (platform === "youtube") return `https://www.youtube.com/@${h}`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  return `https://www.instagram.com/${h}/`;
}

export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId, creatorId, rosterCreatorId, contactId, toEmail } = await req.json().catch(() => ({}));
  if (!brandId || !creatorId || !toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) return NextResponse.json({ error: "Need a brand, a creator, and a valid email" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: mine } = rosterCreatorId ? await admin.from("roster_creators").select("*").eq("id", rosterCreatorId).eq("user_id", profile.id).maybeSingle() : { data: null };
  if (!mine) return NextResponse.json({ error: "Pick one of your own creators to pitch (add them in Settings)." }, { status: 400 });

  // Gmail connection is optional. With one, the draft lands silently in the
  // user's Drafts folder. Without one (or if the token has expired), we return
  // a prefilled Gmail compose URL the client opens in a new tab.
  const { data: gc } = await admin.from("google_connections").select("refresh_token,email").eq("user_id", profile.id).maybeSingle();

  const [{ data: brand }, { data: creator }, { data: evidence }, { data: others }, { data: contact }] = await Promise.all([
    admin.from("brands").select("name,domain,deal_count,creator_count").eq("id", brandId).single(),
    admin.from("creators").select("handle,display_name,platform,followers,bio,category,external_id").eq("id", creatorId).single(),
    admin.from("partnerships").select("content_title,content_url,published_at,views,evidence,confidence_label").eq("brand_id", brandId).eq("creator_id", creatorId).neq("status", "rejected").order("published_at", { ascending: false }).limit(5),
    admin.from("partnerships").select("creators(handle,display_name,followers)").eq("brand_id", brandId).neq("creator_id", creatorId).limit(6),
    contactId ? admin.from("contacts").select("name,title").eq("id", contactId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!brand || !creator) return NextResponse.json({ error: "Missing brand or creator" }, { status: 404 });
  const { admin: seesAll } = await currentAccess();
  if (!(await canSeeCreator(profile.id, seesAll, creator as any))) return NextResponse.json({ error: "Scan this creator first to draft from their deals." }, { status: 403 });

  const { data: ok } = await admin.rpc("spend_credit", { p_user: profile.id, p_kind: "draft", p_reason: "draft", p_ref: `${brand.name}:${mine.handle || mine.name}` });
  if (!ok) { track(profile.id, "draft_locked", { brand: brand.name }); return NextResponse.json({ error: "Out of draft credits" }, { status: 402 }); }

  const { data: org } = profile.org_id ? await admin.from("orgs").select("name,shared_prompt").eq("id", profile.org_id).single() : { data: null };
  const style = profile.pitch_prompt || org?.shared_prompt || DEFAULT_STYLE;
  // Proof points: display names only, never handles in prose, at most two.
  const nice = (c: any) => (c?.display_name && !/^@|^[a-z0-9_.]+$/.test(c.display_name) ? c.display_name : c?.display_name || c?.handle || "").replace(/^@/, "").trim();
  const fmtK = (n: number | null) => (n ? (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n)) : null);
  const proofPoints = [{ name: nice(creator), followers: fmtK(creator.followers), category: creator.category },
    ...(others || []).map((o: any) => o.creators).filter(Boolean).map((c: any) => ({ name: nice(c), followers: fmtK(c.followers), category: null }))]
    .filter((p) => p.name).slice(0, 2);

  // The pitched creator's own past partners, from their print if they're in the index (real names only).
  const { data: mineRow } = await admin.from("creators").select("id").eq("platform", mine.platform === "youtube" ? "youtube" : "instagram").ilike("handle", String(mine.handle || "").replace(/^@/, "")).maybeSingle();
  const { data: mineWall } = mineRow ? await admin.from("brand_wall").select("brand,deals,last_seen").eq("creator_id", mineRow.id).eq("is_junk", false).eq("is_self_brand", false).eq("is_mass_sponsor", false).neq("best_label", "Low").order("last_seen", { ascending: false }).limit(6) : { data: [] };
  const ownPartners = (mineWall || []).map((w) => w.brand).filter((b) => b.toLowerCase() !== brand.name.toLowerCase()).slice(0, 3);
  const { data: brandRow } = await admin.from("brands").select("category,site_title,site_description").eq("id", brandId).maybeSingle();
  const q = Math.floor(new Date().getMonth() / 3) + 1;
  const askQuarter = q === 4 ? `Q1 ${new Date().getFullYear() + 1}` : `Q${q + 1}`;
  const senderFirst = (profile.full_name || "").trim().split(/\s+/)[0] || "";
  const facts = {
    askQuarter,
    creatorOwnPartners: ownPartners,
    brandWhatTheySell: [brandRow?.category, brandRow?.site_title, (brandRow?.site_description || "").slice(0, 200)].filter(Boolean).join(" · ") || null,
    sender: { name: profile.full_name, email: gc?.email || profile.email || null, org: org?.name || null, signOff: profile.signature || null },
    creatorBeingPitched: { name: mine.name, handle: mine.handle, platform: mine.platform, followers: mine.followers, niche: mine.niche, pitchAngle: mine.pitch_angle, mediaKit: mine.media_kit_url, profileUrl: profileUrlFor(mine.platform, mine.handle) },
    recipient: { email: toEmail, name: contact?.name || null, title: contact?.title || null },
    brand: { name: brand.name, domain: brand.domain, dealsInOurData: brand.deal_count, creatorsBooked: brand.creator_count },
    proofPoints: { note: "Creators this brand has ALREADY booked (public posts). NOT represented by the sender. Use at most one of these, by name, as social proof.", creators: proofPoints },
    brandDealsWithProofCreator: (evidence || []).map((e) => ({ title: e.content_title, url: e.content_url, date: e.published_at?.slice(0, 10), views: e.views, evidence: e.evidence, confidence: e.confidence_label })),
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    max_tokens: 900,
    system: `You write one brand-partnership pitch email from a talent manager (the sender) to a brand, for creatorBeingPitched. Follow this exact structure; it is tuned on thousands of sent pitches and a reply-rate audit, so do not improvise the shape.

LINE 1 (greeting): "Hi <recipient first name>!" if recipient.name is known, otherwise "Hi <brand> team!".
PARAGRAPH 1 (four sentences, in this order):
  1. Intro: "I'm <sender first name>, <sender role> of <sender org>." (use sender.name and sender.org; if org is missing, "I'm <first name>, a talent manager.")
  2. CONCEPT sentence: name a specific video or post that does not exist yet, in this creator's own format, built on a concrete detail about what THIS brand sells (use brandWhatTheySell and brandDealsWithProofCreator). Where possible tie it to a dated moment ("for December houseguests", "before back to school", "for the ${"$"}{askQuarter} launch window"). Never "could be a strong fit" or "your customers are her audience". This sentence earns the reply.
  3. CREDIBILITY sentence: who the creator is and why they are the right person to tell that story; include their follower count and market HERE and never earlier (e.g. "... and @handle reaches 202K on Instagram out of LA"). Write the handle exactly as creatorBeingPitched.handle with the @.
  4. PROOF sentence: "She/He/They has recently partnered with brands like A and B." using ONLY creatorOwnPartners. If that list is empty, use one clause of social proof about the brand instead: "You've worked with creators like <proofPoints name>" (display name exactly as given, never a handle), or omit the sentence entirely. Never invent partners or numbers.
PARAGRAPH 2 (the ask, verbatim, adjust only pronoun/name/quarter): "Are you booking paid creator partnerships for ${"$"}{askQuarter}? Would love to make something happen with <creator first name>. Happy to send over <his/her/their> media kit and rates!"
OPTIONAL, only when recipient.title is adjacent to influencer/partnerships (e.g. PR, brand, social, community): add one final line: "I realize influencer partnerships may not fall under your scope directly, if there's a better person on the team I should be connecting with, I'd really appreciate the nudge in the right direction."

Rules: plain text; no bullet points; no em dashes or en dashes anywhere; no hype words (excited, amazing, perfect, incredible, love to explore); at most one exclamation mark outside the greeting and the ask; no rates or numbers other than the follower count and real view counts; never describe the proof creator's content or family; do not add a sign-off or signature (appended automatically); under 140 words. If the sender has a STYLE GUIDE in the user message, apply it only to word choice, not to the structure above. Output strictly JSON: {"subject": string, "body": string}.`,
    messages: [{ role: "user", content: `STYLE GUIDE:\n${style}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}` }],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  let parsed: { subject: string; body: string };
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Model returned an unreadable draft; try again" }, { status: 502 }); }
  // Subject is always "<creator> x <brand>", nothing clever.
  const h = String(mine.handle || "").replace(/^@/, "");
  parsed.subject = h && mine.platform !== "youtube" ? `@${h} x ${brand.name}` : `${mine.name} x ${brand.name}`;
  // Profile link guard: the brand must be able to click through to the creator.
  const purl = profileUrlFor(mine.platform, mine.handle);
  if (purl && !parsed.body.includes(purl) && !parsed.body.toLowerCase().includes(`@${h.toLowerCase()}`)) parsed.body = parsed.body.trimEnd() + `\n\nProfile: ${purl}`;
  // The proof creator is never named by handle; the pitched creator's own handle stays (the template links it).
  parsed.body = parsed.body.replace(/@([a-z0-9_.]{3,})/gi, (_m, hh) => (hh.toLowerCase() === String(creator.handle).toLowerCase() ? nice(creator) : `@${hh}`));
  // Greeting guard: if the model skipped it, add one.
  const firstName = (contact?.name || "").trim().split(/\s+/)[0] || "";
  if (!/^\s*(hi|hey|hello|dear)\b/i.test(parsed.body)) parsed.body = `Hi ${firstName || brand.name + " team"}!\n\n` + parsed.body.trimStart();
  // Strip any sign-off the model added anyway, then append the user's own.
  parsed.body = parsed.body.replace(/\n+\s*(best|thanks|cheers|regards|rooting for you|talk soon)[,!.]?\s*(\n.*)?$/i, "").trimEnd();
  const signOff = (profile.signature || "Best").replace(/,\s*$/, "") + ",";
  // strip any dash the model slipped in
  parsed.body = parsed.body.replace(/\s[\u2013\u2014]\s/g, ", ").replace(/[\u2013\u2014]/g, ",");
  // In the Gmail compose window Gmail inserts the user's real (formatted) signature itself,
  // so we only add the sign-off line there. A Gmail API draft gets no automatic signature,
  // so we append the plain-text one from Settings.
  const plainSig = (profile.email_signature || "").trim() || [profile.full_name || "", org?.name || ""].filter(Boolean).join("\n");
  const bodyForCompose = parsed.body + "\n\n" + signOff;
  // API drafts: the user's REAL Gmail signature (HTML, imported when they connected Gmail); plain-text block only as a fallback
  const bodyForApi = parsed.body + "\n\n" + signOff + (profile.signature_html ? "" : "\n" + plainSig);
  const htmlForApi = bodyToHtml(parsed.body + "\n\n" + signOff, profile.signature_html || null, h && purl ? { handle: h, url: purl } : null);
  parsed.body = bodyForApi;

  // a pasted address becomes a private contact for this user only (never shared)
  if (!contactId && toEmail) {
    await admin.from("contacts").upsert({ brand_id: brandId, email: toEmail.toLowerCase(), source: "manual", found_by: profile.id, house_only: false }, { onConflict: "brand_id,email", ignoreDuplicates: true });
  }
  track(profile.id, "draft", { brand: brand.name, creator: mine.handle || mine.name, mode: gc ? "gmail" : "compose" });
  const logDraft = async (gmailDraftId: string | null) => {
    await admin.from("drafts").insert({ user_id: profile.id, creator_id: creatorId, brand_id: brandId, contact_id: contactId || null, subject: parsed.subject, body: parsed.body, gmail_draft_id: gmailDraftId, model: msg.model });
    await admin.from("outreach_log").insert({ org_id: profile.org_id, user_id: profile.id, brand_id: brandId, creator_handle: mine.handle || mine.name, contact_email: toEmail, subject: parsed.subject, status: "drafted", gmail_draft_id: gmailDraftId });
  };

  if (gc) {
    try {
      const token = await googleAccessToken(gc.refresh_token);
      const d = await createGmailDraft(token, { to: toEmail, subject: parsed.subject, body: parsed.body, html: htmlForApi });
      await logDraft(d.id);
      return NextResponse.json({ ok: true, mode: "gmail", link: d.link, subject: parsed.subject });
    } catch (e: any) {
      // expired/revoked token (7-day expiry while the Google app is in Testing): fall through to compose
      console.warn("gmail draft failed, falling back to compose:", e?.message);
      alert("gmail draft failed, fell back to compose", { user: profile.email, error: String(e?.message || e).slice(0, 200) });
    }
  }
  await logDraft(null);
  return NextResponse.json({ ok: true, mode: "compose", link: gmailComposeUrl({ to: toEmail, subject: parsed.subject, body: bodyForCompose }), subject: parsed.subject, body: bodyForCompose });
}

// Prefilled Gmail compose window. No API, no OAuth scope, works for any Google
// account; the user reviews and either sends or closes it (Gmail keeps a draft).
function gmailComposeUrl({ to, subject, body }: { to: string; subject: string; body: string }) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

const DEFAULT_STYLE = `Warm, concise, no filler openers, no em dashes. Two short paragraphs then a one-line ask. Mention one concrete piece of evidence (a past deal or the brand's other creator bookings). Never quote a rate; if budget comes up, ask for their range.`;
