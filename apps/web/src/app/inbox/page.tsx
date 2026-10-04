import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { InboxQueue } from "@/components/InboxQueue";

// Review queue: what the inbox watcher found, waiting for one tap. Nothing reaches a creator before approval.
export default async function InboxPage() {
  const profile = await currentProfile(); if (!profile) redirect("/login?next=/inbox");
  const admin = supabaseAdmin();
  const [{ data: items }, { data: roster }, { data: gc }] = await Promise.all([
    admin.from("inbox_items").select("*").eq("user_id", profile.id).neq("kind", "none").order("status", { ascending: true }).order("received_at", { ascending: false }).limit(120),
    admin.from("roster_creators").select("id,name").eq("user_id", profile.id).order("name"),
    admin.from("google_connections").select("email").eq("user_id", profile.id).maybeSingle(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5"><div className="label mb-1">Inbox</div><h1 className="h1">Confirmations to review</h1><p className="mt-1 text-[14px] text-muted">Every hour the watcher reads the last two days of your inbox (read-only) for campaign confirmations, scope and fee changes, invoices and payments, and invitations that mention one of your creators. Approve a card to put it on the creator's page; dismiss what's wrong. Nothing reaches a creator until you approve it.</p></div>
      <InboxQueue items={(items || []) as any} roster={roster || []} watch={!!(profile as any).inbox_watch} note={(profile as any).inbox_note || null} gmailConnected={!!gc} />
    </div>
  );
}
