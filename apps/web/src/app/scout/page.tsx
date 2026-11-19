import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile, supabaseAdmin } from "@/lib/supabase";
import { ScoutBoard, ScoutQueries, type ScoutCandidate, type ScoutQuery } from "@/components/ScoutBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scout | Sponsorprint" };

const TABS = [["new", "New"], ["shortlisted", "Shortlist"], ["contacted", "Contacted"], ["dismissed", "Dismissed"]] as const;

export default async function Scout({ searchParams }: { searchParams: Promise<{ tab?: string; lane?: string; open?: string }> }) {
  const me = await currentProfile();
  if (!me) redirect("/login?next=/scout");
  if (me.plan !== "admin") redirect("/");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "new";
  const lane = sp.lane || null;
  const openOnly = sp.open === "1";   // only channels with no sponsors found
  const admin = supabaseAdmin();
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);

  let q = admin.from("scout_candidates").select("*").eq("status", tab).order("found_at", { ascending: false }).limit(200);
  if (lane) q = q.eq("lane", lane);
  if (openOnly) q = q.eq("sponsors", 0);
  const [cands, queries, runs, counts] = await Promise.all([
    q,
    admin.from("scout_queries").select("id,query,lane,active,last_run_at,runs,found").order("lane").order("query"),
    admin.from("scout_runs").select("units,kept,error,created_at").gte("created_at", day.toISOString()).order("created_at", { ascending: false }).limit(200),
    Promise.all(TABS.map(([k]) => admin.from("scout_candidates").select("id", { count: "exact", head: true }).eq("status", k))),
  ]);
  // strongest breakout first within the tab
  const candidates = ((cands.data || []) as ScoutCandidate[]).sort((a, b) => (tab === "new" ? Number(b.mult || 0) - Number(a.mult || 0) : 0));
  const qs = (queries.data || []) as ScoutQuery[];
  const lanes = [...new Set(qs.map((x) => x.lane).filter(Boolean))] as string[];
  const todays = runs.data || [];
  const units = todays.reduce((s, r: any) => s + (r.units || 0), 0);
  const lastError = todays.find((r: any) => r.error)?.error as string | undefined;
  const href = (p: Record<string, string | null>) => { const u = new URLSearchParams(); const all = { tab, lane, open: openOnly ? "1" : null, ...p }; for (const [k, v] of Object.entries(all)) if (v && !(k === "tab" && v === "new")) u.set(k, v); const s = u.toString(); return s ? `/scout?${s}` : "/scout"; };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-10">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">Scout</span>
        <h1 className="text-[28px] font-semibold tracking-tight">Channels worth a conversation.</h1>
        <p className="text-[14px] text-muted">The scout searches YouTube around the clock for mid-size channels whose latest video ran far above their own usual views, prints them, and shows who is paying them. It can't see who already has a manager, so check before you reach out.</p>
        <p className="font-mono text-[11px] text-muted">Today: {todays.length} search{todays.length === 1 ? "" : "es"} · {todays.reduce((s, r: any) => s + (r.kept || 0), 0)} channels filed · {units.toLocaleString()} YouTube units{lastError ? ` · last error: ${lastError.slice(0, 120)}` : ""}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {TABS.map(([k, label], i) => (
          <Link key={k} href={href({ tab: k })} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-fg text-white" : "border border-line hover:border-fg"}`}>{label} <span className="font-mono text-[11px] opacity-70">{counts[i].count || 0}</span></Link>
        ))}
        <span className="mx-1 text-muted">·</span>
        <Link href={href({ open: openOnly ? null : "1" })} className={`rounded-md px-3 py-1.5 ${openOnly ? "bg-fg text-white" : "border border-line hover:border-fg"}`}>No sponsors yet</Link>
        {lanes.map((l) => (
          <Link key={l} href={href({ lane: lane === l ? null : l })} className={`rounded-md px-3 py-1.5 ${lane === l ? "bg-fg text-white" : "border border-line hover:border-fg"}`}>{l}</Link>
        ))}
      </div>

      <ScoutBoard candidates={candidates} tab={tab} />
      <ScoutQueries queries={qs} />
    </main>
  );
}
