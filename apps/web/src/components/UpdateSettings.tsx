"use client";
import { useState } from "react";
export function UpdateSettings({ r, disabled }: { r: { id: string; name: string; handle: string; creator_email: string | null; monthly_update: boolean; update_show_money: boolean; update_show_early: boolean }; disabled: boolean }) {
  const [on, setOn] = useState(r.monthly_update);
  const [email, setEmail] = useState(r.creator_email || "");
  const [money, setMoney] = useState(r.update_show_money);
  const save = (patch: any) => fetch("/api/updates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rosterCreatorId: r.id, ...patch }) });
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <label className="flex items-center gap-2 text-[14px] font-medium"><input type="checkbox" checked={on} disabled={disabled} onChange={(e) => { setOn(e.target.checked); save({ monthly_update: e.target.checked }); }} />{r.name}</label>
      <span className="num text-[10.5px] text-muted">@{r.handle}</span>
      <input value={email} disabled={disabled} onChange={(e) => setEmail(e.target.value)} onBlur={() => save({ creator_email: email })} placeholder="creator's email" className="input-flat !w-60 !py-1 text-[12px]" />
      <label className="num flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" checked={money} disabled={disabled} onChange={(e) => { setMoney(e.target.checked); save({ update_show_money: e.target.checked }); }} />show dollar amounts</label>
    </div>
  );
}
