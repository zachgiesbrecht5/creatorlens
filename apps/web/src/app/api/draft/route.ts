import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { googleAccessToken, createGmailDraft } from "@/lib/gmail";

// POST { brandId, creatorId, rosterCreatorId, contactId?, toEmail }
// creatorId       = the scanned creator whose deal with this brand is the PROOF
// rosterCreatorId = the user's own creator being PITCHED
// 1. gather evidence (brand x scanned creator, who else the brand books)
// 2. write the pitch for the roster creator with the user's pitch_prompt as style guide
// 3. append the user's email signature verbatim, create a Gmail draft, log it
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId, creatorId, rosterCreatorId, contactId, toEmail } = await req.json().catch(() => ({}));
  if (!brandId || !creatorId || !toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) return NextResponse.json({ error: "Need a brand, a creator, and a valid email" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: mine } = rosterCreatorId ? await admin.from("roster_creators").select("*").eq("id", rosterCreatorId).eq("user_id", profile.id).maybeSingle() : { data: null };
  if (!mine) return NextResponse.json({ error: "Pick one of your own creators to pitch (add them in Settings)." }, { status: 400 });

  const { data: gc } = await admin.from("google_connections").select("refresh_token,email").eq("user_id", profile.id).maybeSingle();
  if (!gc) return NextResponse.json({ error: "Gmail is not connected. Sign out and back in to grant draft access." }, { status: 412 });

  const [{ data: brand }, { data: creator }, { data: evidence }, { data: others }, { data: contact }] = await Promise.all([
    admin.from("brands").select("name,domain,deal_count,creator_count").eq("id", brandId).single(),
    admin.from("creators").select("handle,display_name,platform,followers,bio,category").eq("id", creatorId).single(),
    admin.from("partnerships").select("content_title,content_url,published_at,views,evidence,confidence_label").eq("brand_id", brandId).eq("creator_id", creatorId).neq("status", "rejected").order("published_at", { ascending: false }).limit(5),
    admin.from("partnerships").select("creators(handle,display_name,followers)").eq("brand_id", brandId).neq("creator_id", creatorId).limit(6),
    contactId ? admin.from("contacts").select("name,title").eq("id", contactId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!brand || !creator) return NextResponse.json({ error: "Missing brand or creator" }, { status: 404 });

  const { data: ok } = await admin.rpc("spend_credit", { p_user: profile.id, p_kind: "draft", p_reason: "draft", p_ref: `${brand.name}:${mine.handle || mine.name}` });
  if (!ok) return NextResponse.json({ error: "Out of draft credits" }, { status: 402 });

  const { data: org } = profile.org_id ? await admin.from("orgs").select("name,shared_prompt").eq("id", profile.org_id).single() : { data: null };
  const style = profile.pitch_prompt || org?.shared_prompt || DEFAULT_STYLE;
  const otherCreators = (others || []).map((o: any) => o.creators).filter(Boolean).map((c: any) => `@${c.handle} (${c.followers} followers)`);

  const facts = {
    sender: { name: profile.full_name, email: gc.email, org: org?.name || null, signOff: profile.signature || null },
    creatorBeingPitched: { name: mine.name, handle: mine.handle, platform: mine.platform, followers: mine.followers, niche: mine.niche, pitchAngle: mine.pitch_angle, mediaKit: mine.media_kit_url },
    recipient: { email: toEmail, name: contact?.name || null, title: contact?.title || null },
    brand: { name: brand.name, domain: brand.domain, dealsInOurData: brand.deal_count, creatorsBooked: brand.creator_count, otherCreatorsBooked: otherCreators },
    proofCreator: { note: "NOT represented by the sender. This creator's deal with the brand is evidence the brand books this kind of creator.", handle: creator.handle, name: creator.display_name, platform: creator.platform, followers: creator.followers, category: creator.category },
    brandDealsWithProofCreator: (evidence || []).map((e) => ({ title: e.content_title, url: e.content_url, date: e.published_at?.slice(0, 10), views: e.views, evidence: e.evidence, confidence: e.confidence_label })),
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    max_tokens: 900,
    system: `You write brand-partnership pitch emails for a talent manager (the sender) who represents creatorBeingPitched. The sender does NOT represent proofCreator; proofCreator's deal with this brand is only evidence that the brand invests in creators of this kind. Never imply the sender manages proofCreator and never ask to "rebook" them. Lead with why creatorBeingPitched fits this brand, using pitchAngle and niche; reference the brand's recent creator work (proofCreator, other bookings) as social proof in one clause at most. Follow the sender's STYLE GUIDE exactly; it overrides everything else about tone and structure. Use only the FACTS given; never invent numbers, past deals, or names. Never quote a rate. Keep it under 170 words. Do NOT add a sign-off or signature; the sender's signature is appended automatically. Output strictly as JSON: {"subject": string, "body": string}. Plain text body, no markdown.`,
    messages: [{ role: "user", content: `STYLE GUIDE:\n${style}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}` }],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  let parsed: { subject: string; body: string };
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Model returned an unreadable draft; try again" }, { status: 502 }); }
  const sig = (profile.email_signature || "").trim() || [profile.signature ? `${profile.signature},` : "Best,", profile.full_name || "", org?.name || ""].filter(Boolean).join("\n");
  parsed.body = parsed.body.trimEnd() + "\n\n" + sig;

  try {
    const token = await googleAccessToken(gc.refresh_token);
    const d = await createGmailDraft(token, { to: toEmail, subject: parsed.subject, body: parsed.body });
    await admin.from("drafts").insert({ user_id: profile.id, creator_id: creatorId, brand_id: brandId, contact_id: contactId || null, subject: parsed.subject, body: parsed.body, gmail_draft_id: d.id, model: msg.model });
    await admin.from("outreach_log").insert({ org_id: profile.org_id, user_id: profile.id, brand_id: brandId, creator_handle: mine.handle || mine.name, contact_email: toEmail, subject: parsed.subject, status: "drafted", gmail_draft_id: d.id });
    return NextResponse.json({ ok: true, link: d.link, subject: parsed.subject });
  } catch (e: any) {
    await admin.rpc("grant_credits", { p_user: profile.id, p_kind: "draft", p_n: 1, p_reason: "refund:gmail" });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

const DEFAULT_STYLE = `Warm, concise, no filler openers, no em dashes. Two short paragraphs then a one-line ask. Mention one concrete piece of evidence (a past deal or the brand's other creator bookings). Never quote a rate; if budget comes up, ask for their range.`;
