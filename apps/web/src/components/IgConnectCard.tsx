import { supabaseAdmin } from "@/lib/supabase";

type Conn = { ig_username: string; healthy: boolean | null; cooldown_until: string | null; owned: boolean | null };

/** The Instagram connection, where people can see it. Not connected: a card with the button. Connected: one
 *  status line. Each connected account adds its own hourly allowance (200 calls) to the pool and, when it
 *  sits in the business portfolio, its own insights (saves, shares, reach). */
export async function IgConnectCard({ userId, next, who = "manager", status }: { userId: string; next: string; who?: "manager" | "creator"; status?: string }) {
  const { data } = await supabaseAdmin().from("ig_connections").select("ig_username,healthy,cooldown_until,owned").eq("user_id", userId);
  const conns = (data || []) as Conn[];
  const href = `/api/ig/connect?next=${encodeURIComponent(next)}`;
  const cooling = conns.some((c) => c.cooldown_until && new Date(c.cooldown_until) > new Date());
  if (conns.length) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-[12.5px]">
        <span><span className="num mr-2 text-[10px] uppercase tracking-[0.15em] text-ok">Instagram connected</span>{conns.map((c) => `@${c.ig_username}${c.owned ? " · insights on" : ""}`).join(" · ")}{cooling ? <span className="num ml-2 text-[10.5px] text-warn">cooling down after a rate limit</span> : null}{status === "ok" && <span className="num ml-2 text-[10.5px] text-ok">just connected</span>}</span>
        <a href={href} className="num text-[11px] text-muted hover:text-accent">add another account</a>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-5" style={{ borderLeft: "4px solid #E1306C" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <div className="label mb-1">Connect Instagram</div>
          <div className="text-[15px] font-semibold tracking-tight">{who === "creator" ? "Connect your Instagram so your page reads your real numbers" : "Connect an Instagram account to add scanning capacity"}</div>
          <p className="mt-1 text-[13px] text-muted">{who === "creator"
            ? "Saves, shares and reach come straight from your account instead of what's visible publicly, and every connected account gives Sponsorprint another 200 calls an hour for everyone's prints. Business or Creator account linked to a Facebook Page; takes about a minute."
            : "Every Business or Creator account you connect adds its own 200 calls an hour to the pool, so prints and brand scans stop waiting on cooldowns. Accounts in your business portfolio also get daily insights (saves, shares, reach) on their pages."}</p>
          {status && status !== "ok" && <p className="num mt-2 text-[11px] text-bad">{decodeURIComponent(status)}</p>}
          {who === "creator" && <p className="num mt-2 text-[10.5px] text-dim">If Instagram shows "Feature Unavailable", your manager needs to add you to the app first; tell them and try again.</p>}
        </div>
        <a href={href} className="btn-dark whitespace-nowrap">Connect Instagram</a>
      </div>
    </div>
  );
}
