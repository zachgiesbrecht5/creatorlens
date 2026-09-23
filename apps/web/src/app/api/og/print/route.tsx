import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { publicPrint, fmtK, monthLabel } from "@/lib/public-print";

export const runtime = "nodejs";

// The print as a 1200x630 image: receipt on the right, headline on the left.
export async function GET(req: NextRequest) {
  try {
  const platform = req.nextUrl.searchParams.get("platform") || "youtube";
  const handle = req.nextUrl.searchParams.get("handle") || "";
  const d = await publicPrint(platform, handle);
  const name = d?.creator.display_name || `@${handle}`;
  const rows = (d?.brands || []).slice(0, 7);
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", background: "#0b0d12", color: "#fff", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "56px 48px", width: 560 }}>
          <div style={{ fontSize: 20, letterSpacing: 4, color: "#8b93a1" }}>SPONSORPRINT</div>
          <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.05, marginTop: 18, letterSpacing: -1.5 }}>{name}'s sponsor print</div>
          <div style={{ fontSize: 24, color: "#c9ced6", marginTop: 18, lineHeight: 1.35 }}>Every brand that has publicly paid them, on one receipt.</div>
          <div style={{ display: "flex", gap: 36, marginTop: 34 }}>
            <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 46, fontWeight: 700 }}>{d?.brands.length ?? 0}</div><div style={{ fontSize: 16, color: "#8b93a1" }}>brands</div></div>
            <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 46, fontWeight: 700 }}>{d?.deals ?? 0}</div><div style={{ fontSize: 16, color: "#8b93a1" }}>deals</div></div>
            <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 46, fontWeight: 700, color: "#3ddc84" }}>{d?.repeats ?? 0}</div><div style={{ fontSize: 16, color: "#8b93a1" }}>repeat</div></div>
          </div>
          <div style={{ fontSize: 16, color: "#5b6472", marginTop: 30 }}>sponsorprint.com/p/{platform}/{handle}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 560, margin: "40px 40px 0 40px", background: "#fbfbfa", color: "#0b0d12", padding: "26px 28px", fontFamily: "Menlo, Courier, monospace", borderRadius: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#8b93a1" }}><span>sponsorprint</span><span>{platform === "youtube" ? "YouTube" : "Instagram"} · {fmtK(d?.creator.followers)}</span></div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, fontFamily: "Helvetica, Arial, sans-serif", letterSpacing: -0.5 }}>@{handle}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8b93a1", marginTop: 14, borderBottom: "1px dashed #cfd3d9", paddingBottom: 6 }}><span>brand</span><span>last</span></div>
          {rows.map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 19, marginTop: 11 }}>
              <span style={{ display: "flex", gap: 8 }}>{b.name}{b.repeat && <span style={{ fontSize: 11, color: "#0e6b45", paddingTop: 5 }}>repeat</span>}</span>
              <span style={{ color: "#5b6472" }}>{monthLabel(b.last)}</span>
            </div>
          ))}
          {d && d.brands.length > rows.length && <div style={{ fontSize: 14, color: "#8b93a1", marginTop: 12 }}>+ {d.brands.length - rows.length} more</div>}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  } catch (e: any) {
    console.error("og/print failed", e?.message);
    return new ImageResponse(<div style={{ width: 1200, height: 630, display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0d12", color: "#fff", fontSize: 40 }}>Sponsorprint</div>, { width: 1200, height: 630 });
  }
}
