"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrinterMachine } from "@/components/PrinterMachine";
import { unlockAudio, playChunk, playPrint } from "@/lib/print-sound";

// The first thing a new manager does: name a creator they represent. The
// printer looks them up, then goes looking for their neighborhood: three
// adjacent creators, printed for free, revealed one card at a time as the
// prints come out. It should feel like pulling a receipt, not a slot machine:
// anticipation, a reveal, a number that counts up, and a reason to keep going.

type Roster = { id: string; name: string; handle: string; platform: string; followers: number | null; avatar_url: string | null; bio: string | null };
type Cand = { platform: string; handle: string; display_name: string; avatar_url: string | null; followers: number | null; reason: string; print_status: string; brands: number; top: string[] };
type Hood = { id: string; status: string; error?: string | null; candidates: Cand[] };

const fmt = (n: number | null | undefined) => (n == null ? "" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export function Start({ initialRoster, isHouse }: { initialRoster: Roster[]; isHouse: boolean }) {
  const [platform, setPlatform] = useState<"youtube" | "instagram">("instagram");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roster, setRoster] = useState<Roster[]>(initialRoster);
  const [hoods, setHoods] = useState<Record<string, Hood>>({});
  const [active, setActive] = useState<string | null>(null);   // roster id being explored
  const pollers = useRef<Record<string, any>>({});

  async function add() {
    unlockAudio(); playChunk();
    setBusy(true); setErr(null);
    const r = await fetch("/api/roster", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform, handle }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Couldn't add"); return; }
    setHandle("");
    setRoster((rs) => (rs.some((x) => x.id === j.creator.id) ? rs : [j.creator, ...rs]));
    explore(j.creator.id);
  }

  async function explore(rosterId: string, again = false) {
    setActive(rosterId);
    const r = await fetch(`/api/neighborhood${again ? "?again=1" : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rosterCreatorId: rosterId }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn't start"); return; }
    setHoods((h) => ({ ...h, [rosterId]: { id: j.id, status: j.status, candidates: [] } }));
    poll(rosterId, j.id);
  }

  function poll(rosterId: string, hoodId: string) {
    clearInterval(pollers.current[rosterId]);
    const tick = async () => {
      const r = await fetch(`/api/neighborhood?id=${hoodId}`);
      if (!r.ok) return;
      const j: Hood = await r.json();
      setHoods((h) => {
        const prev = h[rosterId];
        const newlyPrinted = j.candidates.filter((c) => c.print_status === "done").length - (prev?.candidates.filter((c) => c.print_status === "done").length || 0);
        if (newlyPrinted > 0) playPrint(8, 1400);
        return { ...h, [rosterId]: j };
      });
      const allDone = j.status === "done" && j.candidates.every((c) => c.print_status === "done" || c.print_status === "failed");
      if (j.status === "failed" || allDone) clearInterval(pollers.current[rosterId]);
    };
    tick();
    pollers.current[rosterId] = setInterval(tick, 3500);
  }
  useEffect(() => () => Object.values(pollers.current).forEach(clearInterval), []);

  const current = active ? roster.find((r) => r.id === active) : null;
  const hood = active ? hoods[active] : null;
  const printing = !!hood && (hood.status !== "done" || hood.candidates.some((c) => c.print_status !== "done" && c.print_status !== "failed"));
  const lcd = !hood ? (busy ? "LOOKING UP…" : "ADD A CREATOR") : hood.status === "failed" ? "NO NEIGHBORS FOUND" : hood.status !== "done" ? "SCANNING THE LANE…" : printing ? `PRINTING ${hood.candidates.filter((c) => c.print_status === "done").length + 1}/${hood.candidates.length}` : `${hood.candidates.length} NEIGHBORS ✓`;
  const totalBrands = Object.values(hoods).flatMap((h) => h.candidates).reduce((s, c) => s + (c.brands || 0), 0);

  return (
    <div className="st">
      <div className="st-hero">
        <div>
          <div className="label mb-2">Start here</div>
          <h1 className="h1">Who do you represent?</h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">Add a creator. We'll find three others in their lane and print them for free, so you can see who's paying creators like yours before you pitch anyone.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-surface2 p-0.5 font-mono text-[12px]">
              {(["instagram", "youtube"] as const).map((p) => <button key={p} onClick={() => setPlatform(p)} className={`rounded px-3 py-1.5 ${platform === p ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg"}`}>{p === "youtube" ? "YouTube" : "Instagram"}</button>)}
            </div>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handle.trim() && add()} placeholder={platform === "youtube" ? "@channel" : "@username"} className="input-flat !w-56 font-mono" />
            <button onClick={add} disabled={busy || !handle.trim()} className="btn-dark">{busy ? "Looking up…" : "Add to roster"}</button>
          </div>
          {err && <p className="mt-2 text-[12px] text-bad">{err}</p>}
          {roster.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {roster.map((r) => (
                <button key={r.id} onClick={() => (hoods[r.id] ? setActive(r.id) : explore(r.id))} className={`st-chip ${active === r.id ? "st-chip-on" : ""}`}>
                  {r.avatar_url ? <img src={r.avatar_url} alt="" /> : <span className="st-chip-blank" />}
                  <span>{r.name}</span>
                  {hoods[r.id]?.status === "done" && <em>{hoods[r.id].candidates.length}</em>}
                </button>
              ))}
              <Link href="/creators" className="st-chip st-chip-ghost">edit roster →</Link>
            </div>
          )}
        </div>
        <div className="st-machine">
          <PrinterMachine lcd={lcd} printing={busy || printing} />
          {totalBrands > 0 && <div className="st-counter"><b>{totalBrands}</b> brands found in your lane so far</div>}
        </div>
      </div>

      {current && (
        <section className="st-hood">
          <div className="st-hood-head">
            <div className="flex items-center gap-3">
              {current.avatar_url ? <img src={current.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-fg" /> : <div className="h-12 w-12 rounded-full bg-surface2" />}
              <div>
                <div className="text-[17px] font-semibold tracking-tight">{current.name}'s neighborhood</div>
                <div className="num text-[11px] text-muted">@{current.handle} · {fmt(current.followers)} · {current.platform === "youtube" ? "YouTube" : "Instagram"}</div>
              </div>
            </div>
            {hood?.status === "done" && <button onClick={() => explore(current.id, true)} className="btn-ghost !py-1.5 !text-[12px]">find three more ↻</button>}
          </div>

          <div className="st-cards">
            {(hood?.candidates.length ? hood.candidates : [0, 1, 2].map(() => null)).map((c, i) => (
              <div key={c ? c.handle : `blank-${i}`} className={`st-card ${c ? "st-card-in" : ""} ${c?.print_status === "done" ? "st-card-done" : ""}`} style={{ animationDelay: `${i * 220}ms` }}>
                {!c ? (
                  <div className="st-card-wait"><span className="st-dots"><i /><i /><i /></span>{hood?.status === "failed" ? "nothing close enough" : "searching the lane"}</div>
                ) : (
                  <>
                    <div className="st-card-top">
                      {c.avatar_url ? <img src={c.avatar_url} alt="" /> : <span className="st-chip-blank" style={{ width: 56, height: 56 }} />}
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold tracking-tight">{c.display_name}</div>
                        <div className="num truncate text-[11px] text-muted">@{c.handle} · {fmt(c.followers)}</div>
                      </div>
                    </div>
                    <p className="st-why">{c.reason}</p>
                    <div className="st-card-print">
                      {c.print_status === "done" ? (
                        <>
                          <div className="st-brands"><b className="st-count">{c.brands}</b> brands</div>
                          {c.top.length > 0 && <div className="num truncate text-[11px] text-muted">{c.top.join(" · ")}</div>}
                          <Link href={`/c/${c.platform}/${c.handle}`} className="st-open">open the print →</Link>
                        </>
                      ) : c.print_status === "failed" ? (
                        <div className="num text-[11px] text-dim">print failed</div>
                      ) : (
                        <div className="st-printing"><span className="st-dots"><i /><i /><i /></span>{c.print_status === "rate_limited" ? "waiting on the platform" : "printing"}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {hood?.status === "done" && hood.candidates.every((c) => c.print_status === "done") && (
            <div className="st-next">
              <span><b>Step 3.</b> Open the print with the most brands, pick one, and hit Pitch. The email lands in your Gmail drafts with {current.name} as the creator.</span>
              {(() => { const best = [...hood.candidates].sort((a, b) => (b.brands || 0) - (a.brands || 0))[0]; return best ? <Link href={`/c/${best.platform}/${best.handle}?pitch=${current.id}`} className="btn-dark !py-1.5 !text-[12px]">pitch from {best.display_name}'s print →</Link> : <Link href="/brands?scope=mine" className="btn-dark !py-1.5 !text-[12px]">every brand across these prints →</Link>; })()}
            </div>
          )}
        </section>
      )}

      {!current && roster.length === 0 && (
        <p className="mt-10 text-center num text-[11px] text-dim">{isHouse ? "House account: this also works from My creators (find neighbors on any roster row)." : "You can skip this and search any creator from the home page."} <Link href="/" className="hover:text-accent">Skip for now →</Link></p>
      )}
    </div>
  );
}
