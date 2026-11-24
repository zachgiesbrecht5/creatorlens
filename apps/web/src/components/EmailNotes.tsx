import type { EmailNotes as Notes } from "@/lib/email-notes";

// For a first email to this creator: three kinds of real detail, each with a link.
// No drafted sentence on purpose. Pick one, open it, and write the line yourself.
const when = (d: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

export function EmailNotes({ notes, firstName, stale }: { notes: Notes; firstName: string; stale: boolean }) {
  const empty = !notes.series.length && !notes.said.length && !notes.recent.length;
  return (
    <div className="ms-block" data-tour="email-notes">
      <div className="ms-head"><span className="label">Email notes</span><span className="num text-[10.5px] text-dim">one real detail for a first email to {firstName}. Pick one, open it, write the line yourself.</span></div>
      {empty ? <div className="text-[12px] text-muted">Nothing specific enough yet.{stale ? " Re-print to pull recent posts." : ""}</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {notes.series.length > 0 && <div>
            <div className="num text-[10px] text-dim" style={{ marginBottom: 4 }}>A SERIES THEY REPEAT</div>
            {notes.series.map((s) => (
              <div key={s.label} className="text-[12.5px]" style={{ marginBottom: 5 }}>
                <span>“{s.label}”</span> <span className="num text-[10px] text-muted">{s.count} posts</span>{" "}
                {s.urls.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="num text-[10.5px] text-accent hover:underline" style={{ marginLeft: 4 }}>{i === 0 ? "open ↗" : `${i + 1} ↗`}</a>)}
              </div>
            ))}
          </div>}
          {notes.said.length > 0 && <div>
            <div className="num text-[10px] text-dim" style={{ marginBottom: 4 }}>SOMETHING THEY SAID</div>
            {notes.said.map((s) => (
              <div key={s.url} className="text-[12.5px]" style={{ marginBottom: 5 }}>
                <span>“{s.text}”</span> <a href={s.url} target="_blank" rel="noreferrer" className="num text-[10.5px] text-accent hover:underline">watch ↗</a>
              </div>
            ))}
            <div className="num text-[10px] text-muted">Transcribed automatically. Watch it before you quote it.</div>
          </div>}
          {notes.recent.length > 0 && <div>
            <div className="num text-[10px] text-dim" style={{ marginBottom: 4 }}>A RECENT EVERYDAY POST</div>
            {notes.recent.map((r) => (
              <div key={r.url} className="text-[12.5px]" style={{ marginBottom: 5 }}>
                <span>“{r.hook}”</span> <span className="num text-[10px] text-muted">{r.kind} · {when(r.date)}</span>{" "}
                <a href={r.url} target="_blank" rel="noreferrer" className="num text-[10.5px] text-accent hover:underline">open ↗</a>
              </div>
            ))}
          </div>}
        </div>
      )}
      {!empty && stale && <div className="num text-[10px] text-muted" style={{ marginTop: 6 }}>Re-print to add links to the series and pull recent everyday posts.</div>}
    </div>
  );
}
