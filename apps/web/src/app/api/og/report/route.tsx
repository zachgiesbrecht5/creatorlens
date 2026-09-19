import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import { monthlyReport } from "@/lib/report";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const r = await monthlyReport(month);
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: "#0b0d12", color: "#fff", padding: 56, fontFamily: "Helvetica, Arial, sans-serif" }}>
        <div style={{ fontSize: 20, letterSpacing: 4, color: "#8b93a1" }}>SPONSORPRINT INDEX · {r.label.toUpperCase()}</div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5, marginTop: 14, lineHeight: 1.05 }}>Most active creator sponsors</div>
        <div style={{ display: "flex", gap: 40, marginTop: 30 }}>
          <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 46, fontWeight: 700 }}>{r.deals}</div><div style={{ fontSize: 16, color: "#8b93a1" }}>disclosed deals</div></div>
          <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 46, fontWeight: 700 }}>{r.brands}</div><div style={{ fontSize: 16, color: "#8b93a1" }}>brands</div></div>
          <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 46, fontWeight: 700 }}>{r.creators}</div><div style={{ fontSize: 16, color: "#8b93a1" }}>creators</div></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 34, gap: 10 }}>
          {r.top.slice(0, 5).map((b, i) => <div key={b.brand_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 26, borderBottom: "1px solid #232733", paddingBottom: 8 }}><span><span style={{ color: "#5b6472", marginRight: 16 }}>{i + 1}</span>{b.brand}</span><span style={{ color: "#8b93a1", fontSize: 20 }}>{b.creators} creators · {b.deals} deals</span></div>)}
        </div>
        <div style={{ marginTop: "auto", fontSize: 16, color: "#5b6472" }}>sponsorprint.com/reports/{month}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
