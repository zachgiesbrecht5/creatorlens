import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { googleAccessToken, createGmailDraft } from "@/lib/gmail";

// POST { brandId, creatorId, contactId?, toEmail }
// 1. gather evidence (this creator x this brand, plus who else the brand books)
// 2. write the pitch with the user's pitch_prompt as the style guide
// 3. create a Gmail draft in the user's own inbox, log it to outreach_log
export async function POST(req: NextRequest) {
  const profile = await currentProfile();
  if (!profile) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { brandId, creatorId, contactId, toEmail } = await req.json().catch(() => ({}));
  if (!brandId || !creatorId || !toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) return NextResponse.json({ error: "Need a brand, a creator, and a valid email" }, { status: 400 });
  const admin = supabaseAdmin();

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

  const { data: ok } = await admin.rpc("spend_credit", { p_user: profile.id, p_kind: "draft", p_reason: "draft", p_ref: `${brand.name}:${creator.handle}` });
  if (!ok) return NextResponse.json({ error: "Out of draft credits" }, { status: 402 });

  const { data: org } = profile.org_id ? await admin.from("orgs").select("name,shared_prompt").eq("id", profile.org_id).single() : { data: null };
  const style = profile.pitch_prompt || org?.shared_prompt || DEFAULT_STYLE;
  const otherCreators = (others || []).map((o: any) => o.creators).filter(Boolean).map((c: any) => `@${c.handle} (${c.followers} followers)`);

  const facts = {
    sender: { name: profile.full_name, email: gc.email, org: org?.name || null, signature: profile.signature || null },
    recipient: { email: toEmail, name: contact?.name || null, title: contact?.title || null },
    brand: { name: brand.name, domain: brand.domain, dealsInOurData: brand.deal_count, creatorsBooked: brand.creator_count, otherCreatorsBooked: otherCreators },
    creator: { handle: creator.handle, name: creator.display_name, platform: creator.platform, followers: creator.followers, category: creator.category, bio: (creator.bio || "").slice(0, 300) },
    priorDealsWithThisBrand: (evidence || []).map((e) => ({ title: e.content_title, url: e.content_url, date: e.published_at?.slice(0, 10), views: e.views, evidence: e.evidence, confidence: e.confidence_label })),
  };

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    max_tokens: 900,
    system: `You write brand-partnership pitch emails on behalf of a creator manager. Follow the sender's STYLE GUIDE exactly; it overrides everything else about tone and structure. Use only the FACTS given; never invent numbers, past deals, or names. If the brand has already worked with this creator, lead with that (rebook). Otherwise position the creator using the brand's other creator bookings as proof of fit. Keep it under 170 words. Output strictly as JSON: {"subject": string, "body": string}. Plain text body, no markdown.`,
    messages: [{ role: "user", content: `STYLE GUIDE:\n${style}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}` }],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  let parsed: { subject: string; body: string };
  try { parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { return NextResponse.json({ error: "Model returned an unreadable draft; try again" }, { status: 502 }); }
  if (profile.signature && !parsed.body.includes(profile.signature)) parsed.body = parsed.body.trimEnd() + `\n\n${profile.signature},\n${profile.full_name || ""}`.trimEnd();

  try {
    const token = await googleAccessToken(gc.refresh_token);
    const d = await createGmailDraft(token, { to: toEmail, subject: parsed.subject, body: parsed.body });
    await admin.from("drafts").insert({ user_id: profile.id, creator_id: creatorId, brand_id: brandId, contact_id: contactId || null, subject: parsed.subject, body: parsed.body, gmail_draft_id: d.id, model: msg.model });
    await admin.from("outreach_log").insert({ org_id: profile.org_id, user_id: profile.id, brand_id: brandId, creator_handle: creator.handle, contact_email: toEmail, subject: parsed.subject, status: "drafted", gmail_draft_id: d.id });
    return NextResponse.json({ ok: true, link: d.link, subject: parsed.subject });
  } catch (e: any) {
    await admin.rpc("grant_credits", { p_user: profile.id, p_kind: "draft", p_n: 1, p_reason: "refund:gmail" });
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

const DEFAULT_STYLE = `Warm, concise, no filler openers, no em dashes. Two short paragraphs then a one-line ask. Mention one concrete piece of evidence (a past deal or the brand's other creator bookings). Never quote a rate; if budget comes up, ask for their range. Sign off with "rooting for you".`;
