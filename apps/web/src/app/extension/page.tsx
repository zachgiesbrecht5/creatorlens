import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/supabase";
import { feedUrl } from "@/lib/ext";
import { ExtConnect } from "@/components/ExtConnect";

export const dynamic = "force-dynamic";
export const metadata = { title: "YouTube extension | Sponsorprint" };

export default async function ExtensionPage() {
  const me = await currentProfile();
  if (!me) redirect("/login?next=/extension");
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Chrome extension</span>
        <h1 className="text-[28px] font-semibold tracking-tight">Pull the print without leaving YouTube.</h1>
        <p className="text-[14px] text-muted">A Sponsorprint button sits on every channel and video. It tells you when a print already exists, and one click pulls it. Nothing is scanned until you click.</p>
      </div>
      <ExtConnect feedUrl={me.api_key ? feedUrl(me.id, me.api_key) : null} />
    </main>
  );
}
